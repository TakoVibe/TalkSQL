"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog, PromptDialog } from "./dialogs";
import { Icon } from "./icons";
import { SchemaDiagram, type Snapshot } from "./schema-explorer";
import { MetricTile, ResultChart, ResultTable, type ChartPointSelection, type ChartType, type ResultRows } from "./result-views";

type Widget = {
  id: string;
  connectionId: string;
  connectionName: string | null;
  connectionEngine: string | null;
  title: string;
  question: string;
  kind: "metric" | "table" | "chart" | "schema_diagram";
  chartType: ChartType | null;
  xColumn: string | null;
  yColumn: string | null;
  lastResult: (Partial<ResultRows> & { schema?: Snapshot }) | null;
  lastRefreshedAt: string | null;
};

type Connection = { id: string; name: string; engine: string; database: string };
type DashboardTab = "all" | Widget["kind"];
type DashboardScope = "connection" | "all";
type WidgetSize = "half" | "wide";
type CrossFilter = { column: string; value: string };
type DrillDown = { widgetId: string; column?: string; value?: string; row: Record<string, unknown> };

const KIND_LABEL: Record<Widget["kind"], string> = { metric: "Metric", table: "Table", chart: "Chart", schema_diagram: "Diagram" };
const PAGE_SIZES = [5, 10, 20];
const TABS: { value: DashboardTab; label: string }[] = [
  { value: "all", label: "Overview" },
  { value: "metric", label: "Metrics" },
  { value: "chart", label: "Charts" },
  { value: "table", label: "Tables" },
  { value: "schema_diagram", label: "Schemas" },
];
const LAYOUT_STORAGE_KEY = "talksql.dashboard.widget-sizes";

