/**
 * Verifies RESEND_API_KEY + EMAIL_FROM actually work before trusting them
 * inside a live webhook/signup path — sends one real email.
 *
 * Deliberately does NOT import from src/lib/email.ts — that file (like
 * src/lib/supabase/admin.ts) starts with `import "server-only"`, which
 * throws immediately outside a Next.js react-server bundling context. tsx
 * runs this as a plain Node script, so builds its own Resend client inline
 * instead (same reasoning as scripts/create-admin.ts).
 *
 * Usage:
 *   npx tsx scripts/smoke-email.ts --to=you@example.com
 */
import "dotenv/config";
import { Resend } from "resend";

function parseArgs() {
  const args = process.argv.slice(2);
  const to = args.find((a) => a.startsWith("--to="))?.split("=")[1];
  if (!to) {
    console.error("Usage: tsx scripts/smoke-email.ts --to=you@example.com");
    process.exit(1);
  }
  return { to };
}

async function main() {
  const { to } = parseArgs();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Set RESEND_API_KEY in .env first.");
    process.exit(1);
  }
  const from = process.env.EMAIL_FROM ?? "BetriX <hello@betrix.com.ng>";

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "BetriX email smoke test",
    html: "<p>If you're reading this, RESEND_API_KEY and EMAIL_FROM are wired up correctly.</p>",
  });

  if (error) {
    console.error("FAILED:", error);
    process.exit(1);
  }
  console.log(`Sent (id: ${data?.id}) to ${to} from ${from}. Check the inbox.`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
