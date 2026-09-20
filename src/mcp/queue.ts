import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { askGemini } from "./gemini.js";

export type QueueStatus = "pending" | "sent" | "failed" | "expired";

export interface QueuedMessage {
  id: string;
  systemPrompt: string;
  userMessage: string;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: number;
  response?: string;
  error?: string;
  createdAt: number;
}

const QUEUE_PATH = "./.data/message-queue.json";
const MAX_BACKOFF_MS = 300_000;
const GIVE_UP_AFTER_ATTEMPTS = 200;
const STALE_AFTER_MS = 30 * 60 * 1000;

async function loadQueue(): Promise<QueuedMessage[]> {
  try {
    const raw = await readFile(QUEUE_PATH, "utf-8");
    return JSON.parse(raw) as QueuedMessage[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedMessage[]): Promise<void> {
  await mkdir(dirname(QUEUE_PATH), { recursive: true });
  await writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2), "utf-8");
}

function backoffFor(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}

export async function enqueueMessage(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const queue = await loadQueue();
  const entry: QueuedMessage = {
    id: randomUUID(),
    systemPrompt,
    userMessage,
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
  };
  queue.push(entry);
  await saveQueue(queue);
  return entry.id;
}

let isProcessing = false;

export async function processQueue(
  onResolved: (entry: QueuedMessage) => void
): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    await processQueueInner(onResolved);
  } finally {
    isProcessing = false;
  }
}

async function processQueueInner(
  onResolved: (entry: QueuedMessage) => void
): Promise<void> {
  const queue = await loadQueue();
  const now = Date.now();
  let changed = false;

  for (const entry of queue) {
    if (entry.status !== "pending" || entry.nextAttemptAt > now) continue;

    if (now - entry.createdAt > STALE_AFTER_MS) {
      entry.status = "expired";
      changed = true;
      onResolved(entry);
      continue;
    }

    try {
      const response = await askGemini(entry.systemPrompt, entry.userMessage);
      entry.status = "sent";
      entry.response = response;
      changed = true;
      onResolved(entry);
    } catch (err) {
      entry.attempts += 1;
      entry.error = err instanceof Error ? err.message : String(err);
      changed = true;

      if (entry.attempts >= GIVE_UP_AFTER_ATTEMPTS) {
        entry.status = "failed";
        onResolved(entry);
      } else {
        entry.nextAttemptAt = now + backoffFor(entry.attempts);
      }
    }
  }

  if (changed) await saveQueue(queue);
}

export async function pruneQueue(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
  const queue = await loadQueue();
  const cutoff = Date.now() - olderThanMs;
  const kept = queue.filter(
    (e) => e.status === "pending" || e.createdAt > cutoff
  );
  if (kept.length !== queue.length) await saveQueue(kept);
}

export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.filter((e) => e.status === "pending").length;
}