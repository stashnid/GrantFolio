import { verify } from "node:crypto";
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
  status: z.string(),
  reference: z.string().optional(),
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

export function monobankAcquiring(token: string, request = fetch) {
  if (!token.trim() || /^\d{16}$/.test(token.trim())) throw new Error("Merchant token required");

  async function call<T>(path: string, schema: z.ZodType<T>, body?: object): Promise<T> {
    const response = await request(api + path, {
      method: body ? "POST" : "GET",
      headers: { "X-Token": token, ...(body && { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Monobank HTTP ${response.status}`);
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
    async getPublicKey() {
      const result = await call("/pubkey", z.object({ key: z.base64() }));
      return Buffer.from(result.key, "base64").toString("utf8");
    },
  };
}

export function parseSignedMonobankEvent(body: Buffer, signature: string, publicKey: string): InvoiceStatus {
  if (!z.base64().safeParse(signature).success ||
      !verify("sha256", body, publicKey, Buffer.from(signature, "base64"))) {
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
