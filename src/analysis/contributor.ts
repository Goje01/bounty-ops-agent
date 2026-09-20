import type { TaskSubmission } from "@gibwork/sdk";

export interface ContributorProfile {
  userId: string;
  username: string;

  // Platform-wide, as reported directly by Gibwork on every submission.
  platformApproved: number;
  platformRejected: number;
  platformRating: number | null;
  platformApprovalRate: number | null; // 0-1, null if no decided history yet

  // Scoped to just the tasks THIS creator has seen this contributor submit to.
  submissionsOnMyTasks: number;
  approvedOnMyTasks: number;
  rejectedOnMyTasks: number;

  // Deterministic confidence label — not an AI guess, just a rule on sample size.
  confidence: "low" | "moderate" | "high";
  confidenceNote: string;
}

function computeApprovalRate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;
  if (decided === 0) return null;
  return approved / decided;
}

function computeConfidence(platformDecided: number): {
  confidence: ContributorProfile["confidence"];
  note: string;
} {
  if (platformDecided < 3) {
    return {
      confidence: "low",
      note: `Only ${platformDecided} decided submission(s) on record platform-wide — too little history to weigh heavily.`,
    };
  }
  if (platformDecided < 15) {
    return {
      confidence: "moderate",
      note: `${platformDecided} decided submissions on record — a reasonable but still limited sample.`,
    };
  }
  return {
    confidence: "high",
    note: `${platformDecided} decided submissions on record — a substantial track record.`,
  };
}

/**
 * Builds a reputation profile for one contributor from submissions we've
 * already fetched for our own tasks. Every field here is a FACT pulled
 * directly from Gibwork's data — no AI involved, and reputation is never
 * treated as authority to auto-approve anything (per architecture rules).
 */
export function buildContributorProfile(
  submissionsFromThisUser: TaskSubmission[]
): ContributorProfile | null {
  if (submissionsFromThisUser.length === 0) return null;

  const first = submissionsFromThisUser[0];
  const user = first.user as unknown as {
    id: string;
    username: string;
    approvedTaskSubmissions: number;
    rejectedTaskSubmissions: number;
    rating: number | null;
  };

  const platformApproved = user.approvedTaskSubmissions ?? 0;
  const platformRejected = user.rejectedTaskSubmissions ?? 0;
  const platformRating = user.rating ?? null;
  const platformApprovalRate = computeApprovalRate(platformApproved, platformRejected);

  const approvedOnMyTasks = submissionsFromThisUser.filter(
    (s) => s.status === "CLAIMED"
  ).length;
  const rejectedOnMyTasks = submissionsFromThisUser.filter(
    (s) => s.status === "REJECTED"
    // Note: "CLOSED" with reason "funds fully paid out" is NOT a rejection —
    // it means the bounty ran out of budget, not that the work was bad.
  ).length;

  const { confidence, note } = computeConfidence(platformApproved + platformRejected);

  return {
    userId: user.id,
    username: user.username,
    platformApproved,
    platformRejected,
    platformRating,
    platformApprovalRate,
    submissionsOnMyTasks: submissionsFromThisUser.length,
    approvedOnMyTasks,
    rejectedOnMyTasks,
    confidence,
    confidenceNote: note,
  };
}

/**
 * Groups a flat submission list into one profile per unique contributor.
 */
export function buildContributorProfiles(
  allSubmissions: TaskSubmission[]
): ContributorProfile[] {
  const byUser = new Map<string, TaskSubmission[]>();
  for (const s of allSubmissions) {
    const userId = (s.user as unknown as { id: string })?.id ?? s.createdBy;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(s);
  }

  const profiles: ContributorProfile[] = [];
  for (const submissions of byUser.values()) {
    const profile = buildContributorProfile(submissions);
    if (profile) profiles.push(profile);
  }
  return profiles;
}
