import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { confirmsMonobankPayment, DefinitiveInvoiceRejection, monobankAcquiring, parseSignedMonobankEvent, validMonobankSignature } from "./monobank-acquiring.js";

const amount = 500;
type Acquiring = ReturnType<typeof monobankAcquiring>;
export type PaymentConfig = { client: Acquiring; baseUrl: string };

function modifiedDateNanoseconds(value: string): bigint {
  const fraction = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] ?? "";
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, "");
  return BigInt(Date.parse(wholeSecond)) * 1_000_000n + BigInt((fraction + "000000000").slice(0, 9));
}

const statusQuery = `SELECT c.program_id, p.reference, p.confirmed_at, p.acquiring_payment_url, p.acquiring_creation_started_at, p.acquiring_status FROM cases c
  LEFT JOIN grant_preparation_pilot p ON p.case_id=c.id AND p.program_id=c.program_id
  WHERE c.id=$1 AND c.owner_id=$2`;

function present(row: { reference: string | null; confirmed_at: Date | null; acquiring_payment_url: string | null; acquiring_creation_started_at: Date | null; acquiring_status: string | null }) {
  const terminal = ["expired", "reversed"].includes(row.acquiring_status ?? "");
  const state = row.confirmed_at ? "active" : terminal ? "terminal" : !row.reference || !row.acquiring_creation_started_at ? "standard" : "pending";
  return { state, reference: row.reference, paymentUrl: row.confirmed_at || terminal ? null : row.acquiring_payment_url,
    paymentStatus: terminal ? row.acquiring_status : null };
}

export function grantPreparationPilotRouter(db: Pool, payment?: PaymentConfig) {
  const router = Router();

  router.get("/:id/preparation-access", async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.sendStatus(404); return; }
    try {
      const { rows: [row] } = await db.query(statusQuery, [req.params.id, res.locals.uid]);
      if (!row) { res.sendStatus(404); return; }
      res.json(present(row));
    } catch (error) { next(error); }
  });

  router.post("/:id/preparation-access", async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.sendStatus(404); return; }
    if (!payment) { res.status(503).json({ error: "payment_unavailable" }); return; }
    try {
      // UPSERT serializes reservation attempts without keeping a connection during HTTP.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { rows: [row] } = await db.query(
          `INSERT INTO grant_preparation_pilot (case_id, program_id)
           SELECT id, program_id FROM cases WHERE id=$1 AND owner_id=$2 AND program_id='vlasna-sprava'
           ON CONFLICT (case_id, program_id) DO UPDATE SET case_id=EXCLUDED.case_id
           RETURNING reference, confirmed_at, acquiring_payment_url, acquiring_creation_started_at, acquiring_status, acquiring_invoice_id`,
          [req.params.id, res.locals.uid]);
        if (!row) { res.sendStatus(404); return; }
        if (row.confirmed_at) { res.json(present(row)); return; }
        if (row.acquiring_invoice_id) {
          let event;
          try { event = await payment.client.getStatus(row.acquiring_invoice_id); }
          catch { res.status(503).json({ error: "payment_unavailable" }); return; }
          if (event.invoiceId !== row.acquiring_invoice_id || event.reference !== row.reference ||
              event.amount !== amount || event.ccy !== 980 ||
              (event.status === "success" && !confirmsMonobankPayment(event, { invoiceId: row.acquiring_invoice_id, reference: row.reference, amount }))) {
            res.status(503).json({ error: "payment_unavailable" }); return;
          }
          await recordEvent(db, event);
          const fresh = await db.query(statusQuery, [req.params.id, res.locals.uid]);
          if (!fresh.rowCount) { res.sendStatus(404); return; }
          if (!fresh.rows[0].confirmed_at && ["expired", "reversed"].includes(fresh.rows[0].acquiring_status)) {
            // Keep the invoice/reference association for late events and operator reconciliation.
            res.status(409).json({ error: "payment_terminal", paymentStatus: fresh.rows[0].acquiring_status }); return;
          }
          res.json(present(fresh.rows[0])); return;
        }
        if (row.acquiring_creation_started_at) { res.status(503).json({ error: "payment_unavailable" }); return; }
        // DELETE locks the same parent row before its trigger checks for a checkout.
        const connection = await db.connect();
        let reserved;
        try {
          await connection.query("BEGIN");
          const owned = await connection.query("SELECT id FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE", [req.params.id, res.locals.uid]);
          if (!owned.rowCount) { await connection.query("ROLLBACK"); res.sendStatus(404); return; }
          reserved = await connection.query(`UPDATE grant_preparation_pilot SET acquiring_creation_started_at=clock_timestamp()
            WHERE reference=$1 AND case_id=$2 AND acquiring_creation_started_at IS NULL AND confirmed_at IS NULL
            RETURNING acquiring_creation_started_at`, [row.reference, req.params.id]);
          await connection.query("COMMIT");
        } catch (error) {
          await connection.query("ROLLBACK").catch(() => {});
          throw error;
        } finally { connection.release(); }
        if (!reserved.rowCount) continue;
        let invoice;
        try {
          invoice = await payment.client.createInvoice({ reference: row.reference, amount,
            redirectUrl: payment.baseUrl, webHookUrl: new URL("/api/monobank/acquiring/webhook", payment.baseUrl).href });
        } catch (error) {
          // Only an explicit provider rejection proves that no invoice was created.
          if (error instanceof DefinitiveInvoiceRejection) await db.query(`UPDATE grant_preparation_pilot
            SET acquiring_creation_started_at=NULL WHERE reference=$1 AND acquiring_invoice_id IS NULL
            AND acquiring_creation_started_at IS NOT NULL`, [row.reference]);
          res.status(503).json({ error: "payment_unavailable" }); return;
        }
        const saved = await db.query(`UPDATE grant_preparation_pilot SET acquiring_invoice_id=$2, acquiring_payment_url=$3
          WHERE reference=$1 AND (acquiring_invoice_id IS NULL OR acquiring_invoice_id=$2)
          RETURNING reference, confirmed_at, acquiring_payment_url, acquiring_creation_started_at, acquiring_status`,
          [row.reference, invoice.invoiceId, invoice.pageUrl]);
        if (!saved.rowCount) { res.status(503).json({ error: "payment_unavailable" }); return; }
        res.json(present(saved.rows[0])); return;
      }
      res.status(503).json({ error: "payment_unavailable" });
    } catch (error) { next(error); }
  });

  return router;
}

