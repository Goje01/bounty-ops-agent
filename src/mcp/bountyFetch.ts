/**
 * Fetches a PUBLIC bounty page from gib.work and extracts what it can.
 * There's no official "get single task" API endpoint (confirmed against the
 * real SDK/MCP contract — no task-get tool exists), so for bounties the
 * connected wallet didn't create, reading the public page is the only path.
 * We rely on Open Graph meta tags first (reliable, present for link
 * previews on most sites), with a raw-text fallback.
 */
export interface PublicBountyInfo {
  url: string;
  title: string | null;
  description: string | null;
  rawTextSnippet: string;
}

function extractMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(re);
  if (match) return decodeHtmlEntities(match[1]);

  // Also try name= instead of property=, and content-before-property ordering.
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    "i"
  );
  const match2 = html.match(re2);
  return match2 ? decodeHtmlEntities(match2[1]) : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPublicBounty(url: string): Promise<PublicBountyInfo> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GibworkGuideAgent/0.1)" },
  });

  if (!res.ok) {
    throw new Error(`Could not fetch ${url} — HTTP ${res.status}`);
  }

  const html = await res.text();

  const title = extractMeta(html, "og:title");
  const description = extractMeta(html, "og:description");

  const plain = stripHtml(html);
  const rawTextSnippet = plain.slice(0, 4000); // keep prompt sizes sane

  return { url, title, description, rawTextSnippet };
}
