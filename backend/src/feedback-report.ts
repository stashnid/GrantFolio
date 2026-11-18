import type {
  SingleFeedbackTriage,
  VerifiedBatchFeedbackSynthesis,
} from "./feedback-ai.js";

export type FeedbackTaskOutcome =
  | "completed"
  | "partial"
  | "failed"
  | "unspecified";

export type FeedbackWillingnessToPay =
  | "none"
  | "free_only"
  | "pay_per_application"
  | "monthly_subscription"
  | "donation_ready"
  | "already_paid";

export type FeedbackStatus =
  | "new"
  | "reviewed"
  | "planned"
  | "resolved"
  | "dismissed";

export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export type FeedbackNotifyStatus = "pending" | "sent" | "failed" | "skipped";

export interface DeterministicFeedbackMetrics {
  totalCount: number;
  uniqueTesters: number;
  averageRating: number | null;
  ratingDistribution: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  };
  dimensionAverages: {
    ux: number | null;
    usefulness: number | null;
    ai: number | null;
  };
  csatPercent: number | null;
  recommendPercent: number | null;
  taskCompletionRate: number | null;
  taskOutcomeBreakdown: Record<FeedbackTaskOutcome, number>;
  willingnessToPayBreakdown: Record<FeedbackWillingnessToPay, number>;
  willingnessToPayCount: number;
  willingnessToPayPercent: number | null;
  averageSuggestedPriceUah: number | null;
  actualDonations: { count: number; totalUah: number };
  pilotPayments: { count: number; totalUah: number };
  taskBreakdown: Record<string, number>;
  statusBreakdown: Record<FeedbackStatus, number>;
  topTags: Array<{ tag: string; count: number }>;
  notifyFailuresCount: number;
}

export interface FeedbackChangeLink {
  id: string;
  feedbackId: string;
  changeSummary: string;
  pullRequestOrCommit: string;
  verificationEvidence: string | null;
  createdAt: string;
  createdBy: string;
}

export interface FeedbackAdminItem {
  id: string;
  ownerId: string;
  rating: number;
  task: string;
  comment: string;
  createdAt: string;
  ratingUx: number | null;
  ratingUsefulness: number | null;
  ratingAi: number | null;
  taskOutcome: FeedbackTaskOutcome;
  wouldRecommend: boolean | null;
  willingnessToPay: FeedbackWillingnessToPay;
  suggestedPriceUah: number | null;
  categoryTags: string[];
  testerRole: string;
  contactConsent: boolean;
  contactInfo: string | null;
  contextSnapshot: Record<string, unknown>;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  resolutionNote: string | null;
  resolvedCommitOrPr: string | null;
  resolvedAt: string | null;
  reviewedBy: string | null;
  notifyStatus: FeedbackNotifyStatus;
  notifyAttempts: number;
  notifiedAt: string | null;
  notifyError: string | null;
  contentHash: string | null;
  aiTriage: SingleFeedbackTriage | null;
  aiTriagedAt: string | null;
  businessName: string | null;
  region: string | null;
  changeLinks: FeedbackChangeLink[];
}

export interface FeedbackBatchSynthesisRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  feedbackCount: number;
  deterministicMetrics: DeterministicFeedbackMetrics;
  aiSynthesis: VerifiedBatchFeedbackSynthesis | null;
  status: "completed" | "failed" | "deterministic_only";
  errorMessage: string | null;
}

export interface FeedbackMetricInputRow {
  ownerId: string;
  rating: number;
  task: string;
  ratingUx: number | null;
  ratingUsefulness: number | null;
  ratingAi: number | null;
  taskOutcome: string | null;
  wouldRecommend: boolean | null;
  willingnessToPay: string | null;
  suggestedPriceUah: number | null;
  categoryTags: string[] | null;
  status: string | null;
  notifyStatus: string | null;
}

export interface FeedbackReportData {
  generatedAt: string;
  metrics: DeterministicFeedbackMetrics;
  items: FeedbackAdminItem[];
  latestSynthesis: FeedbackBatchSynthesisRecord | null;
}

const POSITIVE_WTP_VALUES = new Set<FeedbackWillingnessToPay>([
  "pay_per_application",
  "monthly_subscription",
  "donation_ready",
  "already_paid",
]);

