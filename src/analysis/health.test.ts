import { analyzeTask } from "./health.js";
import type { TaskSubmission, WalletTaskSummary } from "@gibwork/sdk";

const NOW = new Date("2026-09-13T00:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function baseTask(overrides: Partial<WalletTaskSummary>): WalletTaskSummary {
  return {
    id: "task-1",
    createdAt: daysAgo(1),
    type: "tasks",
    status: "in progress",
    approvedSubmissions: 0,
    totalSubmissions: 0,
    title: "Test task",
    isOpen: true,
    canEdit: true,
    canApprove: true,
    canReject: true,
    canRefund: true,
    asset: {
      decimals: 6,
      imageUrl: null,
      symbol: "USDC",
      amount: 50,
      rewarded: 0,
      price: "1",
      mintAddress: null,
    },
    rewardedAmount: 0,
    rewardedPrice: "0",
    ...overrides,
  } as WalletTaskSummary;
}

function baseSubmission(overrides: Partial<TaskSubmission>): TaskSubmission {
  return {
    id: "sub-1",
    taskId: "task-1",
    content: "test",
    status: "OPEN",
    assetId: null,
    transactionId: null,
    rejectReason: null,
    blinks: false,
    isHidden: false,
    referralId: null,
    createdBy: "wallet-abc",
    createdAt: daysAgo(1),
    rating: null,
    user: {} as never,
    comments: [],
    media: [],
    asset: null,
    ...overrides,
  } as TaskSubmission;
}

const cases: Array<[string, WalletTaskSummary, TaskSubmission[]]> = [
  [
    "Stale: 9 days old, zero submissions",
    baseTask({ createdAt: daysAgo(9), totalSubmissions: 0 }),
    [],
  ],
  [
    "Needs review: pending submission 5 days old",
    baseTask({ createdAt: daysAgo(6), totalSubmissions: 1 }),
    [baseSubmission({ status: "OPEN", createdAt: daysAgo(5) })],
  ],
  [
    "Healthy: fresh task, no submissions yet",
    baseTask({ createdAt: daysAgo(1), totalSubmissions: 0 }),
    [],
  ],
  [
    "Payment pending: approved but stuck claiming",
    baseTask({ createdAt: daysAgo(3), totalSubmissions: 1, approvedSubmissions: 1 }),
    [baseSubmission({ status: "WAITING_CLAIM", createdAt: daysAgo(3) })],
  ],
];

for (const [label, task, submissions] of cases) {
  const result = analyzeTask(task, submissions, NOW);
  console.log(`\n=== ${label} ===`);
  console.log("status:", result.health.status, "| urgency:", result.health.urgency);
  console.log("flags:", result.health.flags);
  console.log("reasons:", result.health.reasons);
  console.log(
    "actions:",
    result.recommendedActions.map((a) => a.type)
  );
}
