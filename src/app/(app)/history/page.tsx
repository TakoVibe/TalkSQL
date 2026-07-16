import type { Metadata } from "next";

import { HistoryList } from "../../components/history-list";

export const metadata: Metadata = {
  title: "History — TalkSQL",
  description: "Search, inspect, rerun, and reuse your workspace's data questions.",
};

export default function HistoryPage() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">Workspace memory</p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">Question history</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Review generated SQL and errors, rerun trusted questions, or turn a useful result into a dashboard widget.</p>
        </div>
      </div>
      <HistoryList />
    </div>
  );
}
