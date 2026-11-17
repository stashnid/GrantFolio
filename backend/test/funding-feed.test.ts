import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS_FEED_URL, fetchBusinessFeed, validateStoredBusinessFeed } from "../src/funding-feed.js";

const item = (title = "Грант для бізнесу", link = "https://www.prostir.ua/?grants=test", description = "Підтримка підприємців") => `<item><title>${title}</title><link>${link.replaceAll("&", "&amp;")}</link><description>${description}</description></item>`;
const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Publisher</title>${items}</channel></rss>`;
const response = (body: string, headers?: HeadersInit): typeof fetch => async () => new Response(body, { headers });

test("RSS business candidates preserve aggregator provenance and unknown eligibility", async () => {
  const result = await fetchBusinessFeed(async (url, options) => {
    assert.equal(url, BUSINESS_FEED_URL); assert.equal(options?.redirect, "error"); assert.ok(options?.signal);
    return new Response(rss(item("<![CDATA[Жінкам & бізнесу <script>alert(1)</script>]]>", undefined, "<![CDATA[<p>Підтримка &amp; розвиток</p>]]>")));
  });
  assert.equal(result.length, 1);
  const entry = result[0].entry;
  assert.equal(entry.title, "Жінкам & бізнесу"); assert.equal(entry.summary, "Підтримка & розвиток");
  assert.equal(entry.reviewStatus, "needs-review"); assert.equal(entry.intakeStatus, "unconfirmed");
  assert.equal(entry.programKind, "call"); assert.equal(entry.availability?.state, undefined);
  assert.equal(entry.fundingType, undefined); assert.equal(entry.planningLimitKopecks, undefined);
  assert.match(entry.id, /^discovery-prostir-[a-f0-9]{24}$/);
  assert.equal(entry.details.sources[1].url, BUSINESS_FEED_URL);
});
test("canonical URLs deduplicate tracking, fragments, and publisher hostname", async () => {
  const result = await fetchBusinessFeed(response(rss(item(undefined, "https://prostir.ua/?utm_source=mail&grants=test#x") + item())));
  assert.equal(result.length, 1); assert.equal(result[0].entry.officialUrl, "https://www.prostir.ua/?grants=test");
  const again = await fetchBusinessFeed(response(rss(item())));
  assert.equal(result[0].externalId, again[0].externalId);
});
test("skips general NGO and education calls and procurement announcements", async () => {
  const body = item("Грант для громадських організацій", undefined, "Розвиток громадянського суспільства")
    + item("Стипендія для студентів", "https://www.prostir.ua/?grants=education", "Освітня програма")
    + item("Тендер для підприємців", "https://www.prostir.ua/?grants=tender")
    + item("SME support", "https://www.prostir.ua/?grants=sme", "Business funding");
  const result = await fetchBusinessFeed(response(rss(body))); assert.equal(result.length, 1); assert.equal(result[0].entry.title, "SME support");
});
test("rejects unsafe article links without fetching them", async () => {
  for (const url of ["http://www.prostir.ua/a", "https://prostir.ua.attacker.test/a", "https://evil.test/", "https://user@prostir.ua/", "javascript:alert(1)", "https://prostir.ua:444/a"]) {
    assert.deepEqual(await fetchBusinessFeed(response(rss(item(undefined, url)))), []);
  }
});
test("malformed XML cannot create partial candidates", async () => {
  for (const body of [rss(item()).replace("</channel>", ""), rss(item()).replace("</item>", "</wrong>"), rss(item()).replace("</rss>", "</rss><rss/>"), rss(item("bad & title")), rss(item("<![CDATA[unfinished")), "<html><body>business</body></html>"]) {
    await assert.rejects(fetchBusinessFeed(response(body)), /invalid_feed/);
  }
});
test("rejects DTD and entity expansion declarations", async () => {
  for (const declaration of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>', '<!ENTITY x "expanded">']) {
    await assert.rejects(fetchBusinessFeed(response(declaration + rss(item()))), /unsafe_feed_xml/);
  }
});
test("bounds received bytes and declared body size", async () => {
  await assert.rejects(fetchBusinessFeed(response("x", { "content-length": "4194305" })), /too_large/);
  await assert.rejects(fetchBusinessFeed(response("x".repeat(4194305))), /too_large/);
});
test("limits scanned items to 100", async () => {
  const body = Array.from({ length: 120 }, (_, i) => item("Business support", `https://www.prostir.ua/?grants=${i}`)).join("");
  assert.equal((await fetchBusinessFeed(response(rss(body)))).length, 100);
});
test("rejects HTTP failures and unexpected redirects", async () => {
  await assert.rejects(fetchBusinessFeed(async () => new Response("error", { status: 503 })), /business_feed_http/);
  await assert.rejects(fetchBusinessFeed(async () => { const result = new Response(rss(item())); Object.defineProperty(result, "redirected", { value: true }); return result; }), /business_feed_http/);
});
test("times out even when injected fetch ignores abort", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = fetchBusinessFeed(async () => new Promise<Response>(() => {}));
  const rejection = assert.rejects(pending, /business_feed_timeout/);
  t.mock.timers.tick(10001); await rejection;
});

test("stored candidates are reconstructed with forced review state and safe provenance", async () => {
  const [record] = await fetchBusinessFeed(response(rss(item())));
  record.entry.intakeStatus = "open"; record.entry.reviewStatus = "curated";
  record.entry.availability = { state: "open", checkedAt: "x", validUntil: "x", sourceUrl: "https://evil.test", evidence: "invented", deadlineAt: null };
  record.entry.details.sources = [];
  const restored = validateStoredBusinessFeed(record)!;
  assert.equal(restored.entry.intakeStatus, "unconfirmed"); assert.equal(restored.entry.reviewStatus, "needs-review");
  assert.equal(restored.entry.availability, undefined); assert.equal(restored.entry.details.sources[1].url, BUSINESS_FEED_URL);
  assert.equal(validateStoredBusinessFeed({ ...record, externalId: "wrong" }), null);
  assert.equal(validateStoredBusinessFeed({ ...record, entry: { ...record.entry, officialUrl: "https://evil.test" } }), null);
  assert.equal(validateStoredBusinessFeed({ ...record, entry: { ...record.entry, title: "<script>x</script> business" } }), null);
});
