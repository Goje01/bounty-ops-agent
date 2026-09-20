import { getMyTasksWithSubmissions } from "./gibwork/dataLayer.js";
import { analyzeTask } from "./analysis/health.js";
import { checkForChange } from "./storage/snapshots.js";
import type { TaskSubmission } from "@gibwork/sdk";

/**
 * READ-ONLY. Combines Bounty Health + Expiry + Submission-change detection
 * into one report, run against all of the connected wallet's real tasks.
 * This is the "gibwork watchdog" command from the design doc — Section 51's
 * output format, built on top of the already-tested health.ts + snapshots.ts.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function urgencyIcon(urgency: string): string {
  switch (urgency) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    default:
      return "🟢";
  }
}

async function main() {
  console.log("Fetching your tasks + submissions from Gibwork (read-only)...\n");

  const data = await getMyTasksWithSubmissions();

  if (data.length === 0) {
    console.log("No tasks found for this wallet.");
    return;
  }

  console.log(`GIBWORK WATCHDOG`);
  console.log(`${data.length} task(s) scanned\n`);
  console.log("=".repeat(60));

  for (const { task, submissions } of data) {
    const analysis = analyzeTask(task, submissions);

    // Check each submission for changes since we last saw it (cheap hash
    // compare — only flags something if content actually differs).
    const changedSubmissions: TaskSubmission[] = [];
    for (const s of submissions) {
      const plainContent = stripHtml(s.content ?? "");
      const result = await checkForChange(s.id, task.id, s.createdBy, plainContent);
      if (result.changed && !result.isFirstObservation) {
        changedSubmissions.push(s);
      }
    }

    console.log(
      `\n${urgencyIcon(analysis.health.urgency)} ${task.title.trim()}  [${analysis.health.status.toUpperCase()}]`
    );
    console.log(`   Status: ${task.status} | Open: ${task.isOpen}`);
    console.log(
      `   Submissions: ${task.totalSubmissions} total, ${task.approvedSubmissions} approved`
    );

    if (analysis.health.reasons.length > 0) {
      console.log(`   Why flagged:`);
      for (const reason of analysis.health.reasons) {
        console.log(`     - ${reason}`);
      }
    }

    if (changedSubmissions.length > 0) {
      console.log(`   Recently changed submissions:`);
      for (const s of changedSubmissions) {
        console.log(`     - Submission ${s.id} was edited since last check`);
      }
    }

    if (analysis.recommendedActions.length > 0) {
      console.log(`   Recommended next step(s):`);
      for (const action of analysis.recommendedActions) {
        console.log(`     -> [${action.type}] ${action.reason}`);
      }
    } else {
      console.log(`   No action needed right now.`);
    }

    console.log("-".repeat(60));
  }

  console.log(
    "\nAll actions above are recommendations only — nothing was changed, " +
      "approved, or paid. Nothing here writes to Gibwork."
  );
}

main().catch((err) => {
  console.error("Fatal error running watchdog:", err);
  process.exit(1);
});
