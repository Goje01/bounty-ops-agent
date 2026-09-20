import { getMyTasksWithSubmissions } from "./gibwork/dataLayer.js";
import { buildContributorProfiles } from "./analysis/contributor.js";
import type { TaskSubmission } from "@gibwork/sdk";

/**
 * READ-ONLY. Contributor Intelligence — reputation profiles for everyone
 * who has submitted to any of your bounties. Reputation is context, never
 * authority: this never approves or recommends payment on its own.
 */
async function main() {
  console.log("Fetching your tasks + submissions from Gibwork (read-only)...\n");

  const data = await getMyTasksWithSubmissions();
  const allSubmissions: TaskSubmission[] = data.flatMap((d) => d.submissions);

  if (allSubmissions.length === 0) {
    console.log("No submissions found across your tasks yet.");
    return;
  }

  const profiles = buildContributorProfiles(allSubmissions);

  console.log(`CONTRIBUTOR INTELLIGENCE`);
  console.log(`${profiles.length} contributor(s) found across your bounties\n`);
  console.log("=".repeat(60));

  // Sort by platform approval rate (highest first), unranked ones last.
  profiles.sort((a, b) => (b.platformApprovalRate ?? -1) - (a.platformApprovalRate ?? -1));

  for (const p of profiles) {
    console.log(`\n@${p.username}`);
    console.log(
      `   Platform-wide: ${p.platformApproved} approved / ${p.platformRejected} rejected` +
        (p.platformApprovalRate !== null
          ? ` (${(p.platformApprovalRate * 100).toFixed(1)}% approval rate)`
          : " (no decided history yet)")
    );
    if (p.platformRating !== null) {
      console.log(`   Platform rating: ${p.platformRating}`);
    }
    console.log(
      `   On your bounties: ${p.submissionsOnMyTasks} submission(s), ${p.approvedOnMyTasks} approved`
    );
    console.log(`   Confidence: ${p.confidence} — ${p.confidenceNote}`);
    console.log(
      `   Note: this is context, not a verdict — always review the actual submission.`
    );
    console.log("-".repeat(60));
  }
}

main().catch((err) => {
  console.error("Fatal error running contributor intel:", err);
  process.exit(1);
});
