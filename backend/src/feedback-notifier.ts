import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { Pool } from "pg";
import { sendGmailMessage } from "./email-login-code.js";
import { renderFeedbackNotificationEmail } from "./email-templates.js";

export type FeedbackMailSender = (
  recipient: string,
  subject: string,
  text: string,
  html?: string,
  headers?: Record<string, string>,
) => Promise<boolean>;

export interface NotifyDispatchResult {
  notifyStatus: "sent" | "failed" | "skipped";
  recipientsAttempted: number;
  recipientsSent: number;
  notifiedAt: string | null;
  notifyError: string | null;
}

export interface DispatchFeedbackNotificationOptions {
  mailSender?: FeedbackMailSender;
  env?: NodeJS.ProcessEnv;
  isUpdate?: boolean;
  fetchImpl?: typeof fetch;
}

type FeedbackNotifyRow = {
  id: string;
  owner_id: string;
  rating: number;
  task: string;
  comment: string;
  created_at: string | Date;
  rating_ux: number | null;
  rating_usefulness: number | null;
  rating_ai: number | null;
  task_outcome: string;
  would_recommend: boolean | null;
  willingness_to_pay: string;
  suggested_price_uah: number | null;
  category_tags: string[] | null;
  tester_role: string;
  contact_consent: boolean;
  contact_info: string | null;
  context_snapshot: Record<string, unknown> | null;
  business_name: string | null;
  region: string | null;
};

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM_TOKEN_RE = /^\d+:[A-Za-z0-9_-]{10,}$/;
const MAX_ERROR_LENGTH = 500;
const CHANNEL_TIMEOUT_MS = 5000;

function truncateError(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  if (cleaned.length <= MAX_ERROR_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_ERROR_LENGTH - 3)}...`;
}

export function resolveFeedbackNotifyRecipients(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw =
    env.FEEDBACK_NOTIFY_EMAILS?.trim() ||
    env.MONITOR_ADMIN_EMAILS?.trim() ||
    "";
  if (!raw) return [];

  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const part of raw.split(",")) {
    const cleaned = part.trim().replace(/^["']+|["']+$/g, "").trim();
    if (!cleaned || cleaned.length > 254) continue;
    if (/[\r\n]/.test(cleaned)) continue;
    if (!BASIC_EMAIL_RE.test(cleaned)) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(cleaned);
  }

  return recipients;
}

function isPrivateOrLoopbackIpv4(ip: string): boolean {
  const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateOrLoopbackIpv4(normalized);
  }
  if (ipVersion === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    const mappedPrefix = "::ffff:";
    if (normalized.startsWith(mappedPrefix)) {
      const mapped = normalized.slice(mappedPrefix.length);
      if (isIP(mapped) === 4) return isPrivateOrLoopbackIpv4(mapped);
      return true;
    }
    return false;
  }

  return false;
}

export function resolveSafeFeedbackWebhookUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.FEEDBACK_WEBHOOK_URL?.trim();
  if (!raw || /[\r\n]/.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): { botToken: string; chatId: string } | null {
  const botToken = env.FEEDBACK_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.FEEDBACK_TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) return null;
  if (!TELEGRAM_TOKEN_RE.test(botToken)) return null;
  if (/[\r\n\s]/.test(chatId)) return null;
  return { botToken, chatId };
}

export function computeFeedbackContentHash(input: {
  rating: number;
  task: string;
  comment: string;
  taskOutcome?: string;
  categoryTags?: string[];
  willingnessToPay?: string;
}): string {
  const normalizedTags = Array.from(
    new Set((input.categoryTags ?? []).map((tag) => tag.trim()).filter(Boolean)),
  ).sort();
  const canonical = JSON.stringify({
    rating: input.rating,
    task: input.task,
    comment: input.comment.trim(),
    taskOutcome: input.taskOutcome ?? "unspecified",
    categoryTags: normalizedTags,
    willingnessToPay: input.willingnessToPay ?? "none",
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function buildTelegramMessage(row: FeedbackNotifyRow, isUpdate: boolean): string {
  const prefix = isUpdate ? "Оновлений відгук GrantFolio" : "Новий відгук GrantFolio";
  const tags = (row.category_tags ?? []).filter(Boolean);
  const contact = row.contact_consent && row.contact_info?.trim() ? row.contact_info.trim() : null;
  const commentSnippet =
    row.comment.length > 600 ? `${row.comment.slice(0, 597)}...` : row.comment;
  const lines = [
    `${prefix} (${row.rating}/5 · ${row.task})`,
    `Результат: ${row.task_outcome} · Роль: ${row.tester_role}`,
    `Готовність платити: ${row.willingness_to_pay}${row.suggested_price_uah != null ? ` (${row.suggested_price_uah} грн)` : ""}`,
    ...(tags.length ? [`Теги: ${tags.join(", ")}`] : []),
    ...(contact ? [`Контакт (за згодою): ${contact}`] : []),
    "",
    commentSnippet,
    "",
    `ID: ${row.id}`,
  ];
  return lines.join("\n");
}

async function sendWebhookNotification(
  webhookUrl: string,
  row: FeedbackNotifyRow,
  isUpdate: boolean,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const payload = {
      event: "grantfolio.feedback",
      id: row.id,
      rating: row.rating,
      task: row.task,
      comment: row.comment,
      taskOutcome: row.task_outcome,
      willingnessToPay: row.willingness_to_pay,
      categoryTags: row.category_tags ?? [],
      testerRole: row.tester_role,
      contactConsent: Boolean(row.contact_consent),
      contactInfo: row.contact_consent ? (row.contact_info ?? null) : null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      isUpdate,
    };
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, error: `webhook_http_${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "webhook_delivery_failed" };
  }
}

