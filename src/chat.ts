import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fetchPublicBounty } from "./mcp/bountyFetch.js";
import { fetchAvailableBounties } from "./mcp/marketplace.js";
import { getMyTasksWithSubmissions } from "./gibwork/dataLayer.js";
import { buildContributorProfiles } from "./analysis/contributor.js";
import { enqueueMessage, processQueue, pruneQueue, getPendingCount } from "./mcp/queue.js";
import type { QueuedMessage } from "./mcp/queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDocs(): string {
  const files = ["mcp/docs/gibwork-overview.md", "mcp/docs/gibwork-cli-reference.md"];
  return files.map((f) => readFileSync(join(__dirname, f), "utf-8")).join("\n\n---\n\n");
}

const GIBWORK_DOCS = loadDocs();
const URL_RE = /^https?:\/\/\S+$/i;

const CREATE_BOUNTY_RE =
  /\b(create|post|make|start|set up|fund|launch)\b.{0,20}\b(a |an |new )?bounty\b|\bnew task\b.{0,20}\bcreate\b/i;

const CREATE_BOUNTY_REFUSAL =
  "I can technically walk you through creating a bounty on Gibwork, but " +
  "that specific feature has been turned off for this tool on purpose — " +
  "the creator (Goje) decided not to include it, since AI-assisted bounty " +
  "creation has already been built elsewhere and this project's job is to " +
  "help with everything else around Gibwork instead. Happy to help with " +
  "almost anything else — finding available work, understanding a bounty's " +
  "requirements, checking contributor reputation on your own bounty, or " +
  "general questions about how the platform works.";

const pendingLabels = new Map<string, string>();

let activeSpinnerId: string | null = null;
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;
const SPINNER_FRAMES = [".  ", ".. ", "...", "   "];

function startSpinner(id: string) {
  activeSpinnerId = id;
  spinnerFrame = 0;
  process.stdout.write("Thinking" + SPINNER_FRAMES[0]);
  spinnerTimer = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write("\rThinking" + SPINNER_FRAMES[spinnerFrame]);
  }, 400);
}

function stopSpinner() {
  if (spinnerTimer) clearInterval(spinnerTimer);
  spinnerTimer = null;
  activeSpinnerId = null;
  process.stdout.write("\r" + " ".repeat(20) + "\r");
}

function printResolved(entry: QueuedMessage) {
  const label = pendingLabels.get(entry.id) ?? "your earlier message";
  const wasActive = entry.id === activeSpinnerId;
  pendingLabels.delete(entry.id);

  if (wasActive) stopSpinner();

  if (entry.status === "sent") {
    console.log((wasActive ? "" : "\n") + entry.response + "\n");
  } else if (entry.status === "failed") {
    console.log(
      (wasActive ? "" : "\n") +
        `Sorry, I couldn't get an answer through after trying for a while — ${entry.error}\n`
    );
  }
  if (!wasActive) process.stdout.write("> ");
}

async function main() {
  console.log("Gibwork Guide Agent (terminal) — ask anything, paste a bounty link,");
  console.log("or type 'rep <taskId>' for contributor reputation on your own bounty.");
  console.log(
    "Messages that fail to send will keep retrying in the background, even " +
      "across restarts, until they get through. Type 'exit' to quit.\n"
  );

  await pruneQueue();
  const pendingOnStartup = await getPendingCount();
  if (pendingOnStartup > 0) {
    console.log(
      `(${pendingOnStartup} message(s) from last time are still being retried)\n`
    );
  }

  const worker = setInterval(() => {
    processQueue(printResolved).catch(() => {});
  }, 3000);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const input = (await rl.question("> ")).trim();
    if (!input) continue;
    if (input.toLowerCase() === "exit") break;

    if (CREATE_BOUNTY_RE.test(input)) {
      console.log("\n" + CREATE_BOUNTY_REFUSAL + "\n");
      continue;
    }

    if (input.toLowerCase().startsWith("rep ")) {
      const taskId = input.slice(4).trim();
      try {
        const myTasks = await getMyTasksWithSubmissions();
        const match = myTasks.find((t) => t.task.id === taskId);
        if (!match) {
          console.log(
            "\nThat task ID isn't one of your own bounties — reputation info is " +
              "only available for bounties YOU created, to protect contributor privacy.\n"
          );
          continue;
        }
        const profiles = buildContributorProfiles(match.submissions);
        if (profiles.length === 0) {
          console.log("\nNo submissions on this task yet.\n");
          continue;
        }
        console.log();
        for (const p of profiles) {
          console.log(
            `@${p.username}: ${p.platformApproved} approved / ${p.platformRejected} rejected` +
              (p.platformApprovalRate !== null
                ? ` (${(p.platformApprovalRate * 100).toFixed(1)}%)`
                : "") +
              `, rating ${p.platformRating ?? "N/A"} — ${p.confidence} confidence`
          );
        }
        console.log();
      } catch (err) {
        console.error("\nCouldn't fetch that:", err instanceof Error ? err.message : err, "\n");
      }
      continue;
    }

    let systemPrompt: string;
    let userMessage: string;

    if (URL_RE.test(input)) {
      console.log("\nReading that bounty...\n");
      try {
        const info = await fetchPublicBounty(input);
        systemPrompt =
          "You are a helpful, honest guide for Gibwork bounties. You explain, you don't do the work for people.";
        userMessage =
          `Explain what this bounty is asking for, emphasizing the specific ` +
          `requirements. Don't draft the submission for the user, just explain.\n\n` +
          `Title: ${info.title ?? "(unknown)"}\n` +
          `Description: ${info.description ?? "(not available)"}\n` +
          `Page text: ${info.rawTextSnippet.slice(0, 1500)}`;
      } catch (err) {
        console.error("\nCouldn't read that page:", err instanceof Error ? err.message : err, "\n");
        continue;
      }
    } else if (
      /\b(available|latest|open|find (a |)(bounty|bounties|task|work)|work for me|new bounties)\b/i.test(
        input
      )
    ) {
      try {
        const listing = await fetchAvailableBounties(1, 15);
        systemPrompt =
          `You are a helpful guide for Gibwork. Below is REAL, LIVE data from ` +
          `Gibwork's public bounty listing (JSON) — use ONLY this data to answer, ` +
          `summarizing the available bounties (title, reward if present, any ` +
          `other useful field) in plain language. If the JSON structure is ` +
          `unclear or doesn't contain what's needed, say so honestly rather ` +
          `than inventing bounties.\n\nLive data:\n${JSON.stringify(listing).slice(0, 6000)}`;
        userMessage = input;
      } catch (err) {
        systemPrompt =
          "You are a helpful guide for Gibwork. Live bounty data could not be " +
          "fetched right now — say so plainly and suggest checking gib.work directly.";
        userMessage = input;
      }
    } else {
      systemPrompt =
        `You are a helpful guide for the Gibwork platform. Answer using ONLY ` +
        `the reference material below — if it doesn't cover the question, say ` +
        `you're not certain rather than guessing.\n\n${GIBWORK_DOCS}`;
      userMessage = input;
    }

    const id = await enqueueMessage(systemPrompt, userMessage);
    pendingLabels.set(id, input.length > 60 ? input.slice(0, 57) + "..." : input);
    startSpinner(id);

    await processQueue(printResolved);
  }

  clearInterval(worker);
  rl.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});