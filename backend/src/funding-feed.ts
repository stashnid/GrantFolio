import { createHash } from "node:crypto";
import type { GrantCatalogEntry } from "./grant-catalog-data.js";

export const BUSINESS_FEED_URL = "https://www.prostir.ua/feed/?post_type=grants";
const MAX_BYTES = 4 * 1024 * 1024;
type XmlNode = { name: string; parts: (XmlNode | string)[] };

function decode(value: string, strict = false): string {
  return value.replace(/&([^;\s]{1,32});|&/g, (all, entity: string | undefined) => {
    const basic: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (entity && basic[entity] !== undefined && (!strict || entity !== "nbsp")) return basic[entity];
    if (entity && /^#(?:\d+|x[0-9a-f]+)$/i.test(entity)) {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)) return String.fromCodePoint(code);
    }
    if (strict) throw Error("invalid_feed_entity");
    return all;
  });
}

// Intentionally supports RSS/XML only: no DTD, entity declarations, or external resources.
function parseXml(xml: string): XmlNode {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml)) throw Error("unsafe_feed_xml");
  const document: XmlNode = { name: "#document", parts: [] };
  const stack = [document];
  const tokens = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/gy;
  let position = 0, count = 0;
  while (position < xml.length) {
    tokens.lastIndex = position;
    const match = tokens.exec(xml);
    if (!match || ++count > 100000) throw Error("invalid_feed_xml");
    const token = match[0]; position = tokens.lastIndex;
    if (token.startsWith("<!--")) { if (token.slice(4, -3).includes("--")) throw Error("invalid_feed_xml"); continue; }
    if (token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) {
      if (stack.length === 1) throw Error("invalid_feed_xml");
      stack.at(-1)!.parts.push(token.slice(9, -3)); continue;
    }
    if (token.startsWith("</")) {
      const end = token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);
      if (!end || stack.length < 2 || stack.pop()!.name !== end[1]) throw Error("invalid_feed_xml");
    } else if (token.startsWith("<")) {
      const start = token.match(/^<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>$/);
      if (!start || stack.length > 32) throw Error("invalid_feed_xml");
      const attributes = new Set<string>();
      for (const attr of start[2].matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (attributes.has(attr[1])) throw Error("invalid_feed_xml");
        attributes.add(attr[1]); decode(attr[2] ?? attr[3], true);
      }
      const node: XmlNode = { name: start[1], parts: [] };
      stack.at(-1)!.parts.push(node);
      if (!start[3]) stack.push(node);
    } else {
      if (token.includes("]]>")) throw Error("invalid_feed_xml");
      stack.at(-1)!.parts.push(decode(token, true));
    }
  }
  if (stack.length !== 1) throw Error("invalid_feed_xml");
  const roots = document.parts.filter((part): part is XmlNode => typeof part !== "string");
  if (roots.length !== 1 || roots[0].name !== "rss" || document.parts.some(part => typeof part === "string" && part.trim())) throw Error("invalid_feed_rss");
  return roots[0];
}
function children(node: XmlNode, name: string): XmlNode[] {
  return node.parts.filter((part): part is XmlNode => typeof part !== "string" && part.name === name);
}
function text(node: XmlNode): string { return node.parts.map(part => typeof part === "string" ? part : text(part)).join(" "); }
function field(node: XmlNode, name: string): string { return children(node, name).map(text).join(" "); }
function plain(value: string, max: number): string {
  return decode(decode(value)).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["prostir.ua", "www.prostir.ua"].includes(url.hostname) || url.username || url.password || url.port || value.length > 2048) return null;
    url.hostname = "www.prostir.ua"; url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}
function entryFor(title: string, summary: string, url: string, id: string, checkedAt = new Date().toISOString().slice(0, 10)): GrantCatalogEntry {
  const caution = "Знайдено в агрегаторі. Право українського бізнесу, офіційного донора та чинний прийом потрібно перевірити.";
  return {
    id, title, summary, provider: "Не перевірено; джерело оголошення — Громадський Простір",
    amount: "Сума потребує перевірки у донора", deadline: "Дедлайн потребує перевірки у донора",
    category: "international", categoryLabel: "Міжнародні програми", targetAudience: caution,
    keyCondition: caution, eligibleCosts: [], officialUrl: url, checkedAt,
    intakeStatus: "unconfirmed", reviewStatus: "needs-review", programKind: "call",
    eligibilityUkraine: caution, tags: ["Автоматично знайдено", "Агрегатор", "Потребує перевірки"],
    searchTerms: [title],
    details: {
      overview: summary, eligibility: [caution], exclusions: [], funding: ["Сума і тип фінансування не підтверджені офіційним донором."],
      costs: [], obligations: ["Умови повернення, звітності та співфінансування потрібно перевірити."], documents: [],
      steps: ["Знайти офіційне оголошення донора та перевірити умови участі до підготовки заявки."],
      timing: ["Дата перевірки означає читання агрегатора, а не перевірку дедлайну."],
      pitfalls: ["Оголошення агрегатора не підтверджує доступність фінансування для українського бізнесу."],
      sources: [
        { title: "Громадський Простір — агрегатор, оголошення не перевірено у донора", url, checkedAt },
        { title: "RSS конкурсів Громадського Простору — джерело автоматичного виявлення", url: BUSINESS_FEED_URL, checkedAt },
      ], unresolved: [caution, "Офіційна сторінка донора, тип і сума фінансування, дедлайн, витрати та зобов’язання."],
    },
  };
}

