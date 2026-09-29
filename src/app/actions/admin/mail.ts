"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import {
  deleteConnection,
  getConnection,
  isMailAdmin,
  sendMailAs,
  supportFromAddress,
  type SendMailResult,
} from "@/lib/admin-mail";

export type MailActionState = { error: string | null; message: string | null };

/** Second, independent gate beyond checkAdmin() — see admin-mail.ts's own doc comment on why this feature holds every admin to a different standard than the rest of /admin. */
async function requireMailAdmin() {
  const gate = await checkAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  if (!isMailAdmin(gate.identity.email)) {
    return { ok: false as const, error: "This feature isn't available on your account." };
  }
  return { ok: true as const, identity: gate.identity };
}

export async function sendMail(_prev: MailActionState, formData: FormData): Promise<MailActionState> {
  const gate = await requireMailAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const fromChoice = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!to || !subject || !body) return { error: "Fill in the recipient, subject and message.", message: null };

  // The connected Gmail address, not gate.identity.email — that's the admin's
  // login on THIS site, which has no reason to match the Google account they
  // connected here, and "self" has to mean the account actually sending.
  const connection = await getConnection(gate.identity.id);
  if (!connection) return { error: "No Gmail account connected yet.", message: null };

  const from = fromChoice === "support" ? supportFromAddress() : connection.email;

  const result: SendMailResult = await sendMailAs(connection.refreshToken, { from, to, subject, body });
  if (!result.ok) return { error: result.error, message: null };

  await logAdminAction(gate.identity, "mail.sent", to, { from, subject });
  return { error: null, message: `Sent to ${to}.` };
}

export async function disconnectMail(_prev: MailActionState, _formData: FormData): Promise<MailActionState> {
  const gate = await requireMailAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  await deleteConnection(gate.identity.id);
  await logAdminAction(gate.identity, "mail.disconnected");
  revalidatePath("/admin/mail");
  return { error: null, message: "Disconnected." };
}