const ROLE_LABELS_UK: Record<string, string> = {
  entrepreneur: "Підприємець / власник справи",
  fop: "ФОП (працюю на себе)",
  startup_founder: "Планує розпочати власну справу",
  accountant: "Бухгалтер або юрист",
  student_business: "Студент або початківець",
  volunteer: "Волонтер або громадська діяльність",
  other: "Інше",
};

const TASK_LABELS_UK: Record<string, string> = {
  project: "Весь сайт загалом",
  catalog: "Каталог грантів",
  assistant: "Поради помічника",
  budget: "Розрахунок витрат",
  profile: "Дані про бізнес",
  export: "Завантаження документів",
};

const OUTCOME_LABELS_UK: Record<FeedbackTaskOutcome, string> = {
  completed: "Так, усе вийшло",
  partial: "Вийшло частково",
  failed: "Не вдалося виконати",
  unspecified: "Не вказано",
};

const WTP_LABELS_UK: Record<FeedbackWillingnessToPay, string> = {
  none: "Не вказано",
  free_only: "Тільки безкоштовно",
  pay_per_application: "Оплата за готову заявку",
  monthly_subscription: "Невелика щомісячна оплата",
  donation_ready: "Добровільний внесок (донат)",
  already_paid: "Уже оплачено / підтримано",
};

const STATUS_LABELS_UK: Record<FeedbackStatus, string> = {
  new: "Новий",
  reviewed: "Переглянуто",
  planned: "Заплановано",
  resolved: "Вирішено",
  dismissed: "Відхилено",
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return round2(sum / values.length);
}

export function kopecksToUah(kopecks: number): number {
  if (!Number.isFinite(kopecks) || kopecks <= 0) return 0;
  return round2(kopecks / 100);
}

