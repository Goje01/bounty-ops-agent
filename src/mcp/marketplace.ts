/**
 * Public, unauthenticated bounty listing endpoint — the same one gib.work's
 * own website uses to power its "explore" page. No wallet/auth needed.
 * Confirmed to exist and be paginated (lastPage + results[]) from Gibwork's
 * own public GitHub issue tracker, but the exact field names on each result
 * are NOT independently confirmed here (couldn't reach it from this sandbox
 * to inspect real output) — so this passes the raw JSON straight to the AI
 * to interpret, rather than assuming specific field names that might be wrong.
 */
export async function fetchAvailableBounties(page = 1, limit = 20): Promise<unknown> {
  const url = `https://app.gib.work/api/explore?page=${page}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GibworkGuideAgent/0.1)" },
  });

  if (!res.ok) {
    throw new Error(`Could not reach the bounty listing (HTTP ${res.status}).`);
  }

  return res.json();
}
