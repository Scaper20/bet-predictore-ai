/** The IndexNow key, served where the engines look for it (lib/seo/indexnow.ts). 404 until INDEXNOW_KEY is set. */
export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
