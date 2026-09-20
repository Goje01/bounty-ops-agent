import type { TaskSubmission, WalletTaskSummary } from "@gibwork/sdk";
import type {
  ActionRecommendation,
  HealthAssessment,
  TaskAnalysis,
} from "./types.js";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const STALE_AGE_DAYS = 5; // open, zero submissions, older than this = stale
const EXPIRING_SOON_HOURS = 48; // deadline within this window = expiring
const PENDING_TOO_LONG_DAYS = 3; // a pending submission older than this needs review

/**
 * WalletTaskSummary's declared type does not include `deadline` (confirmed from
 * the SDK's own .d.ts). It MAY still exist on the raw JSON response — untyped.
 * This reads it defensively so the rest of the pipeline never assumes it's there.
 */
function readDeadline(task: WalletTaskSummary): Date | null {
  const raw = (task as unknown as { deadline?: string | null }).deadline;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / MS_PER_DAY;
}

/**
 * A submission counts as "pending" for review-urgency purposes if the SDK's
 * TaskSubmissionStatus is OPEN (awaiting creator decision). CLAIMING /
 * WAITING_CLAIM / PROCESSING sit between approval and actual payout completing
 * — worth its own flag since that's likely where the real "unpaid" bug lives.
 */
function isAwaitingReview(s: TaskSubmission): boolean {
  return s.status === "OPEN";
}

function isAwaitingPayoutCompletion(s: TaskSubmission): boolean {
  return s.status === "CLAIMING" || s.status === "WAITING_CLAIM";
}

export function classifyTask(
  task: WalletTaskSummary,
  submissions: TaskSubmission[],
  now: Date = new Date()
): HealthAssessment {
  const flags: string[] = [];
  const reasons: string[] = [];

  const createdAt = new Date(task.createdAt);
  const ageDays = daysBetween(now, createdAt);
  const deadline = readDeadline(task);

  const hasNoSubmissions = task.totalSubmissions === 0;
  const isStale = hasNoSubmissions && ageDays > STALE_AGE_DAYS && task.isOpen;

  const pendingSubmissions = submissions.filter(isAwaitingReview);
  const oldestPendingDays = pendingSubmissions.length
    ? Math.max(
        ...pendingSubmissions.map((s) => daysBetween(now, new Date(s.createdAt)))
      )
    : 0;
  const needsReview =
    pendingSubmissions.length > 0 && oldestPendingDays > PENDING_TOO_LONG_DAYS;

  const stuckPayouts = submissions.filter(isAwaitingPayoutCompletion);

  let hoursToDeadline: number | null = null;
  let isExpiringSoon = false;
  if (deadline) {
    hoursToDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    isExpiringSoon = task.isOpen && hoursToDeadline <= EXPIRING_SOON_HOURS;
  }

  if (isStale) {
    flags.push("stale");
    reasons.push(
      `No submissions after ${ageDays.toFixed(1)} days open (threshold: ${STALE_AGE_DAYS}d)`
    );
  }
  if (needsReview) {
    flags.push("needs_review");
    reasons.push(
      `${pendingSubmissions.length} submission(s) awaiting review, oldest ${oldestPendingDays.toFixed(1)} days`
    );
  }
  if (isExpiringSoon) {
    flags.push("expiring");
    reasons.push(
      `Deadline in ${hoursToDeadline!.toFixed(1)} hours` +
        (hasNoSubmissions ? " with zero submissions" : "")
    );
  }
  if (stuckPayouts.length > 0) {
    flags.push("payment_pending");
    reasons.push(
      `${stuckPayouts.length} approved submission(s) stuck awaiting payout claim`
    );
  }
  if (!deadline && task.isOpen) {
    flags.push("deadline_unknown");
    reasons.push("Task deadline could not be determined from the API response");
  }

  // Priority order, worst first.
  let status: HealthAssessment["status"] = "healthy";
  let urgency: HealthAssessment["urgency"] = "low";

  if (isExpiringSoon && hasNoSubmissions) {
    status = "critical";
    urgency = "critical";
  } else if (isExpiringSoon || needsReview) {
    status = isExpiringSoon ? "expiring" : "needs_review";
    urgency = "high";
  } else if (isStale) {
    status = "stale";
    urgency = "medium";
  } else if (flags.includes("payment_pending")) {
    status = "watch";
    urgency = "medium";
  } else if (flags.includes("deadline_unknown")) {
    status = "deadline_unknown";
    urgency = "low";
  }

  return { status, urgency, flags, reasons };
}

export function recommendActions(
  task: WalletTaskSummary,
  submissions: TaskSubmission[],
  health: HealthAssessment
): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];

  if (health.flags.includes("stale")) {
    actions.push({
      type: "task_update_reward",
      reason:
        "Task has zero submissions after an extended period — consider boosting the reward or clarifying scope.",
      requiresHumanConfirmation: true,
    });
  }

  if (health.flags.includes("expiring") && task.totalSubmissions === 0) {
    actions.push({
      type: "task_update_deadline",
      reason:
        "Deadline is close with no submissions yet — extending gives contributors a real chance.",
      requiresHumanConfirmation: true,
    });
  }

  if (health.flags.includes("needs_review")) {
    actions.push({
      type: "comment_create",
      reason:
        "A pending submission has been waiting a while — a status comment keeps the contributor informed.",
      requiresHumanConfirmation: true,
    });
    actions.push({
      type: "manual_review",
      reason: "Review the pending submission(s) to approve or reject.",
      requiresHumanConfirmation: true,
    });
  }

  if (health.flags.includes("payment_pending")) {
    actions.push({
      type: "manual_review",
      reason:
        "Submission was approved but payout hasn't completed — verify on-chain status before assuming it's resolved.",
      requiresHumanConfirmation: true,
    });
  }

  return actions;
}

export function analyzeTask(
  task: WalletTaskSummary,
  submissions: TaskSubmission[],
  now?: Date
): TaskAnalysis {
  const health = classifyTask(task, submissions, now);
  const recommendedActions = recommendActions(task, submissions, health);
  return { task, submissions, health, recommendedActions };
}
