import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface SubmissionSnapshot {
  submissionId: string;
  taskId: string;
  contributor: string;
  capturedAt: string;
  content: string;
  links: string[];
  contentHash: string;
}

type SnapshotStore = Record<string, SubmissionSnapshot>;

const DEFAULT_PATH = "./.data/snapshots.json";

function hashContent(content: string, links: string[]): string {
  return createHash("sha256")
    .update(content + "|" + links.sort().join(","))
    .digest("hex");
}

async function loadStore(path: string): Promise<SnapshotStore> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as SnapshotStore;
  } catch {
    return {};
  }
}

async function saveStore(path: string, store: SnapshotStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), "utf-8");
}

function extractLinks(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s)]+/g);
  return matches ?? [];
}

export interface SnapshotDiffResult {
  isFirstObservation: boolean;
  changed: boolean;
  previous: SubmissionSnapshot | null;
  current: SubmissionSnapshot;
}

/**
 * Compares current submission content against the last-seen snapshot.
 * Cheap hash comparison first — only worth running exact diff / AI semantic
 * analysis on top of this if `changed` is true (cost control, per spec).
 */
export async function checkForChange(
  submissionId: string,
  taskId: string,
  contributor: string,
  content: string,
  path: string = DEFAULT_PATH
): Promise<SnapshotDiffResult> {
  const store = await loadStore(path);
  const links = extractLinks(content);
  const contentHash = hashContent(content, links);

  const current: SubmissionSnapshot = {
    submissionId,
    taskId,
    contributor,
    capturedAt: new Date().toISOString(),
    content,
    links,
    contentHash,
  };

  const previous = store[submissionId] ?? null;
  const isFirstObservation = previous === null;
  const changed = isFirstObservation || previous.contentHash !== contentHash;

  if (changed) {
    store[submissionId] = current;
    await saveStore(path, store);
  }

  return { isFirstObservation, changed, previous, current };
}
