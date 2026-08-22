"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TeamActionState = { error: string | null; message: string | null };

export async function addAdmin(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email.", message: null };

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!profile) {
    return {
      error: "No account found with that email — they need to sign up on the site first.",
      message: null,
    };
  }

  const { error } = await admin.from("admin_users").upsert(
    { id: profile.id as string, created_by: gate.identity.id },
    { onConflict: "id" },
  );
  if (error) return { error: "Couldn't grant access. Try again.", message: null };

  await logAdminAction(gate.identity, "admin.added", email);
  revalidatePath("/admin/team");
  return { error: null, message: `${email} now has admin dashboard access.` };
}

export async function removeAdmin(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const targetId = String(formData.get("targetId") ?? "");
  const targetEmail = String(formData.get("targetEmail") ?? "");
  if (!targetId) return { error: "Missing account.", message: null };

  const admin = supabaseAdmin();

  // Self-lockout guard — refuse if this is the last remaining admin.
  const { count } = await admin.from("admin_users").select("*", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return { error: "You can't remove the last remaining admin account.", message: null };
  }

  const { error } = await admin.from("admin_users").delete().eq("id", targetId);
  if (error) return { error: "Couldn't remove access. Try again.", message: null };

  await logAdminAction(gate.identity, "admin.removed", targetEmail || targetId);
  revalidatePath("/admin/team");
  return { error: null, message: "Access removed." };
}
