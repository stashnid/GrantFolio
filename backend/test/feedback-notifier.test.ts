import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { renderFeedbackNotificationEmail } from "../src/email-templates.js";
import {
  computeFeedbackContentHash,
  dispatchFeedbackNotification,
  resolveFeedbackNotifyRecipients,
  resolveSafeFeedbackWebhookUrl,
  type FeedbackMailSender,
} from "../src/feedback-notifier.js";

function makeFeedbackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "uid-tester-1",
    rating: 4,
    task: "assistant",
    comment: "Добре пояснює вимоги програми, але хотілося б швидший експорт.",
    created_at: "2026-11-18T12:30:00.000Z",
    rating_ux: 4,
    rating_usefulness: 5,
    rating_ai: 4,
    task_outcome: "completed",
    would_recommend: true,
    willingness_to_pay: "monthly_subscription",
    suggested_price_uah: 300,
    category_tags: ["ai-advisor", "export"],
    tester_role: "fop",
    contact_consent: true,
    contact_info: "tester@example.ua",
    context_snapshot: { screen: "advisor", viewportClass: "desktop" },
    business_name: "Кав'ярня Світанок",
    region: "Львівська область",
    ...overrides,
  };
}

function createMockPool(row: Record<string, unknown> | null) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (sql.includes("FROM user_feedback")) {
        return row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] };
      }
      if (sql.includes("RETURNING notified_at")) {
        return {
          rowCount: 1,
          rows: [{ notified_at: "2026-11-18T12:31:00.000Z" }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

test("resolveFeedbackNotifyRecipients parses, deduplicates, filters invalid entries, and falls back to MONITOR_ADMIN_EMAILS", () => {
  const recipients = resolveFeedbackNotifyRecipients({
    FEEDBACK_NOTIFY_EMAILS: ` "Dev@GrantFolio.pp.ua", dev@grantfolio.pp.ua , 'team@example.com', invalid-email, bad\r\n@example.com, ${"a".repeat(250)}@b.co `,
    MONITOR_ADMIN_EMAILS: "fallback@example.com",
  });
  assert.deepEqual(recipients, ["Dev@GrantFolio.pp.ua", "team@example.com"]);

  const fallback = resolveFeedbackNotifyRecipients({
    FEEDBACK_NOTIFY_EMAILS: "   ",
    MONITOR_ADMIN_EMAILS: "admin1@example.com, admin2@example.com",
  });
  assert.deepEqual(fallback, ["admin1@example.com", "admin2@example.com"]);

  assert.deepEqual(resolveFeedbackNotifyRecipients({}), []);
});

test("computeFeedbackContentHash is deterministic and tag-order independent", () => {
  const h1 = computeFeedbackContentHash({
    rating: 5,
    task: "budget",
    comment: "  Точний розрахунок  ",
    taskOutcome: "completed",
    categoryTags: ["budget", "ux"],
    willingnessToPay: "donation_ready",
  });
  const h2 = computeFeedbackContentHash({
    rating: 5,
    task: "budget",
    comment: "Точний розрахунок",
    taskOutcome: "completed",
    categoryTags: ["ux", "budget", "ux"],
    willingnessToPay: "donation_ready",
  });
  const h3 = computeFeedbackContentHash({
    rating: 4,
    task: "budget",
    comment: "Точний розрахунок",
    taskOutcome: "completed",
    categoryTags: ["budget", "ux"],
    willingnessToPay: "donation_ready",
  });
  assert.equal(h1.length, 64);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test("renderFeedbackNotificationEmail escapes HTML, rejects CRLF, applies color-coded rating badges and Ukrainian labels", () => {
  const high = renderFeedbackNotificationEmail({
    id: "11111111-1111-4111-8111-111111111111",
    rating: 5,
    task: "budget",
    comment: `Чудово! <script>alert("xss")</script> & 'ok'`,
    taskOutcome: "completed",
    wouldRecommend: true,
    willingnessToPay: "pay_per_application",
    suggestedPriceUah: 450,
    categoryTags: ["<b>tag</b>"],
    testerRole: "fop",
    contactConsent: true,
    contactInfo: "<img src=x>@example.ua",
    contextSnapshot: { screen: "budget" },
    createdAt: "2026-11-18T12:30:00.000Z",
    adminUrl: "javascript:alert(1)",
    businessName: 'ФОП "Тест" <svg>',
    region: "Київ",
  });

  assert.ok(!high.subject.includes("[GrantFolio]"));
  assert.match(high.subject, /Новий відгук \(5\/5 · Бюджет\) — GrantFolio/);
  assert.ok(!high.html.includes("<script>"));
  assert.ok(!high.html.includes("javascript:alert(1)"));
  assert.ok(high.html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"));
  assert.ok(high.html.includes("#10b981"));
  assert.ok(high.html.includes("Завдання виконано"));
  assert.ok(high.html.includes("Оплата за заявку (450 грн)"));
  assert.ok(high.html.includes("ФОП"));
  assert.ok(high.html.includes("https://grantfolio.pp.ua/#admin/feedback"));
  assert.ok(high.text.includes("Бюджет"));
  assert.ok(high.text.includes("Оплата за заявку (450 грн)"));

  const mid = renderFeedbackNotificationEmail({
    id: "22222222-2222-4222-8222-222222222222",
    rating: 3,
    task: "catalog",
    comment: "Непогано, але бракує фільтрів.",
    contactConsent: false,
    contactInfo: "hidden@example.ua",
    createdAt: "2026-11-18T12:30:00.000Z",
    isUpdate: true,
  });
  assert.match(mid.subject, /^Оновлений відгук \(3\/5 · Каталог грантів\)/);
  assert.ok(mid.html.includes("#d97706"));
  assert.ok(!mid.html.includes("hidden@example.ua"));
  assert.ok(!mid.text.includes("hidden@example.ua"));

  const low = renderFeedbackNotificationEmail({
    id: "33333333-3333-4333-8333-333333333333",
    rating: 1,
    task: "export",
    comment: "Не вдалося завантажити PDF.",
    taskOutcome: "failed",
    createdAt: "2026-11-18T12:30:00.000Z",
  });
  assert.ok(low.html.includes("#dc2626"));
  assert.ok(low.html.includes("Не вдалося виконати"));

  assert.throws(() =>
    renderFeedbackNotificationEmail({
      id: "44444444-4444-4444-8444-444444444444",
      rating: 4,
      task: "custom\r\nBcc: evil@example.com",
      comment: "Test",
      createdAt: "2026-11-18T12:30:00.000Z",
    }),
  );
});

test("dispatchFeedbackNotification sends to all recipients and updates DB status on success", async () => {
  const { pool, queries } = createMockPool(makeFeedbackRow());
  const delivered: Array<{ recipient: string; subject: string; headers?: Record<string, string> }> = [];
  const mailSender: FeedbackMailSender = async (recipient, subject, _text, _html, headers) => {
    delivered.push({ recipient, subject, headers });
    return true;
  };

  const result = await dispatchFeedbackNotification(
    pool,
    "11111111-1111-4111-8111-111111111111",
    {
      mailSender,
      env: { FEEDBACK_NOTIFY_EMAILS: "dev1@example.com, dev2@example.com" },
    },
  );

  assert.equal(result.notifyStatus, "sent");
  assert.equal(result.recipientsAttempted, 2);
  assert.equal(result.recipientsSent, 2);
  assert.equal(result.notifiedAt, "2026-11-18T12:31:00.000Z");
  assert.equal(result.notifyError, null);
  assert.equal(delivered.length, 2);
  assert.equal(delivered[0].headers?.["Auto-Submitted"], "auto-generated");
  assert.ok(queries.some((q) => q.sql.includes("notify_status = 'sent'")));
});

test("dispatchFeedbackNotification handles partial failure, total failure, and skipped states", async () => {
  // Partial failure: 1 sent, 1 throws
  {
    const { pool } = createMockPool(makeFeedbackRow());
    const mailSender: FeedbackMailSender = async (recipient) => {
      if (recipient === "ok@example.com") return true;
      throw new Error("smtp_timeout");
    };
    const result = await dispatchFeedbackNotification(
      pool,
      "11111111-1111-4111-8111-111111111111",
      {
        mailSender,
        env: { FEEDBACK_NOTIFY_EMAILS: "ok@example.com, fail@example.com" },
      },
    );
    assert.equal(result.notifyStatus, "sent");
    assert.equal(result.recipientsAttempted, 2);
    assert.equal(result.recipientsSent, 1);
    assert.ok(result.notifyError?.includes("smtp_timeout"));
  }

  // Total failure: all fail
  {
    const { pool, queries } = createMockPool(makeFeedbackRow());
    const mailSender: FeedbackMailSender = async () => false;
    const result = await dispatchFeedbackNotification(
      pool,
      "11111111-1111-4111-8111-111111111111",
      {
        mailSender,
        env: { FEEDBACK_NOTIFY_EMAILS: "fail@example.com" },
      },
    );
    assert.equal(result.notifyStatus, "failed");
    assert.equal(result.recipientsAttempted, 1);
    assert.equal(result.recipientsSent, 0);
    assert.equal(result.notifiedAt, null);
    assert.ok(result.notifyError && result.notifyError.length <= 500);
    assert.ok(queries.some((q) => q.sql.includes("notify_status = 'failed'")));
  }

  // Skipped when no recipients or channels configured
  {
    const { pool, queries } = createMockPool(makeFeedbackRow());
    const result = await dispatchFeedbackNotification(
      pool,
      "11111111-1111-4111-8111-111111111111",
      { env: {} },
    );
    assert.equal(result.notifyStatus, "skipped");
    assert.equal(result.recipientsAttempted, 0);
    assert.equal(result.recipientsSent, 0);
    assert.equal(result.notifyError, "no_recipients_configured");
    assert.ok(queries.some((q) => q.sql.includes("notify_status = 'skipped'")));
  }
});

test("resolveSafeFeedbackWebhookUrl enforces strict HTTPS and blocks localhost/private IPs", () => {
  assert.equal(
    resolveSafeFeedbackWebhookUrl({ FEEDBACK_WEBHOOK_URL: "https://hooks.example.com/feedback" }),
    "https://hooks.example.com/feedback",
  );
  for (const unsafe of [
    "http://hooks.example.com/feedback",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://172.16.0.1/hook",
    "https://192.168.1.10/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://user:pass@hooks.example.com/hook",
  ]) {
    assert.equal(
      resolveSafeFeedbackWebhookUrl({ FEEDBACK_WEBHOOK_URL: unsafe }),
      null,
      `Expected ${unsafe} to be rejected`,
    );
  }
});

test("dispatchFeedbackNotification forwards optional HTTPS webhook and Telegram without leaking bot token", async () => {
  const { pool } = createMockPool(makeFeedbackRow());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const secretToken = "123456789:ABCDEF_secret_telegram_token_xyz";

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.includes("api.telegram.org")) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const result = await dispatchFeedbackNotification(
    pool,
    "11111111-1111-4111-8111-111111111111",
    {
      env: {
        FEEDBACK_WEBHOOK_URL: "https://hooks.example.com/grantfolio-feedback",
        FEEDBACK_TELEGRAM_BOT_TOKEN: secretToken,
        FEEDBACK_TELEGRAM_CHAT_ID: "-1001234567890",
      },
      fetchImpl,
      isUpdate: true,
    },
  );

  assert.equal(result.notifyStatus, "sent");
  assert.equal(result.recipientsAttempted, 2);
  assert.equal(result.recipientsSent, 1);
  assert.equal(result.notifyError, "telegram_http_403");
  assert.ok(!result.notifyError?.includes(secretToken));

  const webhookCall = calls.find((c) => c.url === "https://hooks.example.com/grantfolio-feedback");
  assert.ok(webhookCall);
  assert.equal(webhookCall.body.event, "grantfolio.feedback");
  assert.equal(webhookCall.body.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(webhookCall.body.rating, 4);
  assert.equal(webhookCall.body.task, "assistant");
  assert.equal(webhookCall.body.isUpdate, true);

  const telegramCall = calls.find((c) => c.url.includes("api.telegram.org"));
  assert.ok(telegramCall);
  assert.equal(telegramCall.body.chat_id, "-1001234567890");
  assert.match(String(telegramCall.body.text), /Оновлений відгук GrantFolio/);
});
