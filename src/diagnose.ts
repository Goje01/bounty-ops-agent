import { getMyTasksWithSubmissions } from "./gibwork/dataLayer.js";

/**
 * READ-ONLY diagnostic. Calls only tasks.list and submissions.list (GET
 * requests) — nothing here can create, update, approve, reject, or refund
 * anything. Safe to run against mainnet with a real wallet.
 *
 * Purpose: resolve the two open unknowns from the design doc by inspecting
 * the RAW shape of real API responses (bypassing the SDK's declared types,
 * which is exactly the point — the .d.ts may under-report real fields).
 */
async function main() {
  console.log("Fetching your tasks + submissions from Gibwork (read-only)...\n");

  const data = await getMyTasksWithSubmissions();

  console.log(`Found ${data.length} task(s).\n`);

  for (const { task, submissions } of data) {
    console.log("=".repeat(60));
    console.log("TASK (raw):");
    console.log(JSON.stringify(task, null, 2));

    // Unknown #1 check: does a deadline field exist anywhere on the raw task,
    // even if the SDK's TypeScript type doesn't declare it?
    const hasDeadlineLike = Object.keys(task as object).some((k) =>
      k.toLowerCase().includes("deadline") || k.toLowerCase().includes("expir")
    );
    console.log(
      `\n[CHECK] deadline-like field present on raw task? ${hasDeadlineLike}`
    );

    console.log(`\n${submissions.length} submission(s) on this task:`);
    for (const s of submissions) {
      console.log("-".repeat(40));
      console.log(JSON.stringify(s, null, 2));
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log(
    "Done. Please copy this ENTIRE output back to me (redact your wallet " +
    "address / any private info if you want) so we can confirm the two " +
    "open unknowns and move to the next build phase."
  );
}

main().catch((err) => {
  console.error("Error while fetching data:", err);
  process.exit(1);
});
