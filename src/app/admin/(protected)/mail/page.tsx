import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { adminMailAllowedEmail, getConnection, isMailAdmin, mailOAuthConfigured, supportFromAddress } from "@/lib/admin-mail";
import { MailComposeForm } from "@/components/admin/mail-compose-form";
import { MailConnectCard, MailConnectPrompt } from "@/components/admin/mail-connect-card";
import { SectionHeading } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Mail" };

const ERROR_COPY: Record<string, string> = {
  forbidden: "This feature isn't available on your account.",
  invalid_state: "That connection attempt looked tampered with — try connecting again.",
  exchange_failed: "Google didn't confirm the connection. Try again.",
};

export default async function AdminMailPage({ searchParams }: PageProps<"/admin/mail">) {
  const identity = await requireAdmin();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const justConnected = params.connected === "1";

  if (!mailOAuthConfigured() || !adminMailAllowedEmail()) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-2xl font-bold">Mail</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Not set up yet. This needs a Google OAuth client (
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">GOOGLE_MAIL_CLIENT_ID</code> /{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">GOOGLE_MAIL_CLIENT_SECRET</code>) and{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">ADMIN_MAIL_ALLOWED_EMAIL</code> configured —
          see <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">.env.example</code>.
        </p>
      </div>
    );
  }

  if (!isMailAdmin(identity.email)) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-2xl font-bold">Mail</h1>
        <p className="max-w-2xl text-sm text-ink-muted">This feature isn&apos;t available on your account.</p>
      </div>
    );
  }

  const connection = await getConnection(identity.id);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Mail</h1>

      {justConnected && (
        <p className="rounded-lg border border-brand/25 bg-brand/5 px-4 py-3 text-sm text-brand">
          Google account connected.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-rose/25 bg-rose/5 px-4 py-3 text-sm text-rose">
          {ERROR_COPY[error] ?? "Something went wrong connecting your account."}
        </p>
      )}

      <section>
        <SectionHeading
          eyebrow="Connection"
          title="Google account"
          description="Send-only — this can never read anything already in that inbox, only send as it."
        />
        <div className="mt-4">
          {connection ? <MailConnectCard email={connection.email} /> : <MailConnectPrompt />}
        </div>
      </section>

      {connection && (
        <section>
          <SectionHeading eyebrow="Compose" title="Send an email" />
          <div className="card mt-4 max-w-2xl p-6">
            <MailComposeForm selfEmail={connection.email} supportEmail={supportFromAddress()} />
          </div>
        </section>
      )}
    </div>
  );
}
