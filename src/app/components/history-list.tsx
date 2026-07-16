"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "./icons";
import { MetricTile, ResultChart, ResultTable, type ChartType, type ResultRows } from "./result-views";

type HistoryEntry = {
  id: string;
  connectionId: string;
  connectionName: string | null;
  question: string;
  kind: string | null;
  sql: string | null;
  ok: boolean;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
};

type RunState = { busy?: boolean; result?: ResultRows; error?: string; costWarning?: boolean };
type SaveState = "idle" | "saving" | "saved" | "error";

const PAGE_SIZE = 30;
const KINDS = ["all", "metric", "chart", "table", "schema_diagram", "clarify"];

function kindLabel(kind: string | null) {
  if (!kind) return "Unknown";
  return kind.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function formatDuration(duration: number | null) {
  if (duration == null) return "—";
  if (duration < 1_000) return `${duration}ms`;
  return `${(duration / 1_000).toFixed(duration < 10_000 ? 1 : 0)}s`;
}

function askHref(entry: HistoryEntry, run = false) {
  const params = new URLSearchParams({ connection: entry.connectionId, q: entry.question });
  if (run) params.set("run", "1");
  return `/ask?${params.toString()}`;
}

function chartConfig(entry: HistoryEntry, result: ResultRows): { x: string; y: string; type: ChartType } | undefined {
  const y = result.columns.find((column) => result.rows.some((row) => typeof row[column] === "number"));
  const x = result.columns.find((column) => column !== y && result.rows.some((row) => typeof row[column] !== "number"))
    ?? result.columns.find((column) => column !== y);
  if (!x || !y) return undefined;
  const dateLike = result.rows.length > 1 && result.rows.every((row) => {
    const value = String(row[x] ?? "");
    return /^\d{4}-\d{2}(?:-\d{2})?/.test(value) || (!Number.isNaN(Date.parse(value)) && /[-/:]/.test(value));
  });
  const pieLike = result.rows.length <= 7
    && result.rows.every((row) => typeof row[y] === "number" && Number(row[y]) > 0)
    && /\b(share|percentage|percent|proportion|distribution|breakdown)\b/i.test(entry.question);
  return { x, y, type: pieLike ? "pie" : dateLike ? "line" : "bar" };
}

function resultPreview(entry: HistoryEntry, result: ResultRows) {
  if (entry.kind === "metric" && result.rows.length) return <MetricTile title={entry.question} result={result} />;
  if (entry.kind === "chart") {
    const chart = chartConfig(entry, result);
    if (chart) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><ResultChart result={result} x={chart.x} y={chart.y} type={chart.type} /></div>;
  }
  return <ResultTable result={result} maxRows={8} />;
}

function previewLabel(entry: HistoryEntry) {
  if (entry.kind === "chart") return "Preview chart";
  if (entry.kind === "metric") return "Preview metric";
  return "Run stored SQL";
}

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>();
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "success" | "error">("all");
  const [kind, setKind] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const runControllers = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/history", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "History could not be loaded.");
        if (active) setEntries(data.entries ?? []);
      })
      .catch((error: unknown) => {
        if (active) {
          setEntries([]);
          setLoadError(error instanceof Error ? error.message : "History could not be loaded.");
        }
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (entries ?? []).filter((entry) => {
      const matchesQuery = !normalized || [entry.question, entry.sql, entry.error, entry.connectionName, entry.kind].some((value) => value?.toLowerCase().includes(normalized));
      const matchesStatus = status === "all" || (status === "success" ? entry.ok : !entry.ok);
      const matchesKind = kind === "all" || entry.kind === kind;
      return matchesQuery && matchesStatus && matchesKind;
    });
  }, [entries, kind, query, status]);

  const summary = useMemo(() => {
    const all = entries ?? [];
    const durations = all.map((entry) => entry.durationMs).filter((duration): duration is number => duration != null);
    return {
      total: all.length,
      successful: all.filter((entry) => entry.ok).length,
      average: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null,
    };
  }, [entries]);

  async function execute(entry: HistoryEntry, signal?: AbortSignal, allowExpensive = false): Promise<ResultRows> {
    if (!entry.sql) throw new Error("This history item has no stored SQL to run.");
    const response = await fetch("/api/sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: entry.connectionId, sql: entry.sql, allowExpensive }),
      signal,
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      const error = new Error(data.error ?? "The query could not run.") as Error & { code?: string };
      error.code = data.code;
      throw error;
    }
    return { columns: data.columns ?? [], rows: data.rows ?? [], truncated: data.truncated };
  }

  async function runSql(entry: HistoryEntry, allowExpensive = false) {
    if (runs[entry.id]?.busy) {
      runControllers.current[entry.id]?.abort();
      return;
    }
    const controller = new AbortController();
    runControllers.current[entry.id] = controller;
    setExpanded(entry.id);
    setRuns((current) => ({ ...current, [entry.id]: { busy: true } }));
    try {
      const result = await execute(entry, controller.signal, allowExpensive);
      setRuns((current) => ({ ...current, [entry.id]: { result } }));
    } catch (error) {
      const queryError = error as Error & { code?: string };
      setRuns((current) => ({ ...current, [entry.id]: { error: error instanceof DOMException && error.name === "AbortError" ? "Query cancelled." : error instanceof Error ? error.message : "The query could not run.", costWarning: queryError.code === "QUERY_COST_WARNING" } }));
    } finally {
      if (runControllers.current[entry.id] === controller) delete runControllers.current[entry.id];
    }
  }

  function toggleEntry(entry: HistoryEntry) {
    if (expanded === entry.id) {
      setExpanded(null);
      return;
    }
    setExpanded(entry.id);
    if (entry.kind === "chart" && entry.ok && entry.sql && entry.connectionName && !runs[entry.id]) void runSql(entry);
  }

  async function saveToDashboard(entry: HistoryEntry) {
    if (!entry.sql || saves[entry.id] === "saving") return;
    setSaves((current) => ({ ...current, [entry.id]: "saving" }));
    try {
      const lastResult = runs[entry.id]?.result ?? await execute(entry);
      const chart = chartConfig(entry, lastResult);
      const widgetKind = entry.kind === "metric" ? "metric" : entry.kind === "chart" && chart ? "chart" : "table";
      const response = await fetch("/api/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: entry.connectionId,
          title: entry.question.slice(0, 200),
          question: entry.question,
          kind: widgetKind,
          sql: entry.sql,
          chartType: widgetKind === "chart" ? chart?.type : undefined,
          xColumn: widgetKind === "chart" ? chart?.x : undefined,
          yColumn: widgetKind === "chart" ? chart?.y : undefined,
          lastResult,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Could not save this result.");
      }
      setRuns((current) => ({ ...current, [entry.id]: { result: lastResult } }));
      setSaves((current) => ({ ...current, [entry.id]: "saved" }));
    } catch (error) {
      setRuns((current) => ({ ...current, [entry.id]: { ...current[entry.id], error: error instanceof Error ? error.message : "Could not save this result." } }));
      setSaves((current) => ({ ...current, [entry.id]: "error" }));
    }
  }

  async function copySql(entry: HistoryEntry) {
    if (!entry.sql) return;
    await navigator.clipboard.writeText(entry.sql);
    setCopied(entry.id);
    window.setTimeout(() => setCopied((current) => current === entry.id ? null : current), 2_000);
  }

  if (!entries) return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading question history">
      <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="skeleton h-3 w-20" /><div className="skeleton mt-3 h-7 w-16" /></div>)}</div>
      {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="skeleton h-4 w-2/3" /><div className="skeleton mt-3 h-3 w-1/3" /></div>)}
    </div>
  );

  if (loadError) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-semibold">History could not be loaded</p><p className="mt-1">{loadError}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-xl border border-red-300 px-4 font-semibold">Try again</button></div>;

  return (
    <div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)]"><dt className="text-xs font-medium text-[var(--ink-muted)]">Questions asked</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{summary.total}</dd></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)]"><dt className="text-xs font-medium text-[var(--ink-muted)]">Success rate</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{summary.total ? `${Math.round((summary.successful / summary.total) * 100)}%` : "—"}</dd></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)]"><dt className="text-xs font-medium text-[var(--ink-muted)]">Average response</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{formatDuration(summary.average)}</dd></div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <label className="relative min-w-64 flex-1"><span className="sr-only">Search history</span><Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="Search questions, SQL, errors, or databases…" className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] py-2 pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" /></label>
        <label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setVisibleCount(PAGE_SIZE); }} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm"><option value="all">All statuses</option><option value="success">Successful</option><option value="error">Errors</option></select></label>
        <label><span className="sr-only">Filter by answer type</span><select value={kind} onChange={(event) => { setKind(event.target.value); setVisibleCount(PAGE_SIZE); }} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm">{KINDS.map((value) => <option key={value} value={value}>{value === "all" ? "All types" : kindLabel(value)}</option>)}</select></label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--ink-subtle)]"><span>{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</span><span>Result rows are fetched on demand, not stored in history.</span></div>

      {!filtered.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name="history" size={23} /></span>
          <h2 className="mt-4 font-semibold">{entries.length ? "No history matches these filters" : "Your question history will appear here"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{entries.length ? "Try a broader search or reset the status and type filters." : "Ask your first question and TalkSQL will keep the question, generated SQL, timing, and outcome for your workspace."}</p>
          {entries.length ? <button type="button" onClick={() => { setQuery(""); setStatus("all"); setKind("all"); }} className="mt-5 min-h-11 rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--surface-2)]">Clear filters</button> : <Link href="/ask" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white">Ask your data</Link>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.slice(0, visibleCount).map((entry) => {
            const open = expanded === entry.id;
            const run = runs[entry.id];
            const save = saves[entry.id] ?? "idle";
            return <article key={entry.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] hover:border-[var(--brand-border)] hover:shadow-[var(--shadow-sm)]">
              <div className="flex items-start gap-3 p-4 sm:p-5">
                <button type="button" onClick={() => toggleEntry(entry)} aria-expanded={open} aria-controls={`history-${entry.id}`} className="min-w-0 flex-1 cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${entry.ok ? "bg-[var(--success-soft)] text-[var(--success-strong)]" : "bg-[#fff0ee] text-[#a63d2f]"}`}><span className={`h-1.5 w-1.5 rounded-full ${entry.ok ? "bg-[var(--success)]" : "bg-[#a63d2f]"}`} />{entry.ok ? "Successful" : "Error"}</span>
                    {entry.kind !== "chart" && <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)]">{kindLabel(entry.kind)}</span>}
                    <span className="text-xs text-[var(--ink-subtle)]">{entry.connectionName ?? "Deleted connection"}</span>
                  </div>
                  <h2 className="mt-3 text-sm font-semibold leading-6 sm:text-base">{entry.question}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-subtle)]"><span>{new Date(entry.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span><span>{formatDuration(entry.durationMs)}</span><span>{entry.sql ? "SQL available" : "No SQL"}</span></div>
                </button>
                <svg aria-hidden="true" viewBox="0 0 20 20" className={`mt-2 h-5 w-5 shrink-0 text-[var(--ink-subtle)] transition-transform ${open ? "rotate-180" : ""}`}><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>

              {open && <div id={`history-${entry.id}`} className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
                {entry.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">What went wrong</p><p className="mt-1 break-words leading-6">{entry.error}</p></div>}
                {entry.kind === "chart" && entry.ok && entry.sql && !run?.result && <div className="mb-4 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-soft)] p-5 text-center">
                  <div>{run?.busy ? <><span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-[var(--brand)]/25 border-t-[var(--brand)]" /><p className="mt-3 text-sm font-medium text-[var(--brand)]">Loading current chart data…</p></> : <><Icon name="dashboard" size={24} className="mx-auto text-[var(--brand)]" /><p className="mt-3 text-sm font-semibold">Chart preview</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Run the saved read-only SQL to visualize current data.</p><button type="button" onClick={() => runSql(entry)} className="mt-3 min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white">Preview chart</button></>}</div>
                </div>}
                {entry.sql && <div className="mt-3 first:mt-0"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">Generated SQL</p><button type="button" onClick={() => copySql(entry)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Icon name={copied === entry.id ? "check" : "copy"} size={14} />{copied === entry.id ? "Copied" : "Copy"}</button></div><pre className="max-h-72 overflow-auto rounded-xl bg-[#17211c] p-4 text-xs leading-5 text-white"><code>{entry.sql}</code></pre></div>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.connectionName && <Link href={askHref(entry, true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]"><Icon name="refresh" size={16} />Rerun question</Link>}
                  {entry.connectionName && <Link href={askHref(entry)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--brand-soft)]"><Icon name="copy" size={16} />Duplicate and edit</Link>}
                  {entry.sql && entry.connectionName && <button type="button" onClick={() => runSql(entry, run?.costWarning)} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-[var(--surface)] px-3.5 text-sm font-semibold ${run?.busy ? "border-[#d7a39b] text-[#a63d2f] hover:bg-[#fff0ee]" : "border-[var(--border-strong)] text-[var(--brand)] hover:bg-[var(--brand-soft)]"}`}><Icon name={run?.busy ? "x" : entry.kind === "chart" ? "dashboard" : "terminal"} size={16} />{run?.busy ? "Cancel query" : run?.costWarning ? "Run anyway" : previewLabel(entry)}</button>}
                  {entry.ok && entry.sql && entry.connectionName && <button type="button" onClick={() => saveToDashboard(entry)} disabled={save === "saving" || save === "saved"} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60"><Icon name={save === "saved" ? "check" : "dashboard"} size={16} />{save === "saving" ? "Saving…" : save === "saved" ? "Saved to dashboard" : save === "error" ? "Save failed — retry" : entry.kind === "chart" ? "Save chart to dashboard" : entry.kind === "metric" ? "Save metric to dashboard" : "Save as dashboard table"}</button>}
                </div>

                {run?.error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{run.error}</p>}
                {run?.result && <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{entry.kind === "chart" ? "Current chart" : entry.kind === "metric" ? "Current metric" : "Current results"}</h3><span className="text-xs text-[var(--ink-subtle)]">{run.result.rows.length}{run.result.truncated ? "+" : ""} rows</span></div>{resultPreview(entry, run.result)}</div>}
              </div>}
            </article>;
          })}
        </div>
      )}

      {visibleCount < filtered.length && <div className="mt-5 text-center"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="min-h-11 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold hover:bg-[var(--surface-2)]">Load {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more</button></div>}
    </div>
  );
}
