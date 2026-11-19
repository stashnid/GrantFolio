import pg from "pg";
import { z } from "zod";

const [action, target, bankOperationId, amountText] = process.argv.slice(2);
const command = z.enum(["enroll", "confirm"]).parse(action);
const id = z.uuid().parse(target);
const url = z.string().min(1).parse(process.env.DATABASE_URL);
const key = command === "confirm" ? z.string().trim().min(1).max(160).parse(bankOperationId) : null;
const amount = command === "confirm" ? z.literal(500).parse(Number(amountText)) : null;
const db = new pg.Pool({ connectionString: url });
try {
  const result = command === "enroll"
    ? await db.query(`INSERT INTO grant_preparation_pilot(case_id, program_id)
        SELECT id, program_id FROM cases WHERE id=$1 AND program_id='vlasna-sprava'
        ON CONFLICT(case_id, program_id) DO UPDATE SET case_id=EXCLUDED.case_id
        RETURNING reference`, [id])
    : await db.query(`UPDATE grant_preparation_pilot p
        SET bank_operation_id=$2, amount_kopecks=$3, confirmed_at=COALESCE(p.confirmed_at, now())
        FROM cases c WHERE p.case_id=c.id AND p.reference=$1 AND c.program_id=p.program_id
          AND (p.acquiring_creation_started_at IS NULL OR p.acquiring_status IN ('expired', 'reversed', 'success'))
          AND (p.confirmed_at IS NULL OR (p.bank_operation_id=$2 AND p.amount_kopecks=$3))
        RETURNING p.reference`, [id, key, amount]);
  if (!result.rowCount) throw new Error("No eligible pilot application or conflicting confirmation");
  console.log(result.rows[0].reference);
} catch (error) {
  if ((error as { code?: string }).code === "23505") throw new Error("Operation already assigned to another application");
  throw error;
} finally {
  await db.end();
}
