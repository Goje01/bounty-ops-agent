import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

import { getGibworkClient } from "./gibwork/client.js";
import { buildContributorProfile } from "./analysis/contributor.js";

/**
 * INTERACTIVE, REAL-MONEY FLOW. This is the only script in the project that
 * can actually move funds. Nothing here executes without an explicit typed
 * "y" — no default, no auto-approve on reputation, no batch mode.
 *
 * Flow per submission:
 *   show reputation context -> ask for amount -> show REAL fee quote from
 *   Gibwork (never guessed/hardcoded) -> explicit final confirm -> sign ->
 *   submit -> show real tx hash
 *
 * Usage: npx tsx src/approve-flow.ts -- <taskId>
 */

function getSigningKeypair(): Keypair {
  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key) throw new Error("SOLANA_PRIVATE_KEY not set.");
  return Keypair.fromSecretKey(bs58.decode(key));
}

async function main() {
  const taskId = process.argv[2];
  if (!taskId) {
    console.log("Usage: npx tsx src/approve-flow.ts -- <taskId>");
    return;
  }

  const client = getGibworkClient();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const page = await client.submissions.list(taskId);
  const pending = page.results.filter((s) => s.status === "OPEN");

  if (pending.length === 0) {
    console.log("No pending (OPEN) submissions on this task.");
    rl.close();
    return;
  }

  console.log(`${pending.length} pending submission(s) on this task.\n`);

  for (const sub of pending) {
    console.log("=".repeat(60));
    console.log(`Submission ${sub.id} by @${(sub.user as any)?.username ?? sub.createdBy}`);
    console.log(`Content: ${(sub.content ?? "").replace(/<[^>]+>/g, " ").trim().slice(0, 300)}`);

    const profile = buildContributorProfile([sub]);
    if (profile) {
      console.log(
        `Reputation (context only, not a verdict): ${profile.platformApproved} approved / ` +
          `${profile.platformRejected} rejected` +
          (profile.platformApprovalRate !== null
            ? ` (${(profile.platformApprovalRate * 100).toFixed(1)}%)`
            : "") +
          `, rating ${profile.platformRating ?? "N/A"}. Confidence: ${profile.confidence}.`
      );
    }

    const decision = (
      await rl.question(
        `\nReview the actual submission yourself before deciding. Approve, reject, or skip? [a/r/s]: `
      )
    )
      .trim()
      .toLowerCase();

    if (decision === "s" || decision === "") {
      console.log("Skipped.\n");
      continue;
    }

    if (decision === "r") {
      const reason = await rl.question("Rejection reason (optional): ");
      try {
        await client.submissions.reject(taskId, sub.id, reason || null);
        console.log("Rejected.\n");
      } catch (err) {
        console.error("Failed to reject:", err);
      }
      continue;
    }

    if (decision !== "a") {
      console.log("Unrecognized input, skipping.\n");
      continue;
    }

    const amount = (await rl.question("Amount to pay (e.g. 1.00): ")).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      console.log("Invalid amount format (need e.g. 1.00). Skipping this submission.\n");
      continue;
    }

    console.log("\nRequesting a real quote from Gibwork (nothing sent yet)...");
    let prepared;
    try {
      prepared = await client.submissions.prepareApproval(taskId, sub.id, { amount });
    } catch (err) {
      console.error("Could not prepare approval:", err);
      continue;
    }

    const q = prepared.approvalQuote;
    console.log("\n--- REAL QUOTE FROM GIBWORK ---");
    console.log(`Gross amount:     ${q.grossApprovalAmount} ${q.token.symbol}`);
    console.log(`Platform fee:     ${q.platformFee.amount} ${q.token.symbol} (${q.platformFee.percent}%)`);
    console.log(`Contributor gets: ${q.netPayoutAmount} ${q.token.symbol}`);
    console.log(`Closes task:      ${q.closeTask}`);
    console.log("-------------------------------");

    const finalConfirm = await rl.question(
      `\nThis will send REAL funds on mainnet. Type exactly "confirm" to proceed, anything else cancels: `
    );

    if (finalConfirm.trim() !== "confirm") {
      console.log("Cancelled — nothing was sent.\n");
      continue;
    }

    try {
      const keypair = getSigningKeypair();
      const tx = Transaction.from(Buffer.from(prepared.serializedTransaction, "base64"));
      tx.partialSign(keypair);
      const signed = tx.serialize().toString("base64");

      const result = await client.submissions.submitApproval(
        taskId,
        sub.id,
        prepared.intentId,
        signed
      );

      console.log(`\n✅ Approved and paid. Transaction: ${result.txHash}\n`);
    } catch (err) {
      console.error(
        "\n⚠ Something went wrong during signing/submission. Do NOT assume the " +
          "payment didn't happen — check the transaction on Solscan/your wallet " +
          "before retrying, to avoid a double payout.\n",
        err
      );
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