export async function fetchBusinessFeed(fetchImpl: typeof fetch = fetch): Promise<{ externalId: string; entry: GrantCatalogEntry }[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(Error("business_feed_timeout")); }, 10000);
  });
  const work = async () => {
    const response = await fetchImpl(BUSINESS_FEED_URL, { signal: controller.signal, redirect: "error", headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "GrantFolio/1.0 funding-monitor" } });
    if (!response.ok || response.redirected || (response.url && response.url !== BUSINESS_FEED_URL)) throw Error("business_feed_http");
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) { await response.body?.cancel(); throw Error("business_feed_too_large"); }
    const reader = response.body?.getReader();
    if (!reader) throw Error("business_feed_empty");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, xml = "";
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) { await reader.cancel(); throw Error("business_feed_too_large"); }
        xml += decoder.decode(chunk.value, { stream: true });
      }
      xml += decoder.decode();
    } finally { reader.releaseLock(); }
    const rss = parseXml(xml), channels = children(rss, "channel");
    if (channels.length !== 1) throw Error("invalid_feed_rss");
    const seen = new Set<string>();
    const results: { externalId: string; entry: GrantCatalogEntry }[] = [];
    for (const item of children(channels[0], "item").slice(0, 100)) {
      const title = plain(field(item, "title"), 600), description = plain(field(item, "description"), 4000);
      const url = canonicalUrl(field(item, "link"));
      // Descriptions are article excerpts, never the entire feed or publisher navigation.
      const wording = `${title} ${description}`;
      if (!url || !title || seen.has(url) || !/(?:business|entrepreneur|\bSMEs?\b|бізнес|підприєм|ФОП|фермер)/iu.test(wording)
        || /тендер|закупівл|procurement|invitation to bid/iu.test(title)) continue;
      seen.add(url);
      const externalId = createHash("sha256").update(url).digest("hex").slice(0, 24);
      results.push({ externalId, entry: entryFor(title, description || cautionFallback, url, `discovery-prostir-${externalId}`) });
    }
    return results;
  };
  try { return await Promise.race([work(), timeout]); } finally { clearTimeout(timer!); }
}
const cautionFallback = "Оголошення з агрегатора; офіційні умови ще не перевірено.";

/** Reconstruct an untrusted stored candidate; never hydrate arbitrary JSONB fields. */
export function validateStoredBusinessFeed(value: unknown): { externalId: string; entry: GrantCatalogEntry } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!row.entry || typeof row.entry !== "object" || Array.isArray(row.entry)) return null;
  const stored = row.entry as Record<string, unknown>;
  if (typeof stored.officialUrl !== "string" || typeof stored.title !== "string" || typeof stored.summary !== "string"
    || typeof stored.checkedAt !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(stored.checkedAt)
    || !Number.isFinite(Date.parse(stored.checkedAt)) || stored.title.length > 600 || stored.summary.length > 4000
    || !stored.title || plain(stored.title, 600) !== stored.title || plain(stored.summary, 4000) !== stored.summary) return null;
  const url = canonicalUrl(stored.officialUrl);
  if (!url || url !== stored.officialUrl || !/(?:business|entrepreneur|\bSMEs?\b|бізнес|підприєм|ФОП|фермер)/iu.test(`${stored.title} ${stored.summary}`)
    || /тендер|закупівл|procurement|invitation to bid/iu.test(stored.title)) return null;
  const externalId = createHash("sha256").update(url).digest("hex").slice(0, 24);
  if (row.externalId !== externalId || stored.id !== `discovery-prostir-${externalId}`) return null;
  return { externalId, entry: entryFor(stored.title, stored.summary, url, stored.id as string, stored.checkedAt) };
}
