import type { ReactNode } from "react";

/** Thin styled wrapper reused across Users/Tickets/Team — same exact
 * markup as billing-history.tsx's table, generalized to any columns. */
export function AdminTable({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function AdminTableHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
        {columns.map((c) => (
          <th key={c} className="px-4 py-3 font-medium">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function AdminTableRow({ children }: { children: ReactNode }) {
  return <tr className="border-t border-line">{children}</tr>;
}

export function AdminTableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
