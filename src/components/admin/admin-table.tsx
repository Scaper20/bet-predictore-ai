import type { ReactNode } from "react";

/** The admin's data table: mono column heads, hairline rows, a quiet hover. Used by every list page. */
export function AdminTable({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-[13px]">{children}</table>
    </div>
  );
}

export function AdminTableHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-line bg-surface-2/40 text-left">
        {columns.map((c, i) => (
          <th key={`${c}-${i}`} className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-dim">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function AdminTableRow({ children }: { children: ReactNode }) {
  return <tr className="border-t border-line transition-colors first:border-t-0 hover:bg-surface-2/40">{children}</tr>;
}

export function AdminTableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}
