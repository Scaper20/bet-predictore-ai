import type { Metadata } from "next";
import { getWhatsappDigests } from "@/lib/admin-analytics";
import { CopyButton } from "@/components/admin/copy-button";
import { RegenerateDigestButton } from "@/components/admin/regenerate-digest-button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { APP_TIMEZONE } from "@/lib/format";

export const metadata: Metadata = { title: "WhatsApp digest" };

export default async function AdminWhatsappDigestPage() {
  const digests = await getWhatsappDigests();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
  const todays = digests.find((d) => d.digestDate === today);
  const history = digests.filter((d) => d.digestDate !== today);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">WhatsApp digest</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Computed once a day, early morning. Copy each message below and paste it into the
            KiqStat Picks community — nothing here posts to WhatsApp automatically.
          </p>
        </div>
        <RegenerateDigestButton />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">Today</h2>
        {!todays ? (
          <EmptyState
            icon="🗓️"
            title="Not generated yet"
            description="The daily cron runs early morning. If it's later than that and this is still empty, hit “Regenerate for today.”"
          />
        ) : (
          <DigestMessages digest={todays} />
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Recent history</h2>
          {history.map((d) => (
            <details key={d.id} className="card p-4 sm:p-5">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">
                  {new Date(d.digestDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <Badge tone={d.hasPicks ? "brand" : "neutral"}>
                  {d.hasPicks ? `${1 + d.accaMessages.length} messages` : "No pick"}
                </Badge>
              </summary>
              <div className="mt-4">
                <DigestMessages digest={d} />
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

function DigestMessages({
  digest,
}: {
  digest: { hasPicks: boolean; picksMessage: string; accaMessages: string[] };
}) {
  return (
    <div className="space-y-3">
      <MessageCard title={digest.hasPicks ? "Today's picks" : "No pick today"} text={digest.picksMessage} />
      {digest.accaMessages.map((msg, i) => (
        <MessageCard key={i} title={`Acca message ${i + 1}`} text={msg} />
      ))}
    </div>
  );
}

function MessageCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{text}</pre>
    </div>
  );
}
