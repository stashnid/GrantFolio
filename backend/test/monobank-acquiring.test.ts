import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { confirmsMonobankPayment, monobankAcquiring, parseSignedMonobankEvent } from "../src/monobank-acquiring.js";

test("500 kopecks creates a one-time invoice through the acquiring API", async () => {
  const reference = crypto.randomUUID();
  const client = monobankAcquiring("fixture-merchant-token", async (url, request) => {
    assert.equal(url, "https://api.monobank.ua/api/merchant/invoice/create");
    assert.equal(new Headers(request?.headers).get("X-Token"), "fixture-merchant-token");
    assert.equal(request?.redirect, "error");
    const input = JSON.parse(String(request?.body));
    assert.equal(input.amount, 500);
    assert.equal(input.ccy, 980);
    assert.equal(input.paymentType, "debit");
    assert.equal(input.merchantPaymInfo.reference, reference);
    return Response.json({ invoiceId: "fixture", pageUrl: "https://pay.mbnk.biz/fixture" });
  });
  assert.equal((await client.createInvoice({
    reference, amount: 500, redirectUrl: "https://example.test/return", webHookUrl: "https://example.test/webhook",
  })).invoiceId, "fixture");
});

test("authenticates exact webhook bytes and checks full payment identity", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const order = { invoiceId: "fixture", reference: crypto.randomUUID(), amount: 500 };
  const event = { ...order, ccy: 980, finalAmount: 500, status: "success", modifiedDate: "2026-11-18T12:00:00Z" };
  const body = Buffer.from(JSON.stringify(event));
  const signature = sign("sha256", body, privateKey).toString("base64");
  const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const verified = parseSignedMonobankEvent(body, signature, pem);
  assert(confirmsMonobankPayment(verified, order));
  for (const change of [{ amount: 499 }, { finalAmount: 499 }, { ccy: 840 }, { reference: "other" }, { status: "processing" }]) {
    assert(!confirmsMonobankPayment({ ...verified, ...change }, order));
  }
  assert.throws(() => parseSignedMonobankEvent(Buffer.concat([body, Buffer.from(" ")]), signature, pem));
});
