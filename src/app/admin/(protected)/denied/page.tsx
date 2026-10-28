import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { ALL_PERMISSIONS, PERMISSIONS, ROLES, ROLE_IDS, rolesLabel, type Permission } from "@/lib/admin-access";
import { AdminIcon } from "@/components/admin/admin-icons";

export const metadata: Metadata = { title: "No access" };

/**
 * Where requirePermission sends staff who open a page their roles don't
 * cover: says what was missing, which roles carry it, and who can grant it,
 * instead of a bare 403.
 */
export default async function DeniedPage({ searchParams }: PageProps<"/admin/denied">) {
  const me = await requireAdmin();
  const need = (await searchParams).need;
  const permission = typeof need === "string" && (ALL_PERMISSIONS as string[]).includes(need) ? (need as Permission) : null;
  const holders = permission ? ROLE_IDS.filter((r) => ROLES[r].permissions.includes(permission)) : [];

  return (
    <div className="mx-auto max-w-lg py-10 sm:py-16">
      <div className="card p-6 sm:p-8">
        <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface-2 text-amber">
          <AdminIcon name="lock" className="size-5" />
        </span>
        <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-amber">403 · Not in your role</p>
        <h1 className="mt-2 font-display text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          You&apos;re signed in as <span className="text-ink">{me.email}</span> ({rolesLabel(me.roles)}).
          {permission ? (
            <>
              {" "}This page needs <span className="text-ink">{PERMISSIONS[permission].label}</span>:{" "}
              {PERMISSIONS[permission].detail.toLowerCase()}.
            </>
          ) : null}
        </p>
        {permission && (
          <dl className="mt-5 space-y-2 rounded-md border border-line bg-surface-2/50 p-4 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-dim">Permission</dt>
              <dd className="font-mono text-ink">{permission}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-dim">Roles that have it</dt>
              <dd className="text-right text-ink">{holders.map((r) => ROLES[r].label).join(", ")}</dd>
            </div>
          </dl>
        )}
        <p className="mt-5 text-xs text-ink-dim">If your job needs it, ask the owner to add the role on the Team page.</p>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-strong"
        >
          Back to your dashboard <AdminIcon name="arrow" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
