import type { TaskSubmission, WalletTaskSummary } from "@gibwork/sdk";

export type HealthStatus =
  | "healthy"
  | "watch"
  | "stale"
  | "needs_review"
  | "expiring"
  | "critical"
  | "deadline_unknown";

export type Urgency = "low" | "medium" | "high" | "critical";

export interface HealthAssessment {
  status: HealthStatus;
  urgency: Urgency;
  flags: string[];
  reasons: string[];
}

export type ActionType =
  | "task_update_deadline"
  | "task_update_reward"
  | "task_update_tags"
  | "comment_create"
  | "submission_approve"
  | "submission_reject"
  | "task_refund"
  | "manual_review";

export interface ActionRecommendation {
  type: ActionType;
  reason: string;
  requiresHumanConfirmation: true; // always true — never optional
  payload?: unknown;
}

export interface TaskAnalysis {
  task: WalletTaskSummary;
  submissions: TaskSubmission[];
  health: HealthAssessment;
  recommendedActions: ActionRecommendation[];
}
