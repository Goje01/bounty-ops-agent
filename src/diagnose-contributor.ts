import { getGibworkClient } from "./gibwork/client.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * READ-ONLY. Fetches submissions for specific task IDs and filters down to
 * the ones made by YOUR wallet (the one in .env). Gibwork's SDK has no
 * "list all my submissions across every task" endpoint — submissions.list()
 * is always scoped to one task at a time — so this takes task IDs you
 * already know you contributed to (e.g. from app.gib.work's earnings page).
 *
 * Usage:
 *   npm run diagnose-contributor -- <taskId1> <taskId2> ...
 */
function getMyWalletAddress(): string | null {
  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key) return null;
  try {
    const secretKey = bs58.decode(key);
    return Keypair.fromSecretKey(secretKey).publicKey.toBase58();
  } catch {
    return null; // couldn't decode — comparison just gets skipped, not fatal
  }
}

async function main() {
  const taskIds = process.argv.slice(2);

  if (taskIds.length === 0) {
    console.log(
      "No task IDs given.\n\n" +
        "Usage: npm run diagnose-contributor -- <taskId1> <taskId2> ...\n\n" +
        "Grab a task ID from a bounty you've submitted work to on app.gib.work " +
        "(usually visible in the task's URL)."
    );
    return;
  }

  const client = getGibworkClient();
  const myWallet = getMyWalletAddress();
  console.log(
    myWallet
      ? `Comparing against your wallet: ${myWallet}\n`
      : "Could not derive your wallet address from the private key — showing all submissions instead.\n"
  );

  for (const taskId of taskIds) {
    console.log("=".repeat(60));
    console.log(`TASK ${taskId} — fetching submissions (read-only)...`);

    try {
      const page = await client.submissions.list(taskId);
      console.log(`Found ${page.results.length} submission(s) total on this task.`);

      const mine = myWallet
        ? page.results.filter((s) => s.createdBy === myWallet)
        : page.results;

      if (myWallet && mine.length === 0 && page.results.length > 0) {
        console.log(
          "None matched your wallet by `createdBy` — showing all submissions " +
            "on this task raw so we can see the real field name/shape."
        );
      }

      const toShow = mine.length ? mine : page.results;
      console.log(`\nShowing ${toShow.length} submission(s) (raw):`);
      for (const s of toShow) {
        console.log("-".repeat(40));
        console.log(JSON.stringify(s, null, 2));
      }
    } catch (err) {
      console.error(`Error fetching submissions for task ${taskId}:`, err);
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log(
    "Done. Copy this output back so we can confirm the version-history and " +
      "payout-status unknowns."
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
