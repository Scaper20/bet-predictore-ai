import { NextResponse } from "next/server";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site-url";
import { INDEXNOW_ENDPOINT, indexNowPayload, pushableUrls } from "@/lib/seo/indexnow";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily IndexNow push of the sitemap's pages (CTO checklist 4.6). Same CRON_SECRET gate as the other cron routes. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.INDEXNOW_KEY;
  if (!key) return NextResponse.json({ skipped: "INDEXNOW_KEY is not set" });

  const urls = pushableUrls((await sitemap()).map((e) => e.url));
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowPayload(new URL(SITE_URL).hostname, key, SITE_URL, urls)),
  });
  return NextResponse.json({ submitted: urls.length, status: res.status });
}
