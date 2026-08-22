import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminTable, AdminTableHead, AdminTableRow, AdminTableCell } from "@/components/admin/admin-table";
import { AddAdminForm } from "@/components/admin/add-admin-form";
import { RemoveAdminButton } from "@/components/admin/remove-admin-button";
import { SectionHeading } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Team" };

interface AdminRow {
  id: string;
  created_at: string;
  profiles: { email: string | null } | { email: string | null }[] | null;
}

export default async function AdminTeamPage() {
  const { data } = await supabaseAdmin()
    .from("admin_users")
    .select("id, created_at, profiles(email)")
    .order("created_at", { ascending: true });

  const admins = (data ?? []) as unknown as AdminRow[];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Team</h1>

      <section>
        <SectionHeading eyebrow="Access" title="Admin accounts" />
        <div className="mt-4">
          <AdminTable>
            <AdminTableHead columns={["Email", "Added", ""]} />
            <tbody>
              {admins.map((a) => {
                const profile = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
                return (
                  <AdminTableRow key={a.id}>
                    <AdminTableCell>{profile?.email ?? "—"}</AdminTableCell>
                    <AdminTableCell className="text-ink-muted">
                      {new Date(a.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </AdminTableCell>
                    <AdminTableCell>
                      <RemoveAdminButton targetId={a.id} targetEmail={profile?.email ?? ""} />
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </tbody>
          </AdminTable>
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Grant access"
          title="Add a teammate"
          description="Promotes an existing site account to admin — every admin has the same full access today. For a brand-new, admin-only login, use the create-admin script instead."
        />
        <div className="card mt-4 p-6">
          <AddAdminForm />
        </div>
      </section>
    </div>
  );
}
