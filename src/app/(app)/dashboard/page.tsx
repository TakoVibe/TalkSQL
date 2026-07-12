import Link from "next/link";

import { DashboardGrid } from "../../components/dashboard-grid";

export default function DashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Saved analyses refresh from your connected data. Each widget shows its latest snapshot and update status.</p>
        <Link href="/ask" className="shrink-0 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--brand-strong)]">+ Ask data</Link>
      </div>
      <DashboardGrid />
    </>
  );
}
