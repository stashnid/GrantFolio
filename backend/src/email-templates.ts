import { randomBytes, randomUUID } from "node:crypto";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
type GrantProgram = (typeof GRANT_CATALOG)[number];
import { isGrantAvailable } from "./grant-availability.js";
import { searchGrants } from "./grant-discovery.js";

const APP_ORIGIN = "https://grantfolio.pp.ua";
const DEFAULT_SUPPORT_EMAIL = "grantfoliomanager@gmail.com";

const FUNDING_TYPE_LABELS: Record<string, string> = {
  grant: "Безповоротний грант",
  microgrant: "Мікрогрант",
  prize: "Премія / нагорода",
  reimbursement: "Компенсація витрат",
  voucher: "Ваучер",
  "concessional-loan": "Пільговий кредит",
  equity: "Інвестиція / капітал",
  accelerator: "Акселераційна програма",
};

export type DigestProfileInput = {
  recipientName?: string;
  businessName?: string;
  industry?: string;
  region?: string;
  city?: string;
  legalForm?: string;
  requestedAmount?: string;
  fundingPurpose?: string;
  unsubscribeUrl?: string;
  replyToEmail?: string;
};

export type DigestProgramItem = {
  id: string;
  title: string;
  provider: string;
  amount: string;
  fundingLabel: string;
  deadlineLabel: string;
  reason: string;
  statusLabel: string;
  url: string;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertHeaderSafe(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid header value for ${field}`);
  }
  return value;
}

function encodeBase64Lines(content: string): string[] {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  return b64.match(/.{1,76}/g) ?? [];
}

export function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  messageIdDomain?: string;
}): string {
  const from = assertHeaderSafe(params.from, "From");
  const to = assertHeaderSafe(params.to, "To");
  const subjectText = assertHeaderSafe(params.subject, "Subject");
  const encodedSubject = Buffer.from(subjectText, "utf8").toString("base64");
  const domain = assertHeaderSafe(params.messageIdDomain || "grantfolio.pp.ua", "Message-ID");

  const headerLines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(params.replyTo ? [`Reply-To: ${assertHeaderSafe(params.replyTo, "Reply-To")}`] : []),
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    "Content-Language: uk",
  ];

  if (params.headers) {
    for (const [name, value] of Object.entries(params.headers)) {
      if (!/^[A-Za-z0-9-]+$/.test(name)) {
        throw new Error(`Invalid header name: ${name}`);
      }
      headerLines.push(`${name}: ${assertHeaderSafe(value, name)}`);
    }
  }

  if (!params.html) {
    const lines = [
      ...headerLines,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      ...encodeBase64Lines(params.text),
    ];
    return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
  }

  const boundary = `gf_${randomBytes(12).toString("hex")}`;
  const lines = [
    ...headerLines,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...encodeBase64Lines(params.text),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...encodeBase64Lines(params.html),
    "",
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function formatProgramDeadline(program: GrantProgram): string {
  const a = program.availability;
  if (a?.deadlineAt && Number.isFinite(Date.parse(a.deadlineAt))) {
    const formatted = new Date(a.deadlineAt).toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Kyiv",
    });
    return `До ${formatted}`;
  }
  if (a?.rolling) return "Постійний прийом";
  return program.deadline.length > 56
    ? `${program.deadline.slice(0, 53).trimEnd()}…`
    : program.deadline;
}

function toDigestProgram(program: GrantProgram, customReason?: string): DigestProgramItem {
  const fundingLabel =
    FUNDING_TYPE_LABELS[program.fundingType ?? "grant"] ?? "Програма фінансування";
  return {
    id: program.id,
    title: program.title,
    provider: program.provider,
    amount: program.amount,
    fundingLabel,
    deadlineLabel: formatProgramDeadline(program),
    reason: customReason || program.summary,
    statusLabel: "Відкритий прийом",
    url: `${APP_ORIGIN}/#grants/${encodeURIComponent(program.id)}`,
  };
}

