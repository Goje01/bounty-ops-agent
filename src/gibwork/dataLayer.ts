import type { TaskSubmission, WalletTaskSummary } from "@gibwork/sdk";
import { getGibworkClient } from "./client.js";

export interface TaskWithSubmissions {
  task: WalletTaskSummary;
  submissions: TaskSubmission[];
}

/**
 * Pulls every page of a paginated Gibwork list endpoint into a single array.
 */
async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ results: T[]; lastPage: number }>
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { results, lastPage } = await fetchPage(page);
    all.push(...results);
    if (page >= lastPage || results.length === 0) break;
    page += 1;
  }
  return all;
}

/**
 * The single foundation call every feature (Contributor Intelligence, Watchdog,
 * Submission Intelligence) reads from. Fetches all of the connected wallet's
 * tasks, then every submission on each task, in one pass.
 */
export async function getMyTasksWithSubmissions(): Promise<TaskWithSubmissions[]> {
  const client = getGibworkClient();

  const tasks = await fetchAllPages((page) =>
    client.tasks.list({ page, limit: 50 })
  );

  const withSubmissions = await Promise.all(
    tasks.map(async (task) => {
      const submissions = await fetchAllPages((page) =>
        client.submissions.list(task.id, { page, limit: 50 })
      );
      return { task, submissions };
    })
  );

  return withSubmissions;
}
