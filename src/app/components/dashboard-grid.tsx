"use client";
import { useEffect, useState } from "react";

import { ConfirmDialog, PromptDialog } from "./dialogs";
import { SchemaDiagram, type Snapshot } from "./schema-explorer";
import { MetricTile, ResultChart, ResultTable, type ChartType, type ResultRows } from "./result-views";

type Widget = {
  id: string; title: string; question: string; kind: "metric" | "table" | "chart" | "schema_diagram";
  chartType: ChartType | null; xColumn: string | null; yColumn: string | null;
  lastResult: (Partial<ResultRows> & { schema?: Snapshot }) | null; lastRefreshedAt: string | null;
};

const KIND_LABEL: Record<Widget["kind"], string> = { metric: "Metric", table: "Table", chart: "Chart", schema_diagram: "Diagram" };

const PAGE_SIZES = [5, 10, 20];

function age(iso: string | null) {
  if (!iso) return "never refreshed";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function DashboardGrid() {
  const [widgets, setWidgets] = useState<Widget[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  async function refresh(widget: Widget) {
    setRefreshing((r) => ({ ...r, [widget.id]: true }));
    try {
      const response = await fetch(`/api/widgets/${widget.id}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Refresh failed.");
      setWidgets((current) => current?.map((w) => w.id === widget.id ? { ...w, lastResult: data.lastResult, lastRefreshedAt: data.lastRefreshedAt } : w));
      setErrors((errors) => { const rest = { ...errors }; delete rest[widget.id]; return rest; });
    } catch (error) {
      setErrors((e) => ({ ...e, [widget.id]: error instanceof Error ? error.message : "Refresh failed." }));
    } finally { setRefreshing((r) => ({ ...r, [widget.id]: false })); }
  }

  const [deleting, setDeleting] = useState<Widget | null>(null);
  const [renaming, setRenaming] = useState<Widget | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const [refreshingPage, setRefreshingPage] = useState(false);

  async function remove(id: string) {
    await fetch(`/api/widgets/${id}`, { method: "DELETE" }).catch(() => undefined);
    setWidgets((current) => current?.filter((w) => w.id !== id));
  }

  async function rename(widget: Widget, title: string) {
    if (title === widget.title) return;
    const response = await fetch(`/api/widgets/${widget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => undefined);
    if (response?.ok) setWidgets((current) => current?.map((w) => w.id === widget.id ? { ...w, title } : w));
  }

  // Page load renders stored snapshots only — zero queries against the customer's database.
  useEffect(() => {
    fetch("/api/widgets").then((r) => r.json()).then((d) => setWidgets(d.widgets ?? [])).catch(() => setWidgets([]));
  }, []);

  if (!widgets) return (
    <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading dashboard">
      {[56, 40, 48, 36].map((height, i) => <div key={i} className="rounded-2xl border border-[#dfe4df] bg-white p-5">
        <div className="flex items-center justify-between"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-7 w-16 rounded-full" /></div>
        <div className="skeleton mt-2 h-3 w-2/3" />
        <div className="skeleton mt-4" style={{ height: height * 4 }} />
      </div>)}
    </div>
  );
  if (!widgets.length) return <p className="mt-8 rounded-xl border border-dashed border-[#cfd7d1] bg-white p-8 text-center text-sm text-[#66716b]">No widgets yet. Ask a question on the home page and choose “Save to dashboard”.</p>;

  const q = query.trim().toLowerCase();
  const filtered = q ? widgets.filter((w) => w.title.toLowerCase().includes(q) || w.question.toLowerCase().includes(q) || w.kind.includes(q)) : widgets;
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const pageWidgets = filtered.slice(safePage * perPage, (safePage + 1) * perPage);

  async function refreshVisible() {
    setRefreshingPage(true);
    // Parallel is safe: the server caps concurrent queries per target database.
    await Promise.all(pageWidgets.map((widget) => refresh(widget)));
    setRefreshingPage(false);
  }

  return <>
  <div className="mt-6 flex flex-wrap items-center gap-3">
    <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search widgets by title, question, or type…" className="w-full max-w-sm rounded-lg border border-[#cfd7d1] bg-white px-3 py-2 text-sm outline-none focus:border-[#205b43]" aria-label="Search widgets" />
    <button onClick={refreshVisible} disabled={refreshingPage || !pageWidgets.length} className="rounded-lg border border-[#cfd7d1] bg-white px-3 py-2 text-sm font-medium text-[#205b43] hover:bg-[#f0f4f1] disabled:opacity-50">{refreshingPage ? "Refreshing…" : `↻ Refresh ${pageWidgets.length} visible`}</button>
    <span className="ml-auto shrink-0 text-xs text-[#8b948e]">{filtered.length} of {widgets.length} widgets</span>
  </div>
  {!filtered.length && <p className="mt-6 rounded-xl border border-dashed border-[#cfd7d1] bg-white p-8 text-center text-sm text-[#66716b]">No widgets match “{query}”.</p>}
  <div className="mt-4 grid gap-4 md:grid-cols-2">
    {deleting && <ConfirmDialog title="Delete this widget?" body={`“${deleting.title}” will be removed from the dashboard. The underlying data is not affected.`} onConfirm={() => remove(deleting.id)} onClose={() => setDeleting(null)} />}
    {renaming && <PromptDialog title="Rename widget" defaultValue={renaming.title} submitLabel="Rename" onSubmit={(title) => rename(renaming, title)} onClose={() => setRenaming(null)} />}
    {pageWidgets.map((widget) => {
      const tabular = widget.lastResult?.columns && widget.lastResult?.rows ? widget.lastResult as ResultRows : undefined;
      const stale = errors[widget.id];
      return <section key={widget.id} className={`rounded-2xl border border-[#dfe4df] bg-white p-5 shadow-[0_8px_28px_rgba(28,49,37,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(28,49,37,0.12)] ${widget.kind === "schema_diagram" ? "md:col-span-2" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h2 className="cursor-pointer truncate font-semibold hover:text-[#205b43]" title="Click to rename" onClick={() => setRenaming(widget)}>{widget.title}</h2><span className="shrink-0 rounded-full bg-[#f0f4f1] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#526059]">{KIND_LABEL[widget.kind]}{widget.kind === "chart" && widget.chartType ? ` · ${widget.chartType}` : ""}</span></div>
            <p className="truncate text-xs text-[#8b948e]" title={widget.question}>{widget.question}</p>
          </div>
          <div className="flex shrink-0 gap-1 text-xs">
            <button onClick={() => refresh(widget)} disabled={refreshing[widget.id]} aria-label="Refresh widget" className="grid h-8 w-8 place-items-center rounded-full border border-[#dfe4df] text-[#205b43] transition hover:border-[#9bc4aa] hover:bg-[#edf7f0] disabled:opacity-60">{refreshing[widget.id] ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#205b43]/25 border-t-[#205b43]" /> : <span className="text-base leading-none">↻</span>}</button>
            <button onClick={() => setDeleting(widget)} className="rounded border border-[#dfe4df] px-2 py-1 text-[#a63d2f] hover:bg-[#fff0ee]">✕</button>
          </div>
        </div>
        <div className="mt-3">
          {widget.kind === "metric" && tabular && <MetricTile title={widget.title} result={tabular} />}
          {widget.kind === "chart" && tabular && widget.xColumn && widget.yColumn && <ResultChart result={tabular} x={widget.xColumn} y={widget.yColumn} type={widget.chartType ?? "bar"} />}
          {widget.kind === "table" && tabular && <ResultTable result={tabular} maxRows={8} />}
          {widget.kind === "schema_diagram" && widget.lastResult?.schema && <div className="max-h-96 overflow-auto rounded-lg border border-[#edf0ed] bg-[#fbfcfa] p-4"><SchemaDiagram schema={widget.lastResult.schema} /></div>}
          {!widget.lastResult && <p className="rounded-lg bg-[#f0f4f1] p-3 text-sm text-[#66716b]">No data yet — refresh to run.</p>}
        </div>
        <p className="mt-3 text-xs text-[#8b948e]">Updated {age(widget.lastRefreshedAt)}{stale && <span className="ml-2 rounded bg-[#fff3e8] px-1.5 py-0.5 text-[#9a5b1f]" title={stale}>stale — showing last good data</span>}</p>
      </section>;
    })}
  </div>
  {filtered.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
    <label className="flex items-center gap-2 text-xs text-[#8b948e]">Per page
      <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }} className="rounded-lg border border-[#cfd7d1] bg-white px-2 py-1.5 text-sm text-[#526059]">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select>
    </label>
    <div className="flex items-center gap-2">
      <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className="rounded-lg border border-[#cfd7d1] bg-white px-3 py-1.5 text-sm text-[#526059] hover:bg-[#f0f4f1] disabled:opacity-40">← Prev</button>
      <span className="text-xs text-[#8b948e]">Page {safePage + 1} of {pageCount}</span>
      <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1} className="rounded-lg border border-[#cfd7d1] bg-white px-3 py-1.5 text-sm text-[#526059] hover:bg-[#f0f4f1] disabled:opacity-40">Next →</button>
    </div>
  </div>}
  </>;
}
