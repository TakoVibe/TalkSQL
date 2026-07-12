"use client";
import { useState } from "react";

import { SchemaDiagram, type Snapshot } from "./schema-explorer";
import { downloadCsv, MetricTile, ResultChart, ResultTable, type ChartType, type ResultRows } from "./result-views";

type View = { kind: "metric" | "table" | "chart"; chartType: ChartType };
const CHART_VIEWS: { label: string; view: View }[] = [
  { label: "Table", view: { kind: "table", chartType: "bar" } },
  { label: "Bar", view: { kind: "chart", chartType: "bar" } },
  { label: "Line", view: { kind: "chart", chartType: "line" } },
  { label: "Area", view: { kind: "chart", chartType: "area" } },
  { label: "Pie", view: { kind: "chart", chartType: "pie" } },
];

const PAGE_SIZE = 20;

type Answer = {
  kind: "metric" | "table" | "chart" | "schema_diagram" | "clarify";
  title: string;
  sql?: string;
  clarifyQuestion?: string;
  chartType?: "bar" | "line" | null;
  xColumn?: string | null;
  yColumn?: string | null;
  focusTables?: string[] | null;
  schema?: Snapshot;
  columns?: string[];
  rows?: Record<string, unknown>[];
  truncated?: boolean;
};

export function AskData({ connectionId }: { connectionId?: string }) {
  const [question, setQuestion] = useState("");
  const connection = connectionId ?? "";
  const [stage, setStage] = useState("Ready — no query has been executed.");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer>();
  const [page, setPage] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [view, setView] = useState<View>();
  const [clarifyInput, setClarifyInput] = useState("");
  const [lastAsked, setLastAsked] = useState("");

  async function ask(override?: string) {
    const fullQuestion = override ?? question;
    if (!fullQuestion || !connection) return;
    setLastAsked(fullQuestion); setClarifyInput("");
    setBusy(true); setAnswer(undefined); setPage(0); setSaveState("idle"); setView(undefined); setStage("Understanding the question…");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: fullQuestion, connectionId: connection }) });
      const d = await r.json();
      if (!r.ok) { setAnswer(d.sql ? { kind: "table", title: "Failed query", sql: d.sql } : undefined); throw new Error(d.error); }
      setAnswer(d);
      setStage(d.kind === "clarify" ? "Needs clarification." : `Done — ${d.rows ? `${d.rows.length} rows${d.truncated ? " (truncated)" : ""}` : d.kind.replace("_", " ")}.`);
    } catch (e) { setStage(`Stopped — ${e instanceof Error ? e.message : "request failed"}`) } finally { setBusy(false) }
  }

  const tabular: ResultRows | undefined = answer?.columns && answer?.rows ? { columns: answer.columns, rows: answer.rows, truncated: answer.truncated } : undefined;
  // View-as fallbacks: first non-numeric column charts as x, first numeric as y.
  const xCol = answer?.xColumn ?? tabular?.columns.find((c) => tabular.rows.some((row) => typeof row[c] !== "number")) ?? tabular?.columns[0];
  const yCol = answer?.yColumn ?? tabular?.columns.find((c) => tabular.rows.some((row) => typeof row[c] === "number"));
  const effective: View | undefined = answer && answer.kind !== "clarify" && answer.kind !== "schema_diagram"
    ? view ?? { kind: answer.kind as View["kind"], chartType: answer.chartType ?? "bar" }
    : undefined;

  async function save() {
    if (!answer || answer.kind === "clarify") return;
    setSaveState("saving");
    const lastResult = answer.kind === "schema_diagram" ? { schema: answer.schema } : { columns: answer.columns, rows: answer.rows, truncated: answer.truncated };
    const kind = effective?.kind ?? answer.kind;
    const r = await fetch("/api/widgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: connection, title: answer.title, question, kind, sql: answer.sql, chartType: effective?.chartType ?? answer.chartType, xColumn: xCol, yColumn: yCol, focusTables: answer.focusTables, lastResult }) }).catch(() => undefined);
    setSaveState(r?.ok ? "saved" : "failed");
  }

  const showResult = answer && answer.kind !== "clarify" && (tabular || answer.schema);

  return <div className="mx-auto mt-9 max-w-3xl rounded-2xl border border-[#cfd7d1] bg-white p-3 text-left shadow-sm">
    <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask anything about your data…" className="min-h-28 w-full rounded-xl bg-[#fbfcfa] p-4 outline-none" />
    <div className="flex justify-between p-2">
      <span className="self-center text-xs text-[#8b948e]">{connection ? "" : "Pick a connection in the top bar"}</span>
      <button onClick={() => ask()} disabled={busy || !connection} className="rounded-lg bg-[#205b43] px-4 py-2 text-white disabled:opacity-60">{busy ? "Working…" : "Ask →"}</button>
    </div>

    {!showResult && <div className="flex items-center gap-2.5 rounded-lg bg-[#f0f4f1] p-3 text-sm text-[#526059]">{busy && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#205b43]/25 border-t-[#205b43]" />}{answer?.kind === "clarify" ? "Waiting for your clarification…" : stage}</div>}

    {answer?.kind === "clarify" && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#17211c]/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="clarify-title">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-left shadow-2xl">
          <p id="clarify-title" className="text-xs font-semibold tracking-[0.12em] text-[#27704f]">ONE QUESTION BEFORE I RUN THIS</p>
          <p className="mt-3 text-sm leading-6 text-[#17211c]">{answer.clarifyQuestion}</p>
          <textarea value={clarifyInput} onChange={e => setClarifyInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && clarifyInput.trim()) { e.preventDefault(); ask(`${lastAsked}\n\nClarification (${answer.clarifyQuestion}): ${clarifyInput}`); } }} rows={2} placeholder="Type your answer…" autoFocus className="mt-4 w-full rounded-lg border border-[#cfd7d1] bg-[#fbfcfa] p-3 text-sm outline-none focus:border-[#205b43]" />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setAnswer(undefined); setStage("Cancelled — refine your question and ask again."); }} className="rounded-lg px-3 py-2 text-sm text-[#66716b] hover:bg-[#f0f2ef]">Cancel</button>
            <button onClick={() => ask(`${lastAsked}\n\nClarification (${answer.clarifyQuestion}): ${clarifyInput}`)} disabled={!clarifyInput.trim() || busy} className="rounded-lg bg-[#205b43] px-4 py-2 text-sm font-medium text-white hover:bg-[#174532] disabled:opacity-60">Continue →</button>
          </div>
        </div>
      </div>
    )}
    {busy && <div className="mt-3 space-y-2 p-1" aria-busy="true"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-40 w-full" /></div>}

    {showResult && <div className="mt-1">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-[#17211c]">{answer.title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {tabular && <button onClick={() => downloadCsv(tabular, answer.title || "result")} className="rounded-lg border border-[#cfd7d1] px-3 py-1.5 text-xs font-medium text-[#526059] hover:bg-[#f0f4f1]">↓ CSV</button>}
          <button onClick={save} disabled={saveState === "saving" || saveState === "saved"} className="rounded-lg border border-[#cfd7d1] px-3 py-1.5 text-xs font-medium text-[#205b43] hover:bg-[#f0f4f1] disabled:opacity-60">{saveState === "saved" ? "✓ Saved to dashboard" : saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed — retry" : "Save to dashboard"}</button>
        </div>
      </div>
      {effective && tabular && <div className="flex flex-wrap gap-1 px-1 pb-3 text-xs">
        {tabular.rows.length === 1 && <button onClick={() => { setView({ kind: "metric", chartType: "bar" }); setSaveState("idle"); }} className={`rounded-full border px-3 py-1 ${effective.kind === "metric" ? "border-[#205b43] bg-[#e6f1eb] font-medium text-[#205b43]" : "border-[#dfe4df] text-[#526059] hover:bg-[#f0f4f1]"}`}>Metric</button>}
        {CHART_VIEWS.map(({ label, view: v }) => {
          const disabled = v.kind === "chart" && (!xCol || !yCol);
          const active = effective.kind === v.kind && (v.kind !== "chart" || effective.chartType === v.chartType);
          return <button key={label} onClick={() => { setView(v); setSaveState("idle"); }} disabled={disabled} className={`rounded-full border px-3 py-1 disabled:opacity-40 ${active ? "border-[#205b43] bg-[#e6f1eb] font-medium text-[#205b43]" : "border-[#dfe4df] text-[#526059] hover:bg-[#f0f4f1]"}`}>{label}</button>;
        })}
      </div>}
      {effective?.kind === "metric" && tabular && <MetricTile title={answer.title} result={tabular} />}
      {effective?.kind === "chart" && tabular && xCol && yCol && <div className="rounded-xl border border-[#dfe4df] p-4"><ResultChart result={tabular} x={xCol} y={yCol} type={effective.chartType} /></div>}
      {answer.kind === "schema_diagram" && answer.schema && <SchemaDiagram schema={answer.schema} />}
      {effective?.kind === "table" && tabular && <div className="overflow-x-auto rounded-lg border border-[#dfe4df]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f9f7] text-xs text-[#718078]"><tr>{tabular.columns.map(c => <th key={c} className="px-4 py-2.5 font-medium">{c}</th>)}</tr></thead>
          <tbody>{tabular.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, i) => <tr key={i} className="border-t border-[#edf0ed]">{tabular.columns.map(c => <td key={c} className="max-w-64 truncate px-4 py-2.5">{row[c] == null ? "—" : String(row[c])}</td>)}</tr>)}</tbody>
        </table>
        {tabular.rows.length > PAGE_SIZE && <div className="flex items-center justify-between border-t border-[#edf0ed] px-4 py-2 text-xs text-[#66716b]">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tabular.rows.length)} of {tabular.rows.length}{tabular.truncated ? "+" : ""}</span>
          <span className="flex gap-2">
            <button onClick={() => setPage(page - 1)} disabled={page === 0} className="rounded border border-[#dfe4df] px-2 py-1 disabled:opacity-40">← Prev</button>
            <button onClick={() => setPage(page + 1)} disabled={(page + 1) * PAGE_SIZE >= tabular.rows.length} className="rounded border border-[#dfe4df] px-2 py-1 disabled:opacity-40">Next →</button>
          </span>
        </div>}
      </div>}
    </div>}

    {answer?.sql && <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-[#66716b] hover:text-[#205b43]">Show details</summary>
      <p className="mt-2 text-sm text-[#526059]">{stage}</p>
      <p className="mt-3 text-xs font-semibold text-[#27704f]">GENERATED SQL</p>
      <pre className="mt-2 overflow-auto rounded-lg bg-[#17211c] p-3 text-xs text-white">{answer.sql}</pre>
      {effective?.kind === "chart" && tabular && <div className="mt-3"><ResultTable result={tabular} maxRows={20} /></div>}
    </details>}
  </div>;
}
