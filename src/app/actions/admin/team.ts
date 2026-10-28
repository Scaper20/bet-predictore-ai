"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, logAdminAction } from "@/lib/admin";
import { cleanRoles, leavesNoOwner, rolesLabel, type Role } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TeamActionState = { error: string | null; message: string | null };

/** The team as it stands, for the last-owner rule. */
async function currentStaff(): Promise<{ id: string; roles: Role[] }[]> {
  const { data } = await supabaseAdmin().from("admin_users").select("id, roles");
  return (data ?? []).map((r) => ({ id: r.id as string, roles: cleanRoles(r.roles as unknown[]) }));
}

function rolesFrom(formData: FormData): Role[] {
  return cleanRoles(formData.getAll("roles"));
}

export async function addAdmin(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await checkPermission("team.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email.", message: null };
  const roles = rolesFrom(formData);
  if (roles.length === 0) return { error: "Pick at least one role.", message: null };

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!profile) {
    return {
      error: "No account found with that email — they need to sign up on the site first.",
      message: null,
    };
  }

  const { data: existing } = await admin.from("admin_users").select("id").eq("id", profile.id).maybeSingle();
  if (existing) return { error: `${email} is already on the team. Change their roles below.`, message: null };

  const { error } = await admin.from("admin_users").insert({
    id: profile.id as string,
    roles,
    created_by: gate.identity.id,
    updated_by: gate.identity.id,
  });
  if (error) return { error: "Couldn't grant access. Try again.", message: null };

  await logAdminAction(gate.identity, "admin.added", email, { roles });
  revalidatePath("/admin/team");
  return { error: null, message: `${email} joined as ${rolesLabel(roles)}.` };
}

export async function setAdminRoles(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await checkPermission("team.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const targetId = String(formData.get("targetId") ?? "");
  const targetEmail = String(formData.get("targetEmail") ?? "");
  if (!targetId) return { error: "Missing account.", message: null };
  const roles = rolesFrom(formData);
  if (roles.length === 0) return { error: "Keep at least one role, or remove their access instead.", message: null };

  const staff = await currentStaff();
  const before = staff.find((s) => s.id === targetId);
  if (!before) return { error: "They're no longer on the team.", message: null };
  if (leavesNoOwner(staff, targetId, roles)) {
    return { error: "Someone has to stay owner. Make another teammate owner first.", message: null };
  }

  const { error } = await supabaseAdmin()
    .from("admin_users")
    .update({ roles, updated_at: new Date().toISOString(), updated_by: gate.identity.id })
    .eq("id", targetId);
  if (error) return { error: "Couldn't change their roles. Try again.", message: null };

  await logAdminAction(gate.identity, "admin.roles_changed", targetEmail || targetId, { from: before.roles, to: roles });
  revalidatePath("/admin/team");
  return { error: null, message: `Now ${rolesLabel(roles)}.` };
}

export async function removeAdmin(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await checkPermission("team.manage");
  if (!gate.ok) return { error: gate.error, message: null };

  const targetId = String(formData.get("targetId") ?? "");
  const targetEmail = String(formData.get("targetEmail") ?? "");
  if (!targetId) return { error: "Missing account.", message: null };

  const staff = await currentStaff();
  if (leavesNoOwner(staff, targetId, null)) {
    return { error: "You can't remove the last owner.", message: null };
  }

  const { error } = await supabaseAdmin().from("admin_users").delete().eq("id", targetId);
  if (error) return { error: "Couldn't remove access. Try again.", message: null };

  await logAdminAction(gate.identity, "admin.removed", targetEmail || targetId, {
    roles: staff.find((s) => s.id === targetId)?.roles ?? [],
  });
  revalidatePath("/admin/team");
  return { error: null, message: "Access removed." };
}