function age(iso: string | null) {
  if (!iso) return "never refreshed";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function tabularResult(widget: Widget): ResultRows | undefined {
  return widget.lastResult?.columns && widget.lastResult?.rows ? widget.lastResult as ResultRows : undefined;
}

function dateValue(value: unknown): number | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const text = String(value);
  if (!/^\d{4}-\d{2}/.test(text)) return undefined;
  const timestamp = new Date(text).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function filterResult(result: ResultRows, filters: { dateColumn: string; dateFrom: string; dateTo: string; categoryColumn: string; categoryValue: string; crossFilter?: CrossFilter }): ResultRows {
  const start = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : undefined;
  const end = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : undefined;
  const rows = result.rows.filter((row) => {
    if (filters.dateColumn && Object.hasOwn(row, filters.dateColumn)) {
      const timestamp = dateValue(row[filters.dateColumn]);
      if (timestamp != null && ((start != null && timestamp < start) || (end != null && timestamp > end))) return false;
    }
    if (filters.categoryColumn && filters.categoryValue && Object.hasOwn(row, filters.categoryColumn) && String(row[filters.categoryColumn] ?? "") !== filters.categoryValue) return false;
    if (filters.crossFilter && Object.hasOwn(row, filters.crossFilter.column) && String(row[filters.crossFilter.column] ?? "") !== filters.crossFilter.value) return false;
    return true;
  });
  return { ...result, rows };
}

function askDrillDownHref(widget: Widget, drillDown: DrillDown) {
  const detail = drillDown.column
    ? `Show the source records behind ${drillDown.column} = ${drillDown.value} for this question: ${widget.question}`
    : `Investigate the source records represented by this result row for: ${widget.question}. Row: ${JSON.stringify(drillDown.row)}`;
  return `/ask?${new URLSearchParams({ connection: widget.connectionId, q: detail, run: "1" }).toString()}`;
}

function engineLabel(engine: string | null) {
  if (engine === "postgresql") return "PostgreSQL";
  if (engine === "mysql") return "MySQL";
  return "Database";
}

export function DashboardGrid({ connectionId, initialScope }: { connectionId?: string; initialScope: DashboardScope }) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>();
  const [connections, setConnections] = useState<Connection[]>();
  const [scope, setScope] = useState<DashboardScope>(initialScope);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Widget | null>(null);
  const [renaming, setRenaming] = useState<Widget | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const [refreshingPage, setRefreshingPage] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [dateColumn, setDateColumn] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryColumn, setCategoryColumn] = useState("");
  const [categoryValue, setCategoryValue] = useState("");
  const [crossFilter, setCrossFilter] = useState<CrossFilter>();
  const [sizes, setSizes] = useState<Record<string, WidgetSize>>({});
  const [drillDown, setDrillDown] = useState<DrillDown>();
  const refreshControllers = useRef<Record<string, AbortController>>({});

  function changeScope(nextScope: DashboardScope) {
    setScope(nextScope);
    setPage(0);
    setActiveTab("all");
    clearFilters();
    const params = new URLSearchParams();
    if (connectionId) params.set("connection", connectionId);
    if (nextScope === "all") params.set("scope", "all");
    const queryString = params.toString();
    router.replace(queryString ? `/dashboard?${queryString}` : "/dashboard", { scroll: false });
  }

  async function refresh(widget: Widget) {
    const controller = new AbortController();
    refreshControllers.current[widget.id]?.abort();
    refreshControllers.current[widget.id] = controller;
    setRefreshing((current) => ({ ...current, [widget.id]: true }));
    try {
      const response = await fetch(`/api/widgets/${widget.id}`, { method: "POST", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Refresh failed.");
      setWidgets((current) => current?.map((item) => item.id === widget.id ? { ...item, lastResult: data.lastResult, lastRefreshedAt: data.lastRefreshedAt } : item));
      setErrors((current) => { const next = { ...current }; delete next[widget.id]; return next; });
    } catch (error) {
      setErrors((current) => ({ ...current, [widget.id]: error instanceof DOMException && error.name === "AbortError" ? "Refresh cancelled." : error instanceof Error ? error.message : "Refresh failed." }));
    } finally {
      if (refreshControllers.current[widget.id] === controller) {
        delete refreshControllers.current[widget.id];
        setRefreshing((current) => ({ ...current, [widget.id]: false }));
      }
    }
  }

  async function remove(id: string) {
    await fetch(`/api/widgets/${id}`, { method: "DELETE" }).catch(() => undefined);
    setWidgets((current) => current?.filter((widget) => widget.id !== id));
  }

  async function rename(widget: Widget, title: string) {
    if (title === widget.title) return;
    const response = await fetch(`/api/widgets/${widget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => undefined);
    if (response?.ok) setWidgets((current) => current?.map((item) => item.id === widget.id ? { ...item, title } : item));
  }

  function resize(widget: Widget) {
    const nextSize: WidgetSize = sizes[widget.id] === "wide" ? "half" : "wide";
    const next = { ...sizes, [widget.id]: nextSize };
    setSizes(next);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
  }

  function clearFilters() {
    setDateColumn("");
    setDateFrom("");
    setDateTo("");
    setCategoryColumn("");
    setCategoryValue("");
    setCrossFilter(undefined);
    setPage(0);
  }

  // Page load renders stored snapshots only — zero queries against the customer's database.
  useEffect(() => {
    Promise.all([
      fetch("/api/widgets", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/connections", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([widgetData, connectionData]) => {
      setWidgets(widgetData.widgets ?? []);
      setConnections(connectionData.connections ?? []);
    }).catch(() => {
      setWidgets([]);
      setConnections([]);
    });
    try {
      const stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}") as Record<string, WidgetSize>;
      setSizes(stored);
    } catch { /* Ignore malformed local layout state. */ }
  }, []);

  const activeConnection = connections?.find((connection) => connection.id === connectionId);
  const scopedWidgets = useMemo(
    () => scope === "all" ? widgets ?? [] : (widgets ?? []).filter((widget) => widget.connectionId === connectionId),
    [connectionId, scope, widgets],
  );

  const filterOptions = useMemo(() => {
    const dates = new Set<string>();
    const categories = new Set<string>();
    for (const widget of scopedWidgets) {
      const result = tabularResult(widget);
      if (!result) continue;
      for (const column of result.columns) {
        const values = result.rows.map((row) => row[column]).filter((value) => value != null);
        if (values.some((value) => dateValue(value) != null)) dates.add(column);
        const unique = new Set(values.map(String));
        if (values.some((value) => typeof value === "string" && dateValue(value) == null) && unique.size > 1 && unique.size <= 50) categories.add(column);
      }
    }
    return { dates: [...dates].sort(), categories: [...categories].sort() };
  }, [scopedWidgets]);

  const categoryValues = useMemo(() => {
    if (!categoryColumn) return [];
    const values = new Set<string>();
    for (const widget of scopedWidgets) {
      const result = tabularResult(widget);
      if (!result?.columns.includes(categoryColumn)) continue;
      result.rows.forEach((row) => { if (row[categoryColumn] != null) values.add(String(row[categoryColumn])); });
    }
    return [...values].sort((a, b) => a.localeCompare(b)).slice(0, 100);
  }, [categoryColumn, scopedWidgets]);

  if (!widgets || !connections) return (
    <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading dashboard">
      {[56, 40, 48, 36].map((height, index) => <div key={index} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-7 w-16 rounded-full" /></div><div className="skeleton mt-2 h-3 w-2/3" /><div className="skeleton mt-4" style={{ height: height * 4 }} /></div>)}
    </div>
  );

  const sourceCount = new Set(scopedWidgets.map((widget) => widget.connectionId)).size;
  const scopeTitle = scope === "all" ? "All databases" : activeConnection?.name ?? "Selected database";
  const scopeDescription = scope === "all"
    ? `${scopedWidgets.length} ${scopedWidgets.length === 1 ? "widget" : "widgets"} across ${sourceCount} ${sourceCount === 1 ? "database" : "databases"}`
    : activeConnection
      ? `${engineLabel(activeConnection.engine)} · ${activeConnection.database}`
      : "Choose a database from the workspace selector";

  const scopeSwitcher = <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between" aria-labelledby="dashboard-scope-title">
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name="database" size={20} /></span>
      <div className="min-w-0"><p id="dashboard-scope-title" className="truncate text-sm font-semibold">{scopeTitle}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-subtle)]">{scopeDescription}</p></div>
    </div>
    <div className="grid grid-cols-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-1" role="group" aria-label="Dashboard database scope">
      <button type="button" onClick={() => changeScope("connection")} disabled={!connectionId} aria-pressed={scope === "connection"} className={`min-h-10 rounded-lg px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 ${scope === "connection" ? "bg-[var(--surface)] text-[var(--brand)] shadow-[var(--shadow-xs)]" : "text-[var(--ink-muted)] hover:text-[var(--foreground)]"}`}>This database</button>
      <button type="button" onClick={() => changeScope("all")} aria-pressed={scope === "all"} className={`min-h-10 rounded-lg px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${scope === "all" ? "bg-[var(--surface)] text-[var(--brand)] shadow-[var(--shadow-xs)]" : "text-[var(--ink-muted)] hover:text-[var(--foreground)]"}`}>All databases</button>
    </div>
  </section>;

  if (!scopedWidgets.length) {
    const askHref = connectionId ? `/ask?connection=${encodeURIComponent(connectionId)}` : "/ask";
    return <>{scopeSwitcher}<section className="mt-5 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name="dashboard" size={25} /></span>
      <h2 className="mt-4 text-base font-semibold">{scope === "all" ? "No dashboard widgets yet" : `No widgets for ${activeConnection?.name ?? "this database"}`}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{scope === "all" ? "Ask a question against a connected database and save the useful result to start your workspace dashboard." : "This database has a clean dashboard. Ask a question, choose a visualization, and save it here."}</p>
      {connectionId && <Link href={askHref} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="sparkles" size={16} />Ask this database</Link>}
    </section></>;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = scopedWidgets.filter((widget) => {
    const matchesSearch = !normalizedQuery || widget.title.toLowerCase().includes(normalizedQuery) || widget.question.toLowerCase().includes(normalizedQuery) || widget.kind.includes(normalizedQuery) || widget.connectionName?.toLowerCase().includes(normalizedQuery);
    const matchesTab = activeTab === "all" || widget.kind === activeTab;
    return matchesSearch && matchesTab;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const pageWidgets = filtered.slice(safePage * perPage, (safePage + 1) * perPage);
  const hasFilters = Boolean(dateColumn || dateFrom || dateTo || categoryColumn || categoryValue || crossFilter);
  const filters = { dateColumn, dateFrom, dateTo, categoryColumn, categoryValue, crossFilter };

  async function refreshVisible() {
    setRefreshingPage(true);
    await Promise.all(pageWidgets.map((widget) => refresh(widget)));
    setRefreshingPage(false);
  }

  function selectChartPoint(widget: Widget, result: ResultRows, point: ChartPointSelection) {
    const column = widget.xColumn ?? result.columns[0];
    const row = result.rows.find((candidate) => String(candidate[column] ?? "") === point.label) ?? result.rows[point.index] ?? {};
    setDrillDown({ widgetId: widget.id, column, value: point.label, row });
    setCrossFilter({ column, value: point.label });
    setPage(0);
  }

  return <>
    {scopeSwitcher}
    <div className="mt-6 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="Dashboard views">
      <div className="flex min-w-max gap-1">{TABS.map((tab) => {
        const count = tab.value === "all" ? scopedWidgets.length : scopedWidgets.filter((widget) => widget.kind === tab.value).length;
        const active = activeTab === tab.value;
        return <button key={tab.value} type="button" role="tab" aria-selected={active} onClick={() => { setActiveTab(tab.value); setPage(0); }} className={`min-h-11 cursor-pointer border-b-2 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${active ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--ink-muted)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"}`}>{tab.label}<span className="ml-2 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] tabular-nums">{count}</span></button>;
      })}</div>
    </div>

    <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3" aria-label="Dashboard filters">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-64 flex-1"><span className="sr-only">Search widgets</span><Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search widgets…" className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] py-2 pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" /></label>
        <button onClick={refreshVisible} disabled={refreshingPage || !pageWidgets.length} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"><Icon name="refresh" size={16} className={refreshingPage ? "animate-spin" : ""} />{refreshingPage ? "Refreshing…" : `Refresh ${pageWidgets.length}`}</button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-medium text-[var(--ink-muted)]">Date field<select value={dateColumn} onChange={(event) => { setDateColumn(event.target.value); setPage(0); }} className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]"><option value="">Any date field</option>{filterOptions.dates.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
        <label className="text-xs font-medium text-[var(--ink-muted)]">From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(0); }} disabled={!dateColumn} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm disabled:opacity-45" /></label>
        <label className="text-xs font-medium text-[var(--ink-muted)]">To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(0); }} disabled={!dateColumn} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm disabled:opacity-45" /></label>
        <label className="text-xs font-medium text-[var(--ink-muted)]">Category field<select value={categoryColumn} onChange={(event) => { setCategoryColumn(event.target.value); setCategoryValue(""); setPage(0); }} className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]"><option value="">Any category field</option>{filterOptions.categories.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
        <label className="text-xs font-medium text-[var(--ink-muted)]">Category value<select value={categoryValue} onChange={(event) => { setCategoryValue(event.target.value); setPage(0); }} disabled={!categoryColumn} className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] disabled:opacity-45"><option value="">All values</option>{categoryValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <p className="mr-auto text-xs text-[var(--ink-subtle)]">Filters apply to the latest saved snapshots on cards with matching fields.</p>
        {crossFilter && <button type="button" onClick={() => setCrossFilter(undefined)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--brand-soft)] px-3 text-xs font-semibold text-[var(--brand)]"><span>{crossFilter.column}: {crossFilter.value}</span><Icon name="x" size={13} /></button>}
        {hasFilters && <button type="button" onClick={clearFilters} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]">Clear all filters</button>}
        <span className="shrink-0 text-xs text-[var(--ink-subtle)]">{filtered.length} of {scopedWidgets.length} widgets</span>
      </div>
    </section>

    {!filtered.length && <p className="mt-6 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink-muted)]">No widgets match this view. Try another tab or clear the search.</p>}

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {deleting && <ConfirmDialog title="Delete this widget?" body={`“${deleting.title}” will be removed from the dashboard. The underlying data is not affected.`} onConfirm={() => remove(deleting.id)} onClose={() => setDeleting(null)} />}
      {renaming && <PromptDialog title="Rename widget" defaultValue={renaming.title} submitLabel="Rename" onSubmit={(title) => rename(renaming, title)} onClose={() => setRenaming(null)} />}
      {pageWidgets.map((widget) => {
        const original = tabularResult(widget);
        const tabular = original ? filterResult(original, filters) : undefined;
        const stale = errors[widget.id];
        const wide = widget.kind === "schema_diagram" || sizes[widget.id] === "wide";
        const selected = drillDown?.widgetId === widget.id ? drillDown : undefined;
        return <section key={widget.id} className={`group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-border)] hover:shadow-[var(--shadow-md)] ${wide ? "md:col-span-2" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 truncate font-semibold"><button type="button" className="max-w-full cursor-pointer truncate rounded text-left hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" title="Rename widget" onClick={() => setRenaming(widget)}>{widget.title}</button></h2><span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--ink-muted)]">{KIND_LABEL[widget.kind]}{widget.kind === "chart" && widget.chartType ? ` · ${widget.chartType}` : ""}</span><span title={widget.connectionName ? `${widget.connectionName} · ${engineLabel(widget.connectionEngine)}` : "Disconnected database"} className={`inline-flex max-w-48 shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${widget.connectionName ? "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[#e5b8b1] bg-[#fff0ee] text-[#a63d2f]"}`}><Icon name="database" size={11} /><span className="truncate">{widget.connectionName ?? "Disconnected source"}</span></span></div>
              <p className="truncate text-xs text-[var(--ink-subtle)]" title={widget.question}>{widget.question}</p>
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              {widget.kind !== "schema_diagram" && <button onClick={() => resize(widget)} aria-label={wide ? "Make widget half width" : "Make widget full width"} title="Resize widget (saved on this device)" className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl border border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--brand-border)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="expand" size={17} className={wide ? "rotate-45" : ""} /></button>}
              <button onClick={() => refreshing[widget.id] ? refreshControllers.current[widget.id]?.abort() : refresh(widget)} aria-label={refreshing[widget.id] ? "Cancel widget refresh" : "Refresh widget"} title={refreshing[widget.id] ? "Cancel refresh" : "Refresh widget"} className={`grid h-11 w-11 cursor-pointer place-items-center rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${refreshing[widget.id] ? "border-[#d7a39b] text-[#a63d2f] hover:bg-[#fff0ee]" : "border-[var(--border)] text-[var(--brand)] hover:border-[var(--brand-border)] hover:bg-[var(--brand-soft)]"}`}><Icon name={refreshing[widget.id] ? "x" : "refresh"} size={17} /></button>
              <button onClick={() => setDeleting(widget)} aria-label="Delete widget" className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl border border-[var(--border)] text-[#a63d2f] hover:border-[#e5b8b1] hover:bg-[#fff0ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a63d2f]"><Icon name="trash" size={17} /></button>
            </div>
          </div>

          <div className="mt-3">
            {widget.kind === "metric" && tabular && <MetricTile title={widget.title} result={tabular} />}
            {widget.kind === "chart" && tabular && widget.xColumn && widget.yColumn && (tabular.rows.length ? <ResultChart result={tabular} x={widget.xColumn} y={widget.yColumn} type={widget.chartType ?? "bar"} onPointSelect={(point) => selectChartPoint(widget, tabular, point)} /> : <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--ink-muted)]">No chart data matches the active filters.</p>)}
            {widget.kind === "table" && tabular && <ResultTable result={tabular} maxRows={8} onRowSelect={(row) => setDrillDown({ widgetId: widget.id, row })} />}
            {widget.kind === "schema_diagram" && widget.lastResult?.schema && <SchemaDiagram schema={widget.lastResult.schema} />}
            {!widget.lastResult && <p className="rounded-lg bg-[var(--surface-2)] p-3 text-sm text-[var(--ink-muted)]">No data yet — refresh to run.</p>}
          </div>

          {selected && <div className="mt-4 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">Drill-down selection</p><p className="mt-1 text-sm font-semibold">{selected.column ? `${selected.column} = ${selected.value}` : "Selected result row"}</p></div><button type="button" onClick={() => setDrillDown(undefined)} aria-label="Close drill-down" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface)]"><Icon name="x" size={16} /></button></div>
            {Object.keys(selected.row).length > 0 && <div className="mt-3"><ResultTable result={{ columns: Object.keys(selected.row), rows: [selected.row] }} /></div>}
            <Link href={askDrillDownHref(widget, selected)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]"><Icon name="sparkles" size={16} />Explore source records</Link>
          </div>}

          <p className="mt-3 text-xs text-[var(--ink-subtle)]">Updated {age(widget.lastRefreshedAt)}{stale && <span className="ml-2 rounded bg-[#fff3e8] px-1.5 py-0.5 text-[#9a5b1f]" title={stale}>stale — showing last good data</span>}</p>
        </section>;
      })}
    </div>

    {filtered.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
      <label className="flex items-center gap-2 text-xs text-[var(--ink-subtle)]">Per page<select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(0); }} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm text-[var(--ink-muted)]">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      <div className="flex items-center gap-2"><button onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40">Previous</button><span className="text-xs text-[var(--ink-subtle)]">Page {safePage + 1} of {pageCount}</span><button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40">Next</button></div>
    </div>}
  </>;
}