export function computeDeterministicMetrics(
  rows: FeedbackMetricInputRow[],
  actualDonations: { count: number; totalUah: number },
  pilotPayments: { count: number; totalUah: number },
): DeterministicFeedbackMetrics {
  const totalCount = rows.length;
  const owners = new Set<string>();
  const ratingDistribution: DeterministicFeedbackMetrics["ratingDistribution"] = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
  const taskOutcomeBreakdown: Record<FeedbackTaskOutcome, number> = {
    completed: 0,
    partial: 0,
    failed: 0,
    unspecified: 0,
  };
  const willingnessToPayBreakdown: Record<FeedbackWillingnessToPay, number> = {
    none: 0,
    free_only: 0,
    pay_per_application: 0,
    monthly_subscription: 0,
    donation_ready: 0,
    already_paid: 0,
  };
  const statusBreakdown: Record<FeedbackStatus, number> = {
    new: 0,
    reviewed: 0,
    planned: 0,
    resolved: 0,
    dismissed: 0,
  };
  const taskBreakdown: Record<string, number> = {};
  const tagCounts = new Map<string, number>();

  const ratings: number[] = [];
  const uxRatings: number[] = [];
  const usefulnessRatings: number[] = [];
  const aiRatings: number[] = [];
  const suggestedPrices: number[] = [];

  let csatCount = 0;
  let recommendAnswered = 0;
  let recommendYes = 0;
  let willingnessToPayCount = 0;
  let notifyFailuresCount = 0;

  for (const row of rows) {
    if (row.ownerId) owners.add(row.ownerId);

    const rating = Number(row.rating);
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
      ratings.push(rating);
      const bucket = String(Math.round(rating)) as keyof typeof ratingDistribution;
      if (bucket in ratingDistribution) {
        ratingDistribution[bucket] += 1;
      }
      if (rating >= 4) csatCount += 1;
    }

    if (typeof row.ratingUx === "number" && Number.isFinite(row.ratingUx)) {
      uxRatings.push(row.ratingUx);
    }
    if (
      typeof row.ratingUsefulness === "number" &&
      Number.isFinite(row.ratingUsefulness)
    ) {
      usefulnessRatings.push(row.ratingUsefulness);
    }
    if (typeof row.ratingAi === "number" && Number.isFinite(row.ratingAi)) {
      aiRatings.push(row.ratingAi);
    }

    const outcome = (row.taskOutcome ?? "unspecified") as FeedbackTaskOutcome;
    if (outcome in taskOutcomeBreakdown) {
      taskOutcomeBreakdown[outcome] += 1;
    } else {
      taskOutcomeBreakdown.unspecified += 1;
    }

    if (typeof row.wouldRecommend === "boolean") {
      recommendAnswered += 1;
      if (row.wouldRecommend) recommendYes += 1;
    }

    const wtp = (row.willingnessToPay ?? "none") as FeedbackWillingnessToPay;
    if (wtp in willingnessToPayBreakdown) {
      willingnessToPayBreakdown[wtp] += 1;
      if (POSITIVE_WTP_VALUES.has(wtp)) {
        willingnessToPayCount += 1;
      }
    } else {
      willingnessToPayBreakdown.none += 1;
    }

    if (
      typeof row.suggestedPriceUah === "number" &&
      Number.isFinite(row.suggestedPriceUah) &&
      row.suggestedPriceUah >= 0
    ) {
      suggestedPrices.push(row.suggestedPriceUah);
    }

    const taskKey = row.task || "unknown";
    taskBreakdown[taskKey] = (taskBreakdown[taskKey] ?? 0) + 1;

    const status = (row.status ?? "new") as FeedbackStatus;
    if (status in statusBreakdown) {
      statusBreakdown[status] += 1;
    } else {
      statusBreakdown.new += 1;
    }

    if (Array.isArray(row.categoryTags)) {
      for (const rawTag of row.categoryTags) {
        const tag = String(rawTag).trim();
        if (!tag) continue;
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    if (row.notifyStatus === "failed") {
      notifyFailuresCount += 1;
    }
  }

  const specifiedOutcomes =
    taskOutcomeBreakdown.completed +
    taskOutcomeBreakdown.partial +
    taskOutcomeBreakdown.failed;

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "uk"))
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalCount,
    uniqueTesters: owners.size,
    averageRating: averageOrNull(ratings),
    ratingDistribution,
    dimensionAverages: {
      ux: averageOrNull(uxRatings),
      usefulness: averageOrNull(usefulnessRatings),
      ai: averageOrNull(aiRatings),
    },
    csatPercent: totalCount > 0 ? round1((csatCount / totalCount) * 100) : null,
    recommendPercent:
      recommendAnswered > 0
        ? round1((recommendYes / recommendAnswered) * 100)
        : null,
    taskCompletionRate:
      specifiedOutcomes > 0
        ? round1((taskOutcomeBreakdown.completed / specifiedOutcomes) * 100)
        : null,
    taskOutcomeBreakdown,
    willingnessToPayBreakdown,
    willingnessToPayCount,
    willingnessToPayPercent:
      totalCount > 0
        ? round1((willingnessToPayCount / totalCount) * 100)
        : null,
    averageSuggestedPriceUah: averageOrNull(suggestedPrices),
    actualDonations: {
      count: Math.max(0, Math.trunc(actualDonations.count || 0)),
      totalUah: round2(Math.max(0, actualDonations.totalUah || 0)),
    },
    pilotPayments: {
      count: Math.max(0, Math.trunc(pilotPayments.count || 0)),
      totalUah: round2(Math.max(0, pilotPayments.totalUah || 0)),
    },
    taskBreakdown,
    statusBreakdown,
    topTags,
    notifyFailuresCount,
  };
}