async function recordEvent(db: Pool, event: ReturnType<typeof parseSignedMonobankEvent>): Promise<boolean> {
  const result = await db.query(`UPDATE grant_preparation_pilot SET
      acquiring_invoice_id=COALESCE(acquiring_invoice_id, $1),
      acquiring_status=$3, acquiring_modified_at=$4,
      acquiring_reversed_at=CASE WHEN $3='reversed' AND bank_operation_id=$1 THEN now() ELSE acquiring_reversed_at END,
      acquiring_reversed_invoice_id=CASE WHEN $3='reversed' AND bank_operation_id=$1 THEN $1 ELSE acquiring_reversed_invoice_id END,
      amount_kopecks=CASE WHEN $3='reversed' AND bank_operation_id=$1 THEN NULL WHEN $3='success' AND confirmed_at IS NULL THEN $5 ELSE amount_kopecks END,
      bank_operation_id=CASE WHEN $3='reversed' AND bank_operation_id=$1 THEN NULL WHEN $3='success' AND confirmed_at IS NULL THEN $1 ELSE bank_operation_id END,
      confirmed_at=CASE WHEN $3='reversed' AND bank_operation_id=$1 THEN NULL WHEN $3='success' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END
    WHERE reference=$2 AND acquiring_creation_started_at IS NOT NULL AND
      (acquiring_invoice_id=$1 OR acquiring_invoice_id IS NULL) AND
      (acquiring_modified_at IS NULL OR acquiring_modified_at < $4::timestamptz OR
        (acquiring_modified_at = $4::timestamptz AND
          (($3='reversed' AND acquiring_status IS DISTINCT FROM 'reversed') OR
           ($3='success' AND acquiring_status NOT IN ('success', 'reversed')))))`,
    [event.invoiceId, event.reference, event.status, event.modifiedDate, amount]);
  if (result.rowCount) return true;
  const existing = await db.query("SELECT 1 FROM grant_preparation_pilot WHERE acquiring_invoice_id=$1 AND reference=$2", [event.invoiceId, event.reference]);
  return !!existing.rowCount;
}

export function monobankWebhookRouter(db: Pool, payment?: PaymentConfig) {
  const router = Router();
  router.post("/", async (req, res, next) => {
    if (!payment) { res.status(503).json({ error: "payment_unavailable" }); return; }
    const signature = req.header("X-Sign");
    if (!Buffer.isBuffer(req.body) || !signature || !validMonobankSignature(signature)) { res.sendStatus(400); return; }
    let key: string;
    try { key = await payment.client.getPublicKey(); }
    catch { res.status(503).json({ error: "payment_unavailable" }); return; }
    let event;
    try { event = parseSignedMonobankEvent(req.body, signature, key); }
    catch {
      try { key = await payment.client.getPublicKey(true); }
      catch { res.sendStatus(503); return; }
      try { event = parseSignedMonobankEvent(req.body, signature, key); }
      catch { res.sendStatus(400); return; }
    }
    try {
      // A newer event wins; manual confirmations are preserved on reversal.
      const valid = event.reference && event.ccy === 980 && event.amount === amount &&
        (event.status !== "success" || confirmsMonobankPayment(event, { invoiceId: event.invoiceId, reference: event.reference, amount }));
      if (!valid) { res.sendStatus(400); return; }
      // A shared signing key alone does not bind an invoice to this merchant.
      const bound = await db.query("SELECT acquiring_invoice_id FROM grant_preparation_pilot WHERE reference=$1 AND acquiring_creation_started_at IS NOT NULL", [event.reference]);
      if (!bound.rowCount) { res.sendStatus(503); return; }
      if (bound.rows[0].acquiring_invoice_id !== event.invoiceId) {
        if (bound.rows[0].acquiring_invoice_id) { res.sendStatus(400); return; }
        let verified;
        try { verified = await payment.client.getStatus(event.invoiceId); }
        catch { res.sendStatus(503); return; }
        if (verified.invoiceId !== event.invoiceId || verified.reference !== event.reference || verified.amount !== amount || verified.ccy !== 980 ||
            (verified.status === "success" && !confirmsMonobankPayment(verified, { invoiceId: event.invoiceId, reference: event.reference!, amount }))) {
          res.sendStatus(400); return;
        }
        const bankTime = modifiedDateNanoseconds(verified.modifiedDate);
        const signedTime = modifiedDateNanoseconds(event.modifiedDate);
        const rank = (status: string) => status === "reversed" ? 2 : status === "success" ? 1 : 0;
        if (bankTime > signedTime || (bankTime === signedTime && rank(verified.status) > rank(event.status))) event = verified;
      }
      const result = await recordEvent(db, event);
      if (!result) { res.sendStatus(503); return; }
      res.sendStatus(200);
    } catch (error) { next(error); }
  });
  return router;
}
