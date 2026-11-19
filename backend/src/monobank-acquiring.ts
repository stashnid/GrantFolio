import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";

const api = "https://api.monobank.ua/api/merchant";
const invoiceId = z.string().min(1).max(128);
const createdInvoice = z.object({
  invoiceId,
  pageUrl: z.url().refine(value => {
    const url = new URL(value);
    return url.origin === "https://pay.mbnk.biz" && !url.username && !url.password;
  }),
});
const invoiceStatus = z.object({
  invoiceId,
  status: z.enum(["created", "processing", "hold", "success", "failure", "reversed", "expired"]),
  reference: z.uuid().optional(),
  amount: z.number().int().nonnegative(),
  finalAmount: z.number().int().nonnegative().optional(),
  ccy: z.number().int(),
  modifiedDate: z.iso.datetime({ offset: true }),
});
type InvoiceStatus = z.infer<typeof invoiceStatus>;
type Order = { invoiceId: string; reference: string; amount: number };
const checkoutRequest = z.object({
  reference: z.uuid(),
  amount: z.number().int().positive(),
  redirectUrl: z.url({ protocol: /^https$/ }),
  webHookUrl: z.url({ protocol: /^https$/ }),
});

export class DefinitiveInvoiceRejection extends Error {}

export function validMonobankSignature(signature: string): boolean {
  if (signature.length > 256 || !z.base64().safeParse(signature).success) return false;
  const bytes = Buffer.from(signature, "base64");
  return bytes.length >= 8 && bytes.length <= 80 && bytes[0] === 0x30 && bytes.toString("base64") === signature;
}

export function monobankAcquiring(token: string, request = fetch) {
  if (!token.trim() || /^\d{16}$/.test(token.trim())) throw new Error("Merchant token required");

  let keyCache: { value: string; until: number } | undefined;
  let keyRequest: Promise<string> | undefined;
  let lastForcedRefresh = 0;

  async function call<T>(path: string, schema: z.ZodType<T>, body?: object): Promise<T> {
    const response = await request(api + path, {
      method: body ? "POST" : "GET",
      headers: { "X-Token": token, ...(body && { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (path === "/invoice/create" && [400, 401, 403, 404, 422].includes(response.status)) throw new DefinitiveInvoiceRejection();
      throw new Error(`Monobank HTTP ${response.status}`);
    }
    return schema.parse(await response.json());
  }

  return {
    createInvoice(input: z.input<typeof checkoutRequest>) {
      const { reference, ...checkout } = checkoutRequest.parse(input);
      return call("/invoice/create", createdInvoice, {
        ...checkout,
        ccy: 980,
        paymentType: "debit",
        merchantPaymInfo: { reference, destination: "Підготовка грантової заявки · GrantFolio" },
      });
    },
    getStatus(id: string) {
      return call(`/invoice/status?invoiceId=${encodeURIComponent(invoiceId.parse(id))}`, invoiceStatus);
    },
    async getPublicKey(force = false) {
      if (keyRequest) return keyRequest;
      if (force && lastForcedRefresh && Date.now() - lastForcedRefresh < 60_000) {
        throw new Error("Monobank public key refresh is cooling down");
      }
      if (keyCache && keyCache.until > Date.now() && !force) return keyCache.value;
      if (force) lastForcedRefresh = Date.now();
      keyRequest = (async () => {
        const result = await call("/pubkey", z.object({ key: z.base64() }));
        const value = Buffer.from(result.key, "base64").toString("utf8");
        if (createPublicKey(value).asymmetricKeyType !== "ec") throw new Error("Invalid public key");
        keyCache = { value, until: Date.now() + 60 * 60 * 1000 };
        return value;
      })().finally(() => { keyRequest = undefined; });
      return keyRequest;
    },
  };
}

export function parseSignedMonobankEvent(body: Buffer, signature: string, publicKey: string): InvoiceStatus {
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== "ec" || !validMonobankSignature(signature) ||
      !verify("sha256", body, key, Buffer.from(signature, "base64"))) {
    throw new Error("Invalid monobank signature");
  }
  return invoiceStatus.parse(JSON.parse(body.toString("utf8")));
}

export function confirmsMonobankPayment(event: InvoiceStatus, order: Order): boolean {
  return event.status === "success" && event.ccy === 980 &&
    event.amount === order.amount && event.invoiceId === order.invoiceId &&
    event.reference === order.reference &&
    (event.finalAmount === undefined || event.finalAmount === order.amount);
}
