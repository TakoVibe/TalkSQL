import Link from "next/link";

import { DashboardGrid } from "../../components/dashboard-grid";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ connection?: string; scope?: string }> }) {
  const { connection, scope } = await searchParams;
  const askHref = connection ? `/ask?connection=${encodeURIComponent(connection)}` : "/ask";
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Saved analyses refresh from your connected data. Each widget shows its latest snapshot and update status.</p>
        <Link href={askHref} className="shrink-0 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--brand-strong)]">+ Ask data</Link>
      </div>
      <DashboardGrid key={`${connection ?? "none"}:${scope ?? "connection"}`} connectionId={connection} initialScope={scope === "all" ? "all" : "connection"} />
    </>
  );
}
