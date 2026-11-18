import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMimeMessage,
  escapeHtml,
  renderGrantDigestEmail,
  renderLoginCodeEmail,
  selectDigestPrograms,
} from "../src/email-templates.js";

test("escapeHtml escapes dangerous HTML characters", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'test'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;",
  );
});

test("buildMimeMessage builds multipart/alternative with text and html and blocks CRLF injection", () => {
  const raw = buildMimeMessage({
    from: "GrantFolio <grantfoliomanager@gmail.com>",
    to: "user@example.com",
    subject: "[GrantFolio] Тестовий лист",
    text: "Привіт",
    html: "<p>Привіт</p>",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
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

test("renderGrantDigestEmail escapes profile input and renders styled HTML with verified programs", () => {
  const programs = selectDigestPrograms({
    industry: "Громадське харчування",
    region: "Львівська область",
    legalForm: "fop",
  });
  assert.ok(programs.length >= 1);

  const rendered = renderGrantDigestEmail(
    {
      recipientName: "Станіслав <script>",
      businessName: 'Кав\'ярня "Смак"',
      industry: "Громадське харчування",
      region: "Львівська область",
      legalForm: "fop",
      requestedAmount: "250 000",
    },
    programs,
  );

  assert.match(rendered.subject, /GrantFolio/);
  assert.ok(!rendered.html.includes("<script>"));
  assert.ok(rendered.html.includes("Станіслав &lt;script&gt;"));
  assert.ok(rendered.html.includes("Персональний дайджест"));
  assert.ok(rendered.html.includes("Підготувати заявку в GrantFolio"));
  assert.ok(rendered.html.includes("https://grantfolio.pp.ua/#grants/"));
  assert.ok(rendered.text.includes("Вітаємо, Станіслав <script>!"));
});

test("renderLoginCodeEmail renders branded HTML and plain text with the 6-digit code", () => {
  const rendered = renderLoginCodeEmail("482910");
  assert.equal(rendered.subject, "Код підтвердження входу — GrantFolio");
  assert.ok(rendered.html.includes("482910"));
  assert.ok(rendered.html.includes("GrantFolio"));
  assert.ok(rendered.html.includes("10 хвилин"));
  assert.ok(rendered.text.includes("482910"));
});