function escapeMdCell(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtNum(value: number | null, suffix = ""): string {
  if (value === null) return "—";
  return `${value}${suffix}`;
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso.slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
}

export function renderFeedbackReportMarkdown(data: FeedbackReportData): string {
  const { generatedAt, metrics, items, latestSynthesis } = data;
  const lines: string[] = [];

  lines.push("# Звіт про зворотний зв'язок користувачів GrantFolio");
  lines.push("");
  lines.push(`- **Дата формування звіту (UTC):** ${generatedAt}`);
  lines.push(`- **Унікальних тестувальників:** ${metrics.uniqueTesters}`);
  lines.push(`- **Усього збережених відгуків:** ${metrics.totalCount}`);
  lines.push("");

  // Section 1: Cohort & overview
  lines.push("## 1. Огляд та когорта тестувальників");
  lines.push("");
  if (items.length === 0) {
    lines.push("Наразі немає збережених відгуків.");
    lines.push("");
  } else {
    const roleCounts = new Map<string, number>();
    const regionCounts = new Map<string, number>();
    for (const item of items) {
      const role = ROLE_LABELS_UK[item.testerRole] ?? item.testerRole;
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      const region = item.region?.trim();
      if (region) {
        regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      }
    }

    lines.push(
      `Прототип протестували **${metrics.uniqueTesters}** унікальних користувачів, які залишили **${metrics.totalCount}** структурованих відгуків.`,
    );
    lines.push("");
    lines.push("### Розподіл за ролями тестувальників");
    lines.push("");
    lines.push("| Роль | Кількість відгуків |");
    lines.push("| --- | ---: |");
    for (const [role, count] of [...roleCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      lines.push(`| ${escapeMdCell(role)} | ${count} |`);
    }
    lines.push("");

    if (regionCounts.size > 0) {
      lines.push("### Географія (за профілями користувачів)");
      lines.push("");
      lines.push(
        [...regionCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([region, count]) => `- ${escapeMdCell(region)}: ${count}`)
          .join("\n"),
      );
      lines.push("");
    }
  }

  // Section 2: Quantitative metrics
  lines.push("## 2. Кількісні метрики (детерміновані дані БД)");
  lines.push("");
  lines.push("| Показник | Значення |");
  lines.push("| --- | --- |");
  lines.push(`| Середня загальна оцінка (1–5) | ${fmtNum(metrics.averageRating)} |`);
  lines.push(`| CSAT (оцінка 4 або 5) | ${fmtNum(metrics.csatPercent, "%")} |`);
  lines.push(`| Готовність рекомендувати | ${fmtNum(metrics.recommendPercent, "%")} |`);
  lines.push(`| Повне виконання сценарію | ${fmtNum(metrics.taskCompletionRate, "%")} |`);
  lines.push(`| Середня оцінка UX (1–5) | ${fmtNum(metrics.dimensionAverages.ux)} |`);
  lines.push(`| Середня оцінка корисності (1–5) | ${fmtNum(metrics.dimensionAverages.usefulness)} |`);
  lines.push(`| Середня оцінка ШІ-асистента (1–5) | ${fmtNum(metrics.dimensionAverages.ai)} |`);
  lines.push("");

  lines.push("### Розподіл оцінок");
  lines.push("");
  lines.push("| Оцінка | Кількість |");
  lines.push("| --- | ---: |");
  for (const star of ["5", "4", "3", "2", "1"] as const) {
    lines.push(`| ${star} / 5 | ${metrics.ratingDistribution[star]} |`);
  }
  lines.push("");

  lines.push("### Результати виконання сценаріїв");
  lines.push("");
  lines.push("| Результат | Кількість |");
  lines.push("| --- | ---: |");
  for (const key of ["completed", "partial", "failed", "unspecified"] as const) {
    lines.push(`| ${OUTCOME_LABELS_UK[key]} | ${metrics.taskOutcomeBreakdown[key]} |`);
  }
  lines.push("");

  const taskEntries = Object.entries(metrics.taskBreakdown).sort(
    (a, b) => b[1] - a[1],
  );
  if (taskEntries.length > 0) {
    lines.push("### Розподіл за розділами продукту");
    lines.push("");
    lines.push("| Розділ | Кількість |");
    lines.push("| --- | ---: |");
    for (const [task, count] of taskEntries) {
      lines.push(`| ${escapeMdCell(TASK_LABELS_UK[task] ?? task)} | ${count} |`);
    }
    lines.push("");
  }

  if (metrics.topTags.length > 0) {
    lines.push("### Найчастіші теги");
    lines.push("");
    lines.push(
      metrics.topTags
        .map((entry) => `- \`${entry.tag}\`: ${entry.count}`)
        .join("\n"),
    );
    lines.push("");
  }

  // Section 3: Verified AI synthesis
  lines.push("## 3. Перевірений ШІ-синтез відгуків");
  lines.push("");
  if (latestSynthesis?.aiSynthesis) {
    const ai = latestSynthesis.aiSynthesis;
    lines.push(
      `> Згенеровано ${latestSynthesis.createdAt} на основі ${latestSynthesis.feedbackCount} відгуків. ` +
        `Верифікатор цитат: підтверджено **${ai.verification.verifiedQuotesCount}**, відхилено **${ai.verification.rejectedQuotesCount}**.`,
    );
    lines.push("");
    lines.push(ai.executiveSummaryUk);
    lines.push("");
    lines.push(
      `**Тональність:** позитивні — ${ai.sentimentBreakdown.positive}, змішані — ${ai.sentimentBreakdown.mixed}, ` +
        `нейтральні — ${ai.sentimentBreakdown.neutral}, негативні — ${ai.sentimentBreakdown.negative}.`,
    );
    lines.push("");

    if (ai.clusters.length > 0) {
      lines.push("### Виявлені кластери");
      lines.push("");
      for (const cluster of ai.clusters) {
        lines.push(
          `#### ${cluster.title} (\`${cluster.kind}\` / \`${cluster.severity}\`, відгуків: ${cluster.feedbackIds.length})`,
        );
        lines.push("");
        lines.push(`- **Суть:** ${cluster.summaryUk}`);
        lines.push(`- **Рекомендована дія:** ${cluster.recommendedFixUk}`);
        if (cluster.verbatimQuotes.length > 0) {
          lines.push("- **Підтверджені дослівні цитати:**");
          for (const q of cluster.verbatimQuotes) {
            lines.push(`  - «${q.quote}» (\`${q.feedbackId}\`)`);
          }
        }
        lines.push("");
      }
    }

    if (ai.topPriorities.length > 0) {
      lines.push("### Пріоритети на доопрацювання");
      lines.push("");
      for (const [idx, priority] of ai.topPriorities.entries()) {
        lines.push(
          `${idx + 1}. **${priority.title}** (вплив: \`${priority.impact}\`, відгуків: ${priority.feedbackIds.length}) — ${priority.rationaleUk}`,
        );
      }
      lines.push("");
    }

    if (ai.blindSpotsUk.length > 0) {
      lines.push("### Сліпі зони та обмеження тестування");
      lines.push("");
      for (const spot of ai.blindSpotsUk) {
        lines.push(`- ${spot}`);
      }
      lines.push("");
    }
  } else {
    lines.push(
      "Пакетний ШІ-синтез ще не виконувався або наразі вимкнений; звіт базується виключно на детермінованих даних із бази даних.",
    );
    lines.push("");
  }

  // Section 4: Verbatim user quotes
  lines.push("## 4. Дослівні відгуки користувачів");
  lines.push("");
  if (items.length === 0) {
    lines.push("Наразі немає збережених відгуків.");
    lines.push("");
  } else {
    lines.push(
      "| Дата | Роль / Бізнес | Розділ | Оцінка | Результат | Статус | Дослівний коментар |",
    );
    lines.push("| --- | --- | --- | ---: | --- | --- | --- |");
    for (const item of items) {
      const roleLabel = ROLE_LABELS_UK[item.testerRole] ?? item.testerRole;
      const who = item.businessName
        ? `${roleLabel} (${item.businessName})`
        : roleLabel;
      const taskLabel = TASK_LABELS_UK[item.task] ?? item.task;
      const outcomeLabel = OUTCOME_LABELS_UK[item.taskOutcome] ?? item.taskOutcome;
      const statusLabel = STATUS_LABELS_UK[item.status] ?? item.status;
      lines.push(
        `| ${fmtDateShort(item.createdAt)} | ${escapeMdCell(who)} | ${escapeMdCell(taskLabel)} | ${item.rating}/5 | ${escapeMdCell(outcomeLabel)} | ${escapeMdCell(statusLabel)} | ${escapeMdCell(item.comment)} |`,
      );
    }
    lines.push("");
  }

  // Section 5: Audited changes made based on feedback
  lines.push("## 5. Що змінили за відгуками");
  lines.push("");
  const changeRows: Array<{
    date: string;
    feedbackId: string;
    feedbackSnippet: string;
    changeSummary: string;
    ref: string;
    evidence: string;
  }> = [];

  for (const item of items) {
    for (const link of item.changeLinks) {
      changeRows.push({
        date: fmtDateShort(link.createdAt),
        feedbackId: item.id,
        feedbackSnippet: item.comment.slice(0, 120),
        changeSummary: link.changeSummary,
        ref: link.pullRequestOrCommit,
        evidence: link.verificationEvidence ?? "—",
      });
    }
    if (
      item.changeLinks.length === 0 &&
      item.status === "resolved" &&
      (item.resolutionNote || item.resolvedCommitOrPr)
    ) {
      changeRows.push({
        date: fmtDateShort(item.resolvedAt ?? item.createdAt),
        feedbackId: item.id,
        feedbackSnippet: item.comment.slice(0, 120),
        changeSummary: item.resolutionNote ?? "Позначено як вирішено",
        ref: item.resolvedCommitOrPr ?? "—",
        evidence: "Тріаж адміністратора",
      });
    }
  }

  if (changeRows.length === 0) {
    lines.push("Поки що немає зафіксованих змін, прив'язаних до відгуків.");
    lines.push("");
  } else {
    lines.push(
      "| Дата | Відгук (фрагмент) | Що змінили | Commit / PR | Перевірка |",
    );
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of changeRows) {
      lines.push(
        `| ${row.date} | ${escapeMdCell(row.feedbackSnippet)} (\`${row.feedbackId.slice(0, 8)}\`) | ${escapeMdCell(row.changeSummary)} | \`${escapeMdCell(row.ref)}\` | ${escapeMdCell(row.evidence)} |`,
      );
    }
    lines.push("");
  }

  // Section 6: Commercial validation & bonus evidence
  lines.push("## 6. Комерційна валідація: готовність платити, донати та пілотні оплати");
  lines.push("");
  lines.push(
    `- **Висловили готовність платити / підтримати:** ${metrics.willingnessToPayCount} з ${metrics.totalCount} (${fmtNum(metrics.willingnessToPayPercent, "%")})`,
  );
  lines.push(
    `- **Середня запропонована ціна (де вказано):** ${fmtNum(metrics.averageSuggestedPriceUah, " грн")}`,
  );
  lines.push(
    `- **Фактичні зафіксовані донати (таблиця \`donations\`):** ${metrics.actualDonations.count} записів на суму **${metrics.actualDonations.totalUah} грн**`,
  );
  lines.push(
    `- **Підтверджені пілотні оплати (таблиця \`grant_preparation_pilot\`):** ${metrics.pilotPayments.count} записів на суму **${metrics.pilotPayments.totalUah} грн**`,
  );
  lines.push("");
  lines.push("| Модель оплати у відгуках | Кількість |");
  lines.push("| --- | ---: |");
  for (const key of [
    "already_paid",
    "pay_per_application",
    "monthly_subscription",
    "donation_ready",
    "free_only",
    "none",
  ] as const) {
    lines.push(`| ${WTP_LABELS_UK[key]} | ${metrics.willingnessToPayBreakdown[key]} |`);
  }
  lines.push("");

  return lines.join("\n");
}

function neutralizeCsvFormula(text: string): string {
  if (text.length === 0) return text;
  const first = text[0];
  if (
    first === "=" ||
    first === "+" ||
    first === "-" ||
    first === "@" ||
    first === "\t" ||
    first === "\r" ||
    /^\s+[=+\-@]/.test(text)
  ) {
    return `'${text}`;
  }
  return text;
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  const safe = neutralizeCsvFormula(raw);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

const CSV_HEADERS = [
  "id",
  "createdAt",
  "testerRole",
  "businessName",
  "region",
  "task",
  "rating",
  "ratingUx",
  "ratingUsefulness",
  "ratingAi",
  "taskOutcome",
  "wouldRecommend",
  "willingnessToPay",
  "suggestedPriceUah",
  "categoryTags",
  "status",
  "priority",
  "comment",
  "resolutionNote",
  "resolvedCommitOrPr",
  "changeLinksCount",
] as const;

export function renderFeedbackReportCsv(items: FeedbackAdminItem[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const item of items) {
    const cells = [
      item.id,
      item.createdAt,
      item.testerRole,
      item.businessName ?? "",
      item.region ?? "",
      item.task,
      item.rating,
      item.ratingUx ?? "",
      item.ratingUsefulness ?? "",
      item.ratingAi ?? "",
      item.taskOutcome,
      item.wouldRecommend === null ? "" : String(item.wouldRecommend),
      item.willingnessToPay,
      item.suggestedPriceUah ?? "",
      item.categoryTags.join("; "),
      item.status,
      item.priority,
      item.comment,
      item.resolutionNote ?? "",
      item.resolvedCommitOrPr ?? "",
      item.changeLinks.length,
    ];
    rows.push(cells.map(escapeCsvCell).join(","));
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
