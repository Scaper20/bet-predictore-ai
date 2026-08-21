import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";
import { naira } from "@/lib/format";

export interface PaymentRow {
  id: string;
  created_at: string;
  plan: string;
  amount_kobo: number;
  status: string;
}

const STATUS_TONE: Record<string, Tone> = { success: "brand", pending: "amber", failed: "rose" };

export function BillingHistory({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon="🧾"
        title="No payments yet"
        description="Your billing history will show up here after your first payment."
      />
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t border-line">
              <td className="px-4 py-3 text-ink-muted">
                {new Date(p.created_at).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3">{p.plan}</td>
              <td className="tnum px-4 py-3">{naira(p.amount_kobo / 100)}</td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
