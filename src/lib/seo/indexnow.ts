/**
 * IndexNow (CTO checklist 4.6): tells Bing and the other IndexNow engines which
 * URLs are new or changed, so a match page is indexed in minutes and not days.
 * Copilot and ChatGPT search read Bing's index. Needs INDEXNOW_KEY; with none set
 * the cron does nothing. The key is also served at /indexnow.txt, which is where
 * the engines check it.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol accepts up to 10,000 URLs per request. */
export const INDEXNOW_MAX = 10_000;

/** Pages worth pushing daily: not the thousands of club and player pages, which change slowly and are crawled anyway. */
export function pushableUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  for (const u of urls) {
    const path = u.replace(/^https?:\/\/[^/]+/, "");
    if (/^\/[a-z]+\/(player|team)\//.test(path)) continue;
    seen.add(u.replace(/&amp;/g, "&"));
  }
  return [...seen].slice(0, INDEXNOW_MAX);
}

export function indexNowPayload(host: string, key: string, siteUrl: string, urls: string[]) {
  return { host, key, keyLocation: `${siteUrl}/indexnow.txt`, urlList: urls };
}