async function sendTelegramNotification(
  config: { botToken: string; chatId: string },
  row: FeedbackNotifyRow,
  isUpdate: boolean,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: buildTelegramMessage(row, isUpdate),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return { ok: false, error: `telegram_http_${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "telegram_delivery_failed" };
  }
}

export async function dispatchFeedbackNotification(
  db: Pool,
  feedbackId: string,
  options: DispatchFeedbackNotificationOptions = {},
): Promise<NotifyDispatchResult> {
  const env = options.env ?? process.env;
  const mailSender = options.mailSender ?? sendGmailMessage;
  const fetchImpl = options.fetchImpl ?? fetch;
  const isUpdate = Boolean(options.isUpdate);

  try {
    const queryResult = await db.query<FeedbackNotifyRow>(
      `SELECT
        f.id, f.owner_id, f.rating, f.task, f.comment, f.created_at,
        f.rating_ux, f.rating_usefulness, f.rating_ai,
        f.task_outcome, f.would_recommend, f.willingness_to_pay,
        f.suggested_price_uah, f.category_tags, f.tester_role,
        f.contact_consent, f.contact_info, f.context_snapshot,
        p.business_name, p.region
      FROM user_feedback f
      LEFT JOIN profiles p ON p.owner_id = f.owner_id
      WHERE f.id = $1`,
      [feedbackId],
    );

    if (!queryResult.rowCount || !queryResult.rows[0]) {
      return {
        notifyStatus: "skipped",
        recipientsAttempted: 0,
        recipientsSent: 0,
        notifiedAt: null,
        notifyError: "feedback_not_found",
      };
    }

    const row = queryResult.rows[0];
    const recipients = resolveFeedbackNotifyRecipients(env);
    const webhookUrl = resolveSafeFeedbackWebhookUrl(env);
    const telegramConfig = resolveTelegramConfig(env);

    const totalTargets =
      recipients.length + (webhookUrl ? 1 : 0) + (telegramConfig ? 1 : 0);

    if (totalTargets === 0) {
      await db.query(
        "UPDATE user_feedback SET notify_status = 'skipped', notify_error = $2 WHERE id = $1",
        [feedbackId, "no_recipients_configured"],
      );
      return {
        notifyStatus: "skipped",
        recipientsAttempted: 0,
        recipientsSent: 0,
        notifiedAt: null,
        notifyError: "no_recipients_configured",
      };
    }

    let recipientsSent = 0;
    const errors: string[] = [];

    if (recipients.length > 0) {
      const rendered = renderFeedbackNotificationEmail({
        id: row.id,
        rating: row.rating,
        task: row.task,
        comment: row.comment,
        ratingUx: row.rating_ux,
        ratingUsefulness: row.rating_usefulness,
        ratingAi: row.rating_ai,
        taskOutcome: row.task_outcome,
        wouldRecommend: row.would_recommend,
        willingnessToPay: row.willingness_to_pay,
        suggestedPriceUah: row.suggested_price_uah,
        categoryTags: row.category_tags ?? [],
        testerRole: row.tester_role,
        contactConsent: Boolean(row.contact_consent),
        contactInfo: row.contact_consent ? row.contact_info : null,
        contextSnapshot: row.context_snapshot ?? {},
        createdAt: row.created_at,
        isUpdate,
        adminUrl: env.FEEDBACK_ADMIN_URL?.trim() || undefined,
        businessName: row.business_name,
        region: row.region,
      });

      for (const recipient of recipients) {
        try {
          const ok = await mailSender(
            recipient,
            rendered.subject,
            rendered.text,
            rendered.html,
            { "Auto-Submitted": "auto-generated" },
          );
          if (ok) {
            recipientsSent += 1;
          } else {
            errors.push(`email_failed:${recipient}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "send_error";
          errors.push(`email_error:${recipient}:${msg}`);
        }
      }
    }

    if (webhookUrl) {
      const webhookResult = await sendWebhookNotification(
        webhookUrl,
        row,
        isUpdate,
        fetchImpl,
      );
      if (webhookResult.ok) {
        recipientsSent += 1;
      } else {
        errors.push(webhookResult.error ?? "webhook_delivery_failed");
      }
    }

    if (telegramConfig) {
      const telegramResult = await sendTelegramNotification(
        telegramConfig,
        row,
        isUpdate,
        fetchImpl,
      );
      if (telegramResult.ok) {
        recipientsSent += 1;
      } else {
        errors.push(telegramResult.error ?? "telegram_delivery_failed");
      }
    }

    if (recipientsSent >= 1) {
      const partialError = errors.length ? truncateError(errors.join("; ")) : null;
      const updated = await db.query<{ notified_at: string | Date }>(
        `UPDATE user_feedback
         SET notify_attempts = notify_attempts + 1,
             notify_status = 'sent',
             notified_at = now(),
             notify_error = $2
         WHERE id = $1
         RETURNING notified_at`,
        [feedbackId, partialError],
      );
      const rawNotifiedAt = updated.rows?.[0]?.notified_at;
      const notifiedAt = rawNotifiedAt
        ? rawNotifiedAt instanceof Date
          ? rawNotifiedAt.toISOString()
          : String(rawNotifiedAt)
        : new Date().toISOString();

      return {
        notifyStatus: "sent",
        recipientsAttempted: totalTargets,
        recipientsSent,
        notifiedAt,
        notifyError: partialError,
      };
    }

    const notifyError = truncateError(errors.join("; ") || "delivery_failed");
    await db.query(
      `UPDATE user_feedback
       SET notify_attempts = notify_attempts + 1,
           notify_status = 'failed',
           notify_error = $2
       WHERE id = $1`,
      [feedbackId, notifyError],
    );

    return {
      notifyStatus: "failed",
      recipientsAttempted: totalTargets,
      recipientsSent: 0,
      notifiedAt: null,
      notifyError,
    };
  } catch (err) {
    const notifyError = truncateError(
      err instanceof Error ? err.message : "unexpected_notification_error",
    );
    try {
      await db.query(
        `UPDATE user_feedback
         SET notify_attempts = notify_attempts + 1,
             notify_status = 'failed',
             notify_error = $2
         WHERE id = $1`,
        [feedbackId, notifyError],
      );
    } catch {
      // Never propagate unhandled errors from best-effort notification logging.
    }
    return {
      notifyStatus: "failed",
      recipientsAttempted: 0,
      recipientsSent: 0,
      notifiedAt: null,
      notifyError,
    };
  }
}
