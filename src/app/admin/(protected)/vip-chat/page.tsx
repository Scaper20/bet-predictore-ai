import type { Metadata } from "next";
import { Badge } from "@/components/ui/primitives";
import { VipInviteForm } from "@/components/admin/vip-invite-form";
import { setVipRemoved } from "@/app/actions/admin/vip-chat";
import { vipChatSettings, vipRoster, type RosterRow } from "@/lib/vip-chat-store";
import { formatWhatsAppNumber, type RosterStatus } from "@/lib/vip-chat";

export const metadata: Metadata = { title: "VIP chat" };
export const dynamic = "force-dynamic";

const STATUS: Record<RosterStatus, { label: string; tone: "brand" | "amber" | "rose" | "neutral" }> = {
  remove: { label: "Remove from group", tone: "rose" },
  "not-joined": { label: "Hasn't joined", tone: "amber" },
  in: { label: "VIP, in the chat", tone: "brand" },
  out: { label: "Out", tone: "neutral" },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : "–";

export default async function AdminVipChatPage() {
  const [settings, roster] = await Promise.all([vipChatSettings(), vipRoster()]);
  const count = (s: RosterStatus) => roster.rows.filter((r) => r.status === s).length;
  const toRemove = roster.rows.filter((r) => r.status === "remove");

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">VIP chat</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The members-only WhatsApp group. Keep &ldquo;Approve new participants&rdquo; on in the group settings and let in a
          request only when its number is on this list as VIP. When a plan lapses the number moves to the top under
          &ldquo;Remove from group&rdquo;: take it out in WhatsApp, then mark it here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="In the chat" value={count("in")} />
        <Tile label="VIP, not joined" value={count("not-joined") + roster.noNumber.length} />
        <Tile label="To remove" value={count("remove")} alert={count("remove") > 0} />
        <Tile label="Removed or left" value={count("out")} />
      </div>

      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Invite link</h2>
          {settings.inviteUrl ? <Badge tone="brand">Set</Badge> : <Badge tone="amber">Not set: members can&rsquo;t join</Badge>}
        </div>
        <p className="text-xs leading-relaxed text-ink-dim">
          Only VIP members are sent to this link, and only after the site checks their plan; it never appears in a page.
          If it leaks, reset it in WhatsApp (Group info → Invite via link → Reset link) and paste the new one.
          {settings.updatedAt && <> Last changed {when(settings.updatedAt)}.</>}
        </p>
        <VipInviteForm current={settings.inviteUrl} />
      </section>

      {toRemove.length > 0 && (
        <section className="card border-rose/30 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-rose">Remove these numbers from the group</h2>
          <p className="mt-1 text-xs text-ink-dim">Their VIP plan has ended.</p>
          <Roster rows={toRemove} />
        </section>
      )}

      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-ink">Members</h2>
        <p className="mt-1 text-xs text-ink-dim">Everyone who has given a number, lapsed members first.</p>
        {roster.rows.length === 0 ? <p className="mt-4 text-sm text-ink-muted">Nobody yet.</p> : <Roster rows={roster.rows} />}
      </section>

      {roster.noNumber.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-ink">VIP members without a number</h2>
          <p className="mt-1 text-xs text-ink-dim">On a VIP plan but haven&rsquo;t opened kiqstat.app/vip yet. Worth a nudge.</p>
          <ul className="mt-4 divide-y divide-line text-sm">
            {roster.noNumber.map((r) => (
              <li key={r.userId} className="py-2 text-ink-muted">
                {r.name ? <span className="text-ink">{r.name} · </span> : null}
                {r.email ?? r.userId}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-dim">{label}</p>
      <p className={`tnum mt-1 font-mono text-2xl ${alert ? "text-rose" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Roster({ rows }: { rows: RosterRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-ink-dim">
          <tr className="border-b border-line">
            <th className="py-2 pr-4 font-medium">Number</th>
            <th className="py-2 pr-4 font-medium">Account</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Last opened the link</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.userId}>
              <td className="tnum py-2.5 pr-4 font-mono text-ink">{r.whatsappNumber ? formatWhatsAppNumber(r.whatsappNumber) : "–"}</td>
              <td className="max-w-[16rem] truncate py-2.5 pr-4 text-ink-muted">{r.name ?? r.email ?? r.userId}</td>
              <td className="py-2.5 pr-4">
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </td>
              <td className="py-2.5 pr-4 text-xs text-ink-dim">{when(r.lastOpenedAt)}</td>
              <td className="py-2.5 text-right">
                {(r.status === "remove" || (r.status === "out" && r.removedAt)) && (
                  <form action={setVipRemoved}>
                    <input type="hidden" name="userId" value={r.userId} />
                    <input type="hidden" name="removed" value={r.status === "remove" ? "1" : "0"} />
                    <button type="submit" className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink">
                      {r.status === "remove" ? "Mark removed" : "Undo"}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
