import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMimeMessage,
  escapeHtml,
  renderGrantDigestEmail,
  renderLoginCodeEmail,
  selectDigestPrograms,
} from "../src/email-templates.js";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/newsletter-unsubscribe.js";

test("escapeHtml escapes dangerous HTML characters", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'test'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;",
  );
});

test("buildMimeMessage builds RFC 5322 + RFC 8058 multipart/alternative and blocks CRLF injection", () => {
  const raw = buildMimeMessage({
    from: "GrantFolio <grantfoliomanager@gmail.com>",
    replyTo: "grantfoliomanager@gmail.com",
    to: "user@example.com",
    subject: "Актуальні гранти — GrantFolio",
    text: "Привіт",
    html: "<p>Привіт</p>",
    headers: {
      "List-Id": "GrantFolio Digest <digest.grantfolio.pp.ua>",
      "List-Unsubscribe": "<https://grantfolio.pp.ua/api/newsletter/unsubscribe?token=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    messageIdDomain: "gmail.com",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /Date: .+/);
  assert.match(decoded, /Message-ID: <[a-f0-9-]+@gmail\.com>/);
  assert.match(decoded, /Reply-To: grantfoliomanager@gmail\.com/);
  assert.match(decoded, /Content-Language: uk/);
  assert.match(decoded, /List-Id: GrantFolio Digest <digest\.grantfolio\.pp\.ua>/);
  assert.match(decoded, /List-Unsubscribe: <https:\/\/grantfolio\.pp\.ua\/api\/newsletter\/unsubscribe\?token=abc>/);
  assert.match(decoded, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(decoded, /Content-Type: multipart\/alternative; boundary="gf_[a-f0-9]+"/);
  assert.match(decoded, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(decoded, /Content-Type: text\/html; charset=UTF-8/);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);

  assert.throws(() =>
    buildMimeMessage({
      from: "GrantFolio <grantfoliomanager@gmail.com>",
      to: "user@example.com\r\nBcc: evil@example.com",
      subject: "Test",
      text: "Body",
    }),
  );
});

test("unsubscribe tokens round-trip uid and reject tampering or wrong secret", () => {
  const secret = "a".repeat(48);
  const token = createUnsubscribeToken("firebase-uid-123", secret);
  assert.equal(verifyUnsubscribeToken(token, secret), "firebase-uid-123");
  assert.equal(verifyUnsubscribeToken(`${token.slice(0, -1)}0`, secret), null);
  assert.equal(verifyUnsubscribeToken(token, "b".repeat(48)), null);
  const url = buildUnsubscribeUrl("firebase-uid-123", secret);
  assert.ok(url?.startsWith("https://grantfolio.pp.ua/api/newsletter/unsubscribe?token="));
});

test("renderGrantDigestEmail escapes profile input and emits RFC 8058 unsubscribe headers", () => {
  const secret = "x".repeat(48);
  const unsubscribeUrl = buildUnsubscribeUrl("uid-test-1", secret);
  const programs = [{
    id: "example", title: "Приклад програми", provider: "Організатор",
    amount: "До 100 грн", fundingLabel: "Грант", deadlineLabel: "До 30 листопада",
    reason: "Перевірте умови участі", statusLabel: "Відкритий прийом",
    url: "https://grantfolio.pp.ua/#grants/example",
  }];

  const rendered = renderGrantDigestEmail(
    {
      recipientName: "Станіслав <script>",
      businessName: 'Кав\'ярня "Смак"',
      industry: "Громадське харчування",
      region: "Львівська область",
      legalForm: "fop",
      requestedAmount: "250 000",
      unsubscribeUrl,
    },
    programs,
  );

  assert.match(rendered.subject, /GrantFolio$/);
  assert.ok(!rendered.subject.includes("[GrantFolio]"));
  assert.ok(!rendered.html.includes("<script>"));
  assert.ok(!rendered.html.includes("opacity:0"));
  assert.ok(rendered.html.includes("Станіслав &lt;script&gt;"));
  assert.ok(rendered.html.includes("Персональний дайджест"));
  assert.ok(rendered.html.includes("Переглянути умови програми"));
  assert.ok(rendered.html.includes("https://grantfolio.pp.ua/#grants/"));
  assert.ok(rendered.html.includes("/api/newsletter/unsubscribe?token="));
  assert.ok(rendered.text.includes("Вітаємо, Станіслав <script>!"));
  assert.equal(rendered.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(rendered.headers["List-Unsubscribe"].includes(unsubscribeUrl!));
  assert.equal(rendered.headers["List-Id"], "GrantFolio Digest <digest.grantfolio.pp.ua>");
});

test("renderLoginCodeEmail renders branded HTML and plain text with Auto-Submitted header", () => {
  const rendered = renderLoginCodeEmail("482910");
  assert.equal(rendered.subject, "Код підтвердження входу — GrantFolio");
  assert.ok(rendered.html.includes("482910"));
  assert.ok(rendered.html.includes("GrantFolio"));
  assert.ok(rendered.html.includes("10 хвилин"));
  assert.ok(rendered.text.includes("482910"));
  assert.equal(rendered.headers["Auto-Submitted"], "auto-generated");
  assert.equal(rendered.headers["List-Unsubscribe"], undefined);
});


test("digest does not substitute arbitrary recommendations and explains an empty result", () => {
  assert.deepEqual(selectDigestPrograms({}), []);
  assert.deepEqual(selectDigestPrograms({ industry: "неіснуючийтерміндляперевірки" }), []);
  const email = renderGrantDigestEmail({}, []);
  assert.match(email.text, /не знайдено можливостей/);
  assert.match(email.html, /не знайдено можливостей/);
  assert.doesNotMatch(email.text, /0 актуальні|Чому підходить|відповідають параметрам/);
});
