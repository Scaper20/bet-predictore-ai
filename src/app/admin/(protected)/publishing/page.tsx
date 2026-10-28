import type { Metadata } from "next";
import { requirePermission } from "@/lib/admin";
import { can } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELECTIONS, type SelectionDef } from "@/lib/model/selections";
import { selectionPolicyFresh } from "@/lib/selection-policy";
import { headlineByRule } from "@/lib/model/predict";
import { hubByRule } from "@/lib/code-hub";
import { SelectionToggle } from "@/components/admin/selection-toggle";

export const metadata: Metadata = { title: "Publishing" };
export const dynamic = "force-dynamic";

interface Record {
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  stated: number;
  pending: number;
}

const empty = (): Record => ({ graded: 0, wins: 0, losses: 0, pushes: 0, stated: 0, pending: 0 });

/** Each selection's live record: as a published headline (predictions_log) and watched in shadow (shadow_picks). */
async function records(): Promise<{ published: Map<string, Record>; shadow: Map<string, Record> }> {
  const db = supabaseAdmin();
  const markets = SELECTIONS.map((s) => s.market);
  const [pub, sh] = await Promise.all([
    db.from("predictions_log").select("market, probability, result").in("market", markets).order("kickoff", { ascending: false }).limit(20000),
    db.from("shadow_picks").select("market, probability, result").in("market", markets).neq("reason", "market-total").order("kickoff", { ascending: false }).limit(20000),
  ]);
  const tally = (rows: { market: string; probability: number | string; result: string | null }[] | null) => {
    const out = new Map<string, Record & { sum: number }>();
    for (const r of rows ?? []) {
      const t = out.get(r.market) ?? { ...empty(), sum: 0 };
      if (r.result === null) t.pending++;
      else {
        t.graded++;
        t.sum += Number(r.probability);
        if (r.result === "win") t.wins++;
        else if (r.result === "lose") t.losses++;
        else t.pushes++;
      }
      out.set(r.market, t);
    }
    return new Map([...out].map(([k, { sum, ...t }]) => [k, { ...t, stated: t.graded ? sum / t.graded : 0 }]));
  };
  return { published: tally(pub.data as never), shadow: tally(sh.data as never) };
}

export default async function PublishingPage() {
  const identity = await requirePermission("model.view");
  const canSwitch = can(identity.roles, "model.manage");
  const [policy, rec] = await Promise.all([selectionPolicyFresh(), records().catch(() => ({ published: new Map(), shadow: new Map() }))]);
  const groups = [...new Set(SELECTIONS.map((s) => s.group))];

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Product</p>
        <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Publishing</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Which selections may be published, as the headline pick or in the Code Hub&rsquo;s codes. Each starts on the
          rules in code; a switch with an amber ring is your call, and <span className="text-ink">Default</span> hands it
          back. Changes reach the site within a few minutes; Code Hub codes take them from the next morning&rsquo;s build.
          A selection usually earns its place at about 200 graded picks landing at or above its stated chance.
        </p>
      </div>

      {!canSwitch && <p className="card p-4 text-sm text-ink-muted">You can see the records here. Only the owner can publish or retract a selection.</p>}

      {groups.map((g) => (
        <section key={g} className="card overflow-hidden">
          <h2 className="border-b border-line px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dim">{g}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="text-ink-dim">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Selection</th>
                  <th className="px-3 py-2 text-right font-medium">As headline</th>
                  <th className="px-3 py-2 text-right font-medium">Watched</th>
                  <th className="px-3 py-2 text-right font-medium">Headline</th>
                  <th className="px-4 py-2 text-right font-medium">Code Hub</th>
                </tr>
              </thead>
              <tbody>
                {SELECTIONS.filter((s) => s.group === g).map((s) => (
                  <Row key={s.market} s={s} policy={policy[s.market] ?? {}} published={rec.published.get(s.market)} shadow={rec.shadow.get(s.market)} canSwitch={canSwitch} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  s,
  policy,
  published,
  shadow,
  canSwitch,
}: {
  s: SelectionDef;
  policy: { headline?: boolean; codeHub?: boolean };
  published?: Record;
  shadow?: Record;
  canSwitch: boolean;
}) {
  const headlineDefault = !s.extra && headlineByRule(s.market);
  const hubDefault = !s.extra && hubByRule(s.market);
  const headline = policy.headline ?? headlineDefault;
  const hub = s.noCodeHub ? false : (policy.codeHub ?? hubDefault);
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="px-4 py-2.5 font-semibold text-ink">{s.label}</td>
      <td className="px-3 py-2.5 text-right"><RecordCell r={published} /></td>
      <td className="px-3 py-2.5 text-right"><RecordCell r={shadow} /></td>
      <td className="px-3 py-2.5 text-right">
        {canSwitch ? (
          <SelectionToggle market={s.market} surface="headline" on={headline} manual={policy.headline !== undefined} label={s.label} />
        ) : (
          <State on={headline} />
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {canSwitch ? (
          <SelectionToggle
            market={s.market}
            surface="codeHub"
            on={hub}
            manual={policy.codeHub !== undefined}
            label={s.label}
            disabled={s.noCodeHub}
            disabledNote="Settled at half time: a code is graded from the final score."
          />
        ) : (
          <State on={hub} />
        )}
      </td>
    </tr>
  );
}

function State({ on }: { on: boolean }) {
  return <span className={on ? "font-semibold text-brand" : "text-ink-dim"}>{on ? "Published" : "Off"}</span>;
}

/** "81.6% of 98 · 77% stated", lit green or red once 20+ are graded. */
function RecordCell({ r }: { r?: Record }) {
  if (!r || r.graded === 0) return <span className="text-ink-dim">{r?.pending ? `${r.pending} pending` : "—"}</span>;
  const decided = r.wins + r.losses;
  const landed = decided ? r.wins / decided : 0;
  const gap = landed - r.stated;
  const tone = decided < 20 ? "text-ink" : gap >= 0 ? "text-brand" : gap < -0.03 ? "text-rose" : "text-ink";
  return (
    <span className="tnum font-mono">
      <span className={`font-semibold ${tone}`}>{(landed * 100).toFixed(1)}%</span>
      <span className="text-ink-dim">
        {" "}
        of {decided} · {(r.stated * 100).toFixed(0)}% stated
      </span>
    </span>
  );
}
