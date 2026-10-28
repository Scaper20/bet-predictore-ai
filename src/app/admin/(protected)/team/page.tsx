import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin";
import { ALL_PERMISSIONS, PERMISSIONS, ROLES, ROLE_IDS, cleanRoles, type Permission, type Role } from "@/lib/admin-access";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { RemoveAdminButton } from "@/components/admin/remove-admin-button";
import { AddMemberForm, RoleEditor } from "@/components/admin/team-forms";
import { KpiTile, PageHeader, Panel, SectionLabel, timeAgo } from "@/components/admin/kit";
import { AdminIcon } from "@/components/admin/admin-icons";

export const metadata: Metadata = { title: "Team & roles" };

interface StaffRow {
  id: string;
  roles: string[] | null;
  created_at: string;
  created_by: string | null;
  profiles: { email: string | null } | { email: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function AdminTeamPage() {
  const me = await requirePermission("team.manage");
  const admin = supabaseAdmin();
  const [{ data }, { data: audit }] = await Promise.all([
    admin.from("admin_users").select("id, roles, created_at, created_by, profiles!admin_users_id_fkey(email)").order("created_at", { ascending: true }),
    admin.from("admin_audit_log").select("admin_id, created_at").order("created_at", { ascending: false }).limit(2000),
  ]);

  const rows = (data ?? []) as unknown as StaffRow[];
  const staff = rows.map((r) => ({ ...r, roles: cleanRoles(r.roles), email: one(r.profiles)?.email ?? null }));
  const emailById = new Map(staff.map((s) => [s.id, s.email]));
  const lastAction = new Map<string, string>();
  for (const a of audit ?? []) if (a.admin_id && !lastAction.has(a.admin_id)) lastAction.set(a.admin_id, a.created_at);

  const count = (r: Role) => staff.filter((s) => s.roles.includes(r)).length;
  const groups = [...new Set(ALL_PERMISSIONS.map((p) => PERMISSIONS[p].group))];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Governance"
        title="Team & roles"
        description="Who can get into admin and what each person can do. Access comes from roles, never granted one page at a time, so what a role allows is the same for everyone who holds it. Every change here is written to the audit log."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiTile label="Staff" value={String(staff.length)} hint="With admin access" />
        {ROLE_IDS.map((r) => (
          <KpiTile key={r} label={ROLES[r].label} value={String(count(r))} tone={r === "owner" ? "gold" : "brand"} hint={ROLES[r].short} />
        ))}
      </div>

      <section>
        <SectionLabel>Members</SectionLabel>
        <AdminTable>
          <AdminTableHead columns={["Person", "Roles", "Added", "Last change", ""]} />
          <tbody>
            {staff.map((s) => (
              <AdminTableRow key={s.id}>
                <AdminTableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[11px] text-ink">
                      {(s.email ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-ink">{s.email ?? "—"}</p>
                      {s.id === me.id && <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand">You</p>}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="min-w-[22rem]">
                  <RoleEditor targetId={s.id} targetEmail={s.email ?? ""} roles={s.roles} />
                </AdminTableCell>
                <AdminTableCell className="whitespace-nowrap text-xs text-ink-muted">
                  {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  <span className="block text-[11px] text-ink-dim">
                    {s.created_by ? `by ${emailById.get(s.created_by)?.split("@")[0] ?? "a former admin"}` : "by setup script"}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="whitespace-nowrap font-mono text-[11px] text-ink-dim">
                  {lastAction.has(s.id) ? timeAgo(lastAction.get(s.id)!) : "never"}
                </AdminTableCell>
                <AdminTableCell>
                  <RemoveAdminButton targetId={s.id} targetEmail={s.email ?? ""} />
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminTable>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Add a teammate" meta="least access first" className="lg:col-span-1">
          <AddMemberForm />
          <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-dim">
            For a login that is only for admin (not tied to a site account), run{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">scripts/create-admin.ts --role=…</code>.
          </p>
        </Panel>

        <Panel title="What each role can do" meta={`${ALL_PERMISSIONS.length} permissions`} className="lg:col-span-2" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/40 text-left">
                  <th className="px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-dim sm:px-5">Permission</th>
                  {ROLE_IDS.map((r) => (
                    <th key={r} className="px-3 py-2.5 text-center font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-dim" title={ROLES[r].label}>
                      {ROLES[r].short}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g}>
                  <tr>
                    <td colSpan={ROLE_IDS.length + 1} className="border-t border-line px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand sm:px-5">
                      {g}
                    </td>
                  </tr>
                  {ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].group === g).map((p: Permission) => (
                    <tr key={p} className="hover:bg-surface-2/40">
                      <td className="px-4 py-1.5 sm:px-5">
                        <span className="text-ink">{PERMISSIONS[p].label}</span>
                        <span className="ml-2 hidden text-[11px] text-ink-dim md:inline">{PERMISSIONS[p].detail}</span>
                      </td>
                      {ROLE_IDS.map((r) => (
                        <td key={r} className="px-3 py-1.5 text-center">
                          {ROLES[r].permissions.includes(p) ? (
                            <AdminIcon name="check" className={`mx-auto size-4 ${r === "owner" ? "text-gold" : "text-brand"}`} />
                          ) : (
                            <span className="text-line-strong" aria-label="no">·</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
