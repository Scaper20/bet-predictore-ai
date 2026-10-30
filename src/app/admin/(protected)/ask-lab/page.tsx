import type { Metadata } from "next";
import { requirePermission } from "@/lib/admin";
import { can } from "@/lib/admin-access";
import { askConfig } from "@/lib/ask/config";
import { PRESETS, labKey, labRuns, liveByTier, type Stats } from "@/lib/ask/lab";
import { getPlans } from "@/lib/plan-prices";
import { allOffers } from "@/lib/offers-server";
import { runPreflight } from "@/lib/ask/preflight";
import { ASK_FREE_DAILY, ASK_PAID_DAILY, ASK_VIP_DAILY } from "@/lib/ask/request";
import { KpiTile, PageHeader, Panel, SectionLabel, StatusPill } from "@/components/admin/kit";
import { AdminTable, AdminTableCell, AdminTableHead, AdminTableRow } from "@/components/admin/admin-table";
import { AskLabRunner, RateAnswer } from "@/components/admin/ask-lab-runner";

export const metadata: Metadata = { title: "Ask lab" };
/** Each lab question is one server action call running a full question, tool rounds included. */
export const maxDuration = 120;

const NAIRA_PER_USD = Number(process.env.ASK_NAIRA_PER_USD) || 1600;
const usd = (m: number) => `$${(m / 1_000_000).toFixed(4)}`;
const naira = (m: number) => `₦${((m / 1_000_000) * NAIRA_PER_USD).toLocaleString("en-NG", { maximumFractionDigits: m < 1_000_000 ? 1 : 0 })}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/**
 * Ask KiqStat's costs, measured: live questions by plan, and the lab, which
 * runs 40 test questions under chosen settings on a separate key and compares
 * cost, speed and answers. Projections use the measured averages and maxima.
 */
export default async function AskLabPage() {
  const me = await requirePermission("model.view");
  const canRun = can(me.roles, "model.manage");
  const config = askConfig();
  const [{ runs, rows }, tiers, plans, offers, preflight] = await Promise.all([labRuns(), liveByTier(30), getPlans(), allOffers().catch(() => []), runPreflight()]);
  const price = {
    pro: plans.find((p) => p.id === "pro")?.price.monthly ?? 0,
    vip: plans.find((p) => p.id === "vip")?.price.monthly ?? 0,
    pass: offers.find((o) => o.audience === "new_visitors")?.priceNaira ?? 500,
  };
  const allowance = { free: ASK_FREE_DAILY * 30, pro: ASK_PAID_DAILY * 30, vip: ASK_VIP_DAILY * 30, pass: config.passDaily };
  const recentRuns = runs.slice(0, 3);
  const cases = [...new Set(rows.filter((r) => recentRuns.some((x) => x.runId === r.runId)).map((r) => r.caseId))];

  return (
    <div>
      <PageHeader
        eyebrow="Product"
        title="Ask lab"
        description="What Ask KiqStat really costs: live questions by plan, and side-by-side tests of cheaper settings on a separate key before anything changes in production."
      />

      <section className="mb-8">
        <SectionLabel>Before Ask answers again · docs/ask-activation.md</SectionLabel>
        <Panel flush>
          <AdminTable>
            <AdminTableHead columns={["Check", "State", "Detail"]} />
            <tbody>
              {preflight.map((c) => (
                <AdminTableRow key={c.id}>
                  <AdminTableCell>{c.label}</AdminTableCell>
                  <AdminTableCell>
                    <StatusPill tone={c.state === "ok" ? "brand" : c.state === "warn" ? "amber" : "rose"}>{c.state === "ok" ? "Ready" : c.state === "warn" ? "Check" : "Blocked"}</StatusPill>
                  </AdminTableCell>
                  <AdminTableCell className="text-xs text-ink-muted">{c.detail}</AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminTable>
        </Panel>
      </section>

      <section className="mb-8">
        <SectionLabel>Production settings</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Model" value={config.model.replace("claude-", "")} hint={`${config.maxTokens.toLocaleString()} tokens a call · ${config.maxRounds} calls · ${config.effort}`} />
          <KpiTile label="Money guard" value={config.guard} hint={config.guard === "enforce" ? "Caps stop questions" : config.guard === "observe" ? "Records what caps would stop" : "No caps"} tone={config.guard === "enforce" ? "brand" : "amber"} />
          <KpiTile label="Per question" value={usd(config.requestCeilingMicros)} hint={`${naira(config.requestCeilingMicros)} ceiling`} tone="cyan" />
          <KpiTile label="Daily budget" value={usd(config.dailyBudgetMicros)} hint={`All of Ask · VIP account ${usd(config.dailyCapMicros.vip)}/day`} tone="violet" />
        </div>
      </section>

      <section className="mb-8">
        <SectionLabel>Live questions by plan · last 30 days</SectionLabel>
        {tiers.length === 0 ? (
          <p className="text-xs text-ink-dim">No live questions logged yet. Logging starts once migration 0088 is applied and Ask is answering again.</p>
        ) : (
          <Panel flush>
            <AdminTable>
              <AdminTableHead columns={["Plan", "Questions", "Answered", "Accounts", "Avg cost", "Highest", "Most one account spent in a day", "Total"]} />
              <tbody>
                {tiers.map((t) => (
                  <AdminTableRow key={t.tier}>
                    <AdminTableCell className="capitalize">{t.tier}</AdminTableCell>
                    <AdminTableCell className="font-mono">{t.stats.n}</AdminTableCell>
                    <AdminTableCell className="font-mono">{pct(t.stats.answered, t.stats.n)}</AdminTableCell>
                    <AdminTableCell className="font-mono">{t.accounts}</AdminTableCell>
                    <AdminTableCell className="font-mono">{naira(t.stats.avgCost)}</AdminTableCell>
                    <AdminTableCell className="font-mono">{naira(t.stats.maxCost)}</AdminTableCell>
                    <AdminTableCell className="font-mono">{naira(t.maxPerAccountDay)}</AdminTableCell>
                    <AdminTableCell className="font-mono">{usd(t.totalCost)}</AdminTableCell>
                  </AdminTableRow>
                ))}
              </tbody>
            </AdminTable>
          </Panel>
        )}
      </section>

      <section className="mb-8">
        <SectionLabel>Run the test questions</SectionLabel>
        <Panel>
          {!labKey() ? (
            <p className="text-sm text-ink-muted">
              Add <code className="rounded bg-surface-2 px-1 font-mono text-xs">ANTHROPIC_TEST_API_KEY</code> to this environment (a key from a separate Anthropic workspace with
              its own spend limit) to run the lab. It never uses the production key.
            </p>
          ) : !canRun ? (
            <p className="text-sm text-ink-muted">Running the lab spends money, so it needs the owner&apos;s headline-engine permission.</p>
          ) : null}
          <div className={labKey() && canRun ? "" : "mt-4 opacity-60"}>
            <AskLabRunner presets={PRESETS.map(({ id, name, detail }) => ({ id, name, detail }))} ready={Boolean(labKey()) && canRun} />
          </div>
          <p className="mt-3 text-xs text-ink-dim">
            40 questions across simple lookups, analysis, combos, tool-heavy comparisons, prices, live scores and off-topic asks, filled with this week&apos;s fixtures. A run costs
            roughly $0.05–$0.30.
          </p>
        </Panel>
      </section>

      {runs.length > 0 && (
        <>
          <section className="mb-8">
            <SectionLabel>Runs compared</SectionLabel>
            <Panel flush>
              <AdminTable>
                <AdminTableHead columns={["Run", "Settings", "Answered", "Avg cost", "95th pct", "Highest", "Avg time", "95th pct time", "Calls", "Output tokens", "From cache", "Stopped", "Rated good"]} />
                <tbody>
                  {runs.map((r) => {
                    const rated = rows.filter((x) => x.runId === r.runId && x.rating);
                    return (
                      <AdminTableRow key={r.runId}>
                        <AdminTableCell className="font-mono text-[11px]">{r.runId}</AdminTableCell>
                        <AdminTableCell className="font-mono text-[11px]">{r.label}</AdminTableCell>
                        <AdminTableCell className="font-mono">
                          {r.overall.answered}/{r.overall.n}
                        </AdminTableCell>
                        <AdminTableCell className="font-mono">{naira(r.overall.avgCost)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{naira(r.overall.p95Cost)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{naira(r.overall.maxCost)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{secs(r.overall.avgMs)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{secs(r.overall.p95Ms)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{r.overall.avgCalls.toFixed(1)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{Math.round(r.overall.avgOutput)}</AdminTableCell>
                        <AdminTableCell className="font-mono">{Math.round(r.overall.cacheShare * 100)}%</AdminTableCell>
                        <AdminTableCell className="font-mono">{r.overall.stopped}</AdminTableCell>
                        <AdminTableCell className="font-mono">{rated.length ? pct(rated.filter((x) => x.rating === "good").length, rated.length) : "—"}</AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                </tbody>
              </AdminTable>
            </Panel>
          </section>

          <section className="mb-8">
            <SectionLabel>Every subscriber at full allowance, 30 days · from measured costs</SectionLabel>
            <Panel flush>
              <AdminTable>
                <AdminTableHead columns={["Run", "Pro at avg", "Pro at 95th pct", "VIP at avg", "VIP at 95th pct", "Pass at avg", "Pass at 95th pct"]} />
                <tbody>
                  {runs.map((r) => (
                    <AdminTableRow key={r.runId}>
                      <AdminTableCell className="font-mono text-[11px]">{r.label}</AdminTableCell>
                      <Margin cost={r.overall.avgCost * allowance.pro} price={price.pro} />
                      <Margin cost={r.overall.p95Cost * allowance.pro} price={price.pro} />
                      <Margin cost={r.overall.avgCost * allowance.vip} price={price.vip} />
                      <Margin cost={r.overall.p95Cost * allowance.vip} price={price.vip} />
                      <Margin cost={r.overall.avgCost * allowance.pass} price={price.pass} />
                      <Margin cost={r.overall.p95Cost * allowance.pass} price={price.pass} />
                    </AdminTableRow>
                  ))}
                </tbody>
              </AdminTable>
            </Panel>
            <p className="mt-2 text-xs text-ink-dim">
              Cost of a month at the full daily allowance (Pro {ASK_PAID_DAILY}, VIP {ASK_VIP_DAILY}, pass {allowance.pass} for its day) against the monthly price (pass: its own price),
              at ₦{NAIRA_PER_USD.toLocaleString()} to the dollar, before Paystack&apos;s fee. Green leaves at least 60% of the price.
            </p>
          </section>

          <section className="mb-8">
            <SectionLabel>By kind of question · latest runs</SectionLabel>
            <Panel flush>
              <AdminTable>
                <AdminTableHead columns={["Kind", ...recentRuns.map((r) => r.label)]} />
                <tbody>
                  {["simple", "analysis", "combo", "tool_heavy", "price", "live", "off_topic"].map((cat) => (
                    <AdminTableRow key={cat}>
                      <AdminTableCell className="capitalize">{cat.replace("_", " ")}</AdminTableCell>
                      {recentRuns.map((r) => {
                        const s: Stats | undefined = r.byCategory[cat as keyof typeof r.byCategory];
                        return (
                          <AdminTableCell key={r.runId} className="font-mono text-xs">
                            {s ? `${naira(s.avgCost)} avg · ${naira(s.maxCost)} max · ${secs(s.avgMs)}` : "—"}
                          </AdminTableCell>
                        );
                      })}
                    </AdminTableRow>
                  ))}
                </tbody>
              </AdminTable>
            </Panel>
          </section>

          <section>
            <SectionLabel>Answers side by side · rate them to compare quality</SectionLabel>
            <div className="space-y-3">
              {cases.map((caseId) => {
                const forCase = recentRuns.map((r) => rows.find((x) => x.runId === r.runId && x.caseId === caseId));
                const first = forCase.find(Boolean);
                return (
                  <Panel key={caseId} title={first?.question ?? caseId} meta={`${caseId} · ${first?.category.replace("_", " ")}`}>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {forCase.map((x, i) => (
                        <div key={recentRuns[i].runId} className="min-w-0 rounded-lg border border-line p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[10.5px] text-ink-dim">{recentRuns[i].label}</span>
                            {x && (
                              <span className="font-mono text-[10.5px] text-ink-dim">
                                {naira(x.costMicros)} · {secs(x.ms)} · {x.calls} calls
                              </span>
                            )}
                          </div>
                          {!x ? (
                            <p className="text-xs text-ink-dim">Not run.</p>
                          ) : (
                            <>
                              {x.outcome !== "answered" && <StatusPill tone={x.outcome === "budget_stop" ? "amber" : "rose"}>{x.outcome}</StatusPill>}
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">{x.answer ?? "No answer."}</p>
                              <p className="mt-2 text-[10.5px] text-ink-dim">
                                {x.tools.length ? x.tools.join(", ") : "no lookups"}
                                {x.picks ? ` · ${x.picks} cards` : ""}
                              </p>
                              <div className="mt-2">
                                <RateAnswer questionId={x.questionId} rating={x.rating} />
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </Panel>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Margin({ cost, price }: { cost: number; price: number }) {
  const share = price ? ((cost / 1_000_000) * NAIRA_PER_USD) / price : 0;
  const tone = share <= 0.4 ? "text-brand" : share <= 1 ? "text-amber" : "text-rose";
  return (
    <AdminTableCell className={`font-mono text-xs ${tone}`}>
      {naira(cost)} · {Math.round(share * 100)}%
    </AdminTableCell>
  );
}