export function selectDigestPrograms(profile: DigestProfileInput): DigestProgramItem[] {
  const eligible = GRANT_CATALOG.filter(
    (p) =>
      isGrantAvailable(p) &&
      p.reviewStatus !== "needs-review" &&
      p.programKind !== "program",
  );
  const queryParts = [
    profile.industry,
    profile.fundingPurpose,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" ");

  const picked: DigestProgramItem[] = [];
  const seen = new Set<string>();

  if (queryParts) {
    const search = searchGrants(queryParts);
    for (const match of search.matches) {
      if (picked.length >= 2) break;
      const program = eligible.find((p) => p.id === match.programId);
      if (!program || seen.has(program.id)) continue;
      seen.add(program.id);
      picked.push(toDigestProgram(program, match.reason || program.summary));
    }
  }

  return picked;
}

function emailShell(params: {
  preheader: string;
  badgeText: string;
  bodyHtml: string;
  footerNoteHtml: string;
}): string {
  const font =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>GrantFolio</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:${font};color:#0f1d32;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;overflow:hidden;color:#f1f5f9;">${escapeHtml(params.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="height:4px;line-height:4px;font-size:4px;background-color:#315fd7;background-image:linear-gradient(90deg,#1e3a8a 0%,#315fd7 55%,#4f46e5 100%);">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#0f1d32;padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle" style="font-family:${font};font-size:21px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;line-height:1;">
                    GrantFolio
                  </td>
                  <td align="right" valign="middle">
                    <span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:#1e2f4d;border:1px solid #304569;color:#dbeafe;font-family:${font};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2;">
                      ${escapeHtml(params.badgeText)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px 32px;background-color:#ffffff;">
              ${params.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
              ${params.footerNoteHtml}
              <p style="margin:12px 0 0 0;font-family:${font};font-size:11px;line-height:1.5;color:#94a3b8;">
                &copy; 2026 GrantFolio &middot; Гранти та фінансова підтримка українського бізнесу
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderGrantDigestEmail(
  profile: DigestProfileInput,
  programs: DigestProgramItem[] = selectDigestPrograms(profile),
): RenderedEmail {
  const font =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const displayTarget =
    profile.businessName?.trim() || profile.recipientName?.trim() || "Вашого бізнесу";
  const greetingName = profile.recipientName?.trim() || "підприємцю";
  const subject = `Актуальні гранти для «${displayTarget}» — GrantFolio`;

  const criteriaItems = [
    profile.industry?.trim() ? `Сфера: ${profile.industry.trim()}` : "",
    profile.fundingPurpose?.trim() ? `Потреба: ${profile.fundingPurpose.trim()}` : "",
  ].filter(Boolean);

  const criteriaHtml = criteriaItems.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <tr>
          <td style="padding:12px 16px;font-family:${font};font-size:12px;line-height:1.6;color:#475569;">
            <strong style="color:#0f1d32;font-weight:700;">Дані для пошуку:</strong>
            ${escapeHtml(criteriaItems.join("  ·  "))}
          </td>
        </tr>
      </table>`
    : "";

  const programCardsHtml = programs
    .map((p, index) => {
      const isPrimary = index === 0;
      const badgeBg = isPrimary ? "#ecfdf5" : "#eff6ff";
      const badgeBorder = isPrimary ? "#a7f3d0" : "#bfdbfe";
      const badgeText = isPrimary ? "#065f46" : "#1e40af";
      const dotColor = isPrimary ? "#10b981" : "#315fd7";

      const actionHtml = isPrimary
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
            <tr>
              <td align="center" style="border-radius:9px;background-color:#0f1d32;">
                <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 20px;font-family:${font};font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">
                  Переглянути умови програми &rarr;
                </a>
              </td>
            </tr>
          </table>`
        : `<p style="margin:16px 0 0 0;font-family:${font};font-size:13px;font-weight:700;">
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" style="color:#315fd7;text-decoration:none;">
              Переглянути умови програми &rarr;
            </a>
          </p>`;

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;background-color:#ffffff;border:1px solid #dce4ee;border-radius:12px;">
        <tr>
          <td style="padding:20px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
              <tr>
                <td align="left" valign="middle">
                  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:${badgeBg};border:1px solid ${badgeBorder};color:${badgeText};font-family:${font};font-size:11px;font-weight:700;line-height:1.2;">
                    <span style="color:${dotColor};">&bull;</span>&nbsp;${escapeHtml(p.statusLabel)}
                  </span>
                </td>
                <td align="right" valign="middle" style="font-family:${font};font-size:12px;font-weight:600;color:#64748b;white-space:nowrap;">
                  ${escapeHtml(p.deadlineLabel)}
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px 0;font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#315fd7;">
              ${escapeHtml(p.provider)}
            </p>
            <h2 style="margin:0 0 10px 0;font-family:${font};font-size:17px;font-weight:800;line-height:1.3;letter-spacing:-0.02em;color:#0f1d32;">
              ${escapeHtml(p.title)}
            </h2>
            <p style="margin:0 0 14px 0;font-family:${font};font-size:13.5px;line-height:1.5;color:#334155;">
              <strong style="color:#0f1d32;font-weight:700;">${escapeHtml(p.amount)}</strong>
              <span style="color:#94a3b8;">&nbsp;&middot;&nbsp;</span>
              <span style="color:#475569;">${escapeHtml(p.fundingLabel)}</span>
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-left:3px solid #315fd7;border-radius:0 8px 8px 0;">
              <tr>
                <td style="padding:10px 14px;font-family:${font};font-size:13px;line-height:1.55;color:#334155;">
                  <strong style="color:#0f1d32;">Пояснення збігу:</strong> ${escapeHtml(p.reason)}
                </td>
              </tr>
            </table>
            ${actionHtml}
          </td>
        </tr>
      </table>`;
    })
    .join("");

  const countLabel = programs.length === 1 ? "1 можливість" : `${programs.length} можливості`;
  const introduction = programs.length
    ? `Знайдено ${countLabel} за словами вашого запиту. Перевірте умови участі, витрати та строки в офіційному джерелі.`
    : "За наданими даними зараз не знайдено можливостей із підтвердженим відкритим прийомом. Уточніть потребу або перегляньте каталог.";

  const bodyHtml = `
    <p style="margin:0 0 8px 0;font-family:${font};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#0f1d32;">
      Вітаємо, ${escapeHtml(greetingName)}!
    </p>
    <p style="margin:0 0 22px 0;font-family:${font};font-size:14.5px;line-height:1.6;color:#475569;">
      ${escapeHtml(introduction)}
    </p>
    ${criteriaHtml}
    ${programCardsHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;background-color:#f4f7fd;border:1px solid #dbe6fa;border-radius:12px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="left" valign="middle" style="font-family:${font};font-size:13px;line-height:1.5;color:#334155;">
                Потрібна допомога з перевіркою умов або бізнес-планом?
              </td>
              <td align="right" valign="middle" style="padding-left:12px;white-space:nowrap;">
                <a href="${APP_ORIGIN}/#grants" target="_blank" rel="noopener noreferrer" style="font-family:${font};font-size:13px;font-weight:700;color:#315fd7;text-decoration:none;">
                  Відкрити каталог &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const unsubscribeHref = profile.unsubscribeUrl || APP_ORIGIN;
  const replyToEmail = profile.replyToEmail?.trim() || DEFAULT_SUPPORT_EMAIL;

  const footerNoteHtml = `
    <p style="margin:0 0 8px 0;font-family:${font};font-size:12px;line-height:1.55;color:#64748b;">
      Ви отримали цей лист, тому що увімкнули персональну розсилку актуальних грантів у профілі бізнесу на <a href="${APP_ORIGIN}" style="color:#315fd7;text-decoration:none;">grantfolio.pp.ua</a>.
    </p>
    <p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:#64748b;">
      <a href="${APP_ORIGIN}" style="color:#315fd7;text-decoration:none;font-weight:600;">Налаштувати профіль</a>
      &nbsp;&middot;&nbsp;
      <a href="${APP_ORIGIN}/#grants" style="color:#315fd7;text-decoration:none;font-weight:600;">Каталог грантів</a>
      &nbsp;&middot;&nbsp;
      <a href="${escapeHtml(unsubscribeHref)}" style="color:#64748b;text-decoration:underline;">Відписатися в 1 клік</a>
    </p>
  `;

  const html = emailShell({
    preheader: introduction,
    badgeText: "Персональний дайджест",
    bodyHtml,
    footerNoteHtml,
  });

  const textLines = [
    `Вітаємо, ${greetingName}!`,
    "",
    introduction,
    ...(criteriaItems.length ? [`(${criteriaItems.join(" · ")})`, ""] : [""]),
    ...programs.flatMap((p, i) => [
      `${i + 1}. ${p.title} (${p.provider})`,
      `   Сума: ${p.amount} · ${p.fundingLabel}`,
      `   Строк: ${p.deadlineLabel}`,
      `   Пояснення збігу: ${p.reason}`,
      `   Деталі: ${p.url}`,
      "",
    ]),
    `Відкрити робочий простір GrantFolio: ${APP_ORIGIN}/`,
    "",
    "Ви отримали цей лист, тому що увімкнули розсилку грантів у профілі бізнесу GrantFolio.",
    ...(profile.unsubscribeUrl ? [`Відписатися в 1 клік: ${profile.unsubscribeUrl}`] : []),
  ];

  const listUnsubscribeParts = [
    ...(profile.unsubscribeUrl ? [`<${profile.unsubscribeUrl}>`] : []),
    `<mailto:${replyToEmail}?subject=Unsubscribe>`,
  ];
  const headers: Record<string, string> = {
    "List-Id": "GrantFolio Digest <digest.grantfolio.pp.ua>",
    "List-Unsubscribe": listUnsubscribeParts.join(", "),
    ...(profile.unsubscribeUrl
      ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : {}),
  };

  return {
    subject,
    text: textLines.join("\n"),
    html,
    headers,
  };
}

export function renderLoginCodeEmail(code: string): RenderedEmail {
  const font =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const subject = "Код підтвердження входу — GrantFolio";
  const spacedCode = code.split("").join(" ");

  const bodyHtml = `
    <p style="margin:0 0 8px 0;font-family:${font};font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#0f1d32;">
      Код підтвердження входу
    </p>
    <p style="margin:0 0 24px 0;font-family:${font};font-size:14.5px;line-height:1.6;color:#475569;">
      Використайте цей одноразовий код, щоб завершити вхід до вашого робочого простору GrantFolio:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center" style="padding:22px 24px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;">
          <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:0.22em;color:#0f1d32;">
            ${escapeHtml(code)}
          </span>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fd;border-left:3px solid #315fd7;border-radius:0 8px 8px 0;">
      <tr>
        <td style="padding:12px 16px;font-family:${font};font-size:13px;line-height:1.55;color:#334155;">
          Код дійсний протягом <strong style="color:#0f1d32;">10 хвилин</strong>. З міркувань безпеки нікому не передавайте цей код.
        </td>
      </tr>
    </table>
  `;

  const footerNoteHtml = `
    <p style="margin:0;font-family:${font};font-size:12px;line-height:1.55;color:#64748b;">
      Якщо ви не намагалися увійти в GrantFolio, просто проігноруйте цей лист — доступ до акаунта залишиться захищеним.
    </p>
  `;

  const html = emailShell({
    preheader: `Ваш одноразовий код входу до GrantFolio: ${spacedCode}. Дійсний 10 хвилин.`,
    badgeText: "Безпека акаунта",
    bodyHtml,
    footerNoteHtml,
  });

  const text = [
    `Ваш код підтвердження GrantFolio: ${code}`,
    "",
    "Код дійсний протягом 10 хвилин. Нікому не передавайте його.",
    "Якщо ви не намагалися увійти, проігноруйте цей лист.",
  ].join("\n");

  return {
    subject,
    text,
    html,
    headers: {
      "Auto-Submitted": "auto-generated",
    },
  };
}

export interface FeedbackNotificationEmailInput {
  id: string;
  rating: number;
  task: string;
  comment: string;
  ratingUx?: number | null;
  ratingUsefulness?: number | null;
  ratingAi?: number | null;
  taskOutcome?: string | null;
  wouldRecommend?: boolean | null;
  willingnessToPay?: string | null;
  suggestedPriceUah?: number | null;
  categoryTags?: string[] | null;
  testerRole?: string | null;
  contactConsent?: boolean;
  contactInfo?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
  createdAt: string | Date;
  isUpdate?: boolean;
  adminUrl?: string;
  businessName?: string | null;
  region?: string | null;
}

const FEEDBACK_TASK_LABELS: Record<string, string> = {
  project: "Весь сайт загалом",
  catalog: "Каталог грантів",
  assistant: "Поради помічника",
  budget: "Бюджет",
  profile: "Дані про бізнес",
  export: "Завантаження документів",
};

const FEEDBACK_OUTCOME_LABELS: Record<string, string> = {
  completed: "Завдання виконано",
  partial: "Вийшло частково",
  failed: "Не вдалося виконати",
  unspecified: "Не вказано",
};

const FEEDBACK_WTP_LABELS: Record<string, string> = {
  none: "Не вказано",
  free_only: "Лише безкоштовно",
  pay_per_application: "Оплата за заявку",
  monthly_subscription: "Щомісячна підписка",
  donation_ready: "Готовність до донату",
  already_paid: "Уже підтримано / оплачено",
};

const FEEDBACK_ROLE_LABELS: Record<string, string> = {
  entrepreneur: "Підприємець / власник справи",
  fop: "ФОП",
  startup_founder: "Планує розпочати власну справу",
  accountant: "Бухгалтер або юрист",
  student_business: "Студент або початківець",
  volunteer: "Волонтер / ГО",
  other: "Інше",
};

function feedbackRatingPalette(rating: number): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  label: string;
} {
  if (rating <= 2) {
    return {
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#991b1b",
      dot: "#dc2626",
      label: "Низька оцінка",
    };
  }
  if (rating === 3) {
    return {
      bg: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
      dot: "#d97706",
      label: "Нейтральна оцінка",
    };
  }
  return {
    bg: "#ecfdf5",
    border: "#a7f3d0",
    text: "#065f46",
    dot: "#10b981",
    label: "Висока оцінка",
  };
}

function formatFeedbackDate(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  });
}

function resolveSafeAdminUrl(raw?: string): string {
  const candidate = raw?.trim();
  if (candidate && /^https?:\/\/[^\s]+$/i.test(candidate)) {
    return candidate;
  }
  return `${APP_ORIGIN}/#admin/feedback`;
}

export function renderFeedbackNotificationEmail(
  input: FeedbackNotificationEmailInput,
): { subject: string; text: string; html: string } {
  const font =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const taskLabel = FEEDBACK_TASK_LABELS[input.task] ?? input.task;
  const actionPrefix = input.isUpdate ? "Оновлений відгук" : "Новий відгук";
  const subject = assertHeaderSafe(
    `${actionPrefix} (${input.rating}/5 · ${taskLabel}) — GrantFolio`,
    "Subject",
  );

  const palette = feedbackRatingPalette(input.rating);
  const outcomeLabel =
    FEEDBACK_OUTCOME_LABELS[input.taskOutcome ?? "unspecified"] ??
    input.taskOutcome ??
    "Не вказано";
  const wtpLabel =
    FEEDBACK_WTP_LABELS[input.willingnessToPay ?? "none"] ??
    input.willingnessToPay ??
    "Не вказано";
  const roleLabel =
    FEEDBACK_ROLE_LABELS[input.testerRole ?? "entrepreneur"] ??
    input.testerRole ??
    "Підприємець";
  const createdLabel = formatFeedbackDate(input.createdAt);
  const adminHref = resolveSafeAdminUrl(input.adminUrl);
  const tags = (input.categoryTags ?? []).map((t) => t.trim()).filter(Boolean);
  const safeContact =
    input.contactConsent && input.contactInfo?.trim() ? input.contactInfo.trim() : null;

  const subRatings = [
    input.ratingUx != null ? `Зручність сайту: ${input.ratingUx}/5` : "",
    input.ratingUsefulness != null ? `Користь для справи: ${input.ratingUsefulness}/5` : "",
    input.ratingAi != null ? `Поради помічника: ${input.ratingAi}/5` : "",
  ].filter(Boolean);

  const contextParts = Object.entries(input.contextSnapshot ?? {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);

  const metaRows: Array<{ label: string; value: string }> = [
    { label: "Розділ", value: taskLabel },
    { label: "Результат завдання", value: outcomeLabel },
    { label: "Роль тестувальника", value: roleLabel },
    ...(subRatings.length ? [{ label: "Детальні оцінки", value: subRatings.join(" · ") }] : []),
    ...(input.wouldRecommend != null
      ? [{ label: "Рекомендує іншим", value: input.wouldRecommend ? "Так" : "Ні" }]
      : []),
    {
      label: "Готовність платити",
      value:
        input.suggestedPriceUah != null
          ? `${wtpLabel} (${input.suggestedPriceUah} грн)`
          : wtpLabel,
    },
    ...(input.businessName?.trim()
      ? [{ label: "Бізнес", value: input.businessName.trim() }]
      : []),
    ...(input.region?.trim() ? [{ label: "Регіон", value: input.region.trim() }] : []),
    ...(tags.length ? [{ label: "Теги", value: tags.join(", ") }] : []),
    ...(safeContact ? [{ label: "Контакт (за згодою)", value: safeContact }] : []),
    ...(contextParts.length ? [{ label: "Контекст", value: contextParts.join(" · ") }] : []),
    { label: "Час", value: createdLabel },
    { label: "ID запису", value: input.id },
  ];

  const metaHtml = metaRows
    .map(
      (row) => `<tr>
        <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-family:${font};font-size:12.5px;font-weight:700;color:#475569;white-space:nowrap;vertical-align:top;width:165px;">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-family:${font};font-size:13px;color:#0f1d32;vertical-align:top;word-break:break-word;">
          ${escapeHtml(row.value)}
        </td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
      <tr>
        <td align="left" valign="middle">
          <span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:${palette.bg};border:1px solid ${palette.border};color:${palette.text};font-family:${font};font-size:12px;font-weight:700;line-height:1.2;">
            <span style="color:${palette.dot};">&bull;</span>&nbsp;Оцінка ${escapeHtml(String(input.rating))}/5 &middot; ${escapeHtml(palette.label)}
          </span>
        </td>
        <td align="right" valign="middle" style="font-family:${font};font-size:12px;font-weight:600;color:#64748b;white-space:nowrap;">
          ${escapeHtml(createdLabel)}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px 0;font-family:${font};font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#0f1d32;">
      ${escapeHtml(actionPrefix)}: ${escapeHtml(taskLabel)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background-color:#f8fafc;border-left:3px solid ${palette.dot};border-radius:0 10px 10px 0;">
      <tr>
        <td style="padding:14px 16px;font-family:${font};font-size:14px;line-height:1.6;color:#0f1d32;white-space:pre-wrap;word-break:break-word;">
          ${escapeHtml(input.comment)}
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;">
      ${metaHtml}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="border-radius:9px;background-color:#0f1d32;">
          <a href="${escapeHtml(adminHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 20px;font-family:${font};font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">
            Відкрити в панелі відгуків &rarr;
          </a>
        </td>
      </tr>
    </table>
  `;

  const footerNoteHtml = `
    <p style="margin:0;font-family:${font};font-size:12px;line-height:1.55;color:#64748b;">
      Автоматичне службове сповіщення для команди розробки GrantFolio про зворотний зв'язок користувача.
    </p>
  `;

  const html = emailShell({
    preheader: `${actionPrefix} (${input.rating}/5 · ${taskLabel}): ${input.comment.slice(0, 120)}`,
    badgeText: input.isUpdate ? "Оновлення відгуку" : "Відгук користувача",
    bodyHtml,
    footerNoteHtml,
  });

  const textLines = [
    `${actionPrefix} — GrantFolio`,
    `Оцінка: ${input.rating}/5 (${palette.label})`,
    "",
    "Коментар:",
    input.comment,
    "",
    ...metaRows.map((row) => `${row.label}: ${row.value}`),
    "",
    `Панель відгуків: ${adminHref}`,
  ];

  return {
    subject,
    text: textLines.join("\n"),
    html,
  };
}
