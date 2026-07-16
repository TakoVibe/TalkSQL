"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PromptDialog } from "../../components/dialogs";
import { downloadCsv, ResultTable, type ResultRows } from "../../components/result-views";
import { SqlEditor } from "../../components/sql-editor";

type Schema = {
  tables: { name: string }[];
  columns: { table: string; name: string }[];
};

type QueryResult = ResultRows & {
  durationMs: number;
  executedAt: string;
  error?: string;
  code?: string;
  errorDetails?: string[];
  estimate?: { estimatedRows?: number; estimatedCost?: number; fullScans?: string[]; warnings?: string[]; requiresConfirmation?: boolean };
};

type SaveState = "idle" | "saving" | "saved" | "failed";

function defaultWidgetTitle(sql: string) {
  const table = sql.match(/\bfrom\s+([\w."`]+)/i)?.[1]?.replace(/["`]/g, "");
  return table ? `${table} results` : "SQL query results";
}

async function responseData(response: Response): Promise<QueryResult> {
  const text = await response.text();
  const emptyResult = {
    columns: [],
    rows: [],
    durationMs: 0,
    executedAt: new Date().toISOString(),
  };
  if (!text) return { ...emptyResult, error: "The server returned an empty response." };
  try {
    return JSON.parse(text) as QueryResult;
  } catch {
    return { ...emptyResult, error: "The server returned an invalid response." };
  }
}

export default function SqlPage() {
  const connectionId = useSearchParams().get("connection") ?? "";
  const [sql, setSql] = useState("SELECT *\nFROM your_table\nLIMIT 100;");
  const [schema, setSchema] = useState<Schema>();
  const [result, setResult] = useState<QueryResult>();
  const [running, setRunning] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [namingWidget, setNamingWidget] = useState(false);
  const queryController = useRef<AbortController | null>(null);

  const tabular = useMemo<ResultRows | undefined>(() => {
    if (!result || result.error || !result.columns || !result.rows) return undefined;
    return { columns: result.columns, rows: result.rows, truncated: result.truncated };
  }, [result]);

  useEffect(() => {
    if (!connectionId) return;
    fetch(`/api/connections/${connectionId}/schema`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Schema discovery failed.");
        return response.json() as Promise<Schema>;
      })
      .then(setSchema)
      .catch(() => setSchema(undefined));
  }, [connectionId]);

  async function run(allowExpensive = false) {
    if (!connectionId || running) return;
    const controller = new AbortController();
    queryController.current = controller;
    setRunning(true);
    setResult(undefined);
    setSaveState("idle");
    try {
      const response = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, sql, allowExpensive }),
        signal: controller.signal,
      });
      const data = await responseData(response);
      setResult(data);
    } catch (error) {
      setResult({
        columns: [],
        rows: [],
        durationMs: 0,
        executedAt: new Date().toISOString(),
        error: error instanceof DOMException && error.name === "AbortError" ? "Query cancelled." : "Could not reach the query service. Try again.",
        code: error instanceof DOMException && error.name === "AbortError" ? "QUERY_CANCELLED" : "NETWORK_ERROR",
      });
    } finally {
      if (queryController.current === controller) queryController.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    queryController.current?.abort(new DOMException("Query cancelled.", "AbortError"));
  }

  async function saveToDashboard(title: string) {
    if (!tabular) return;
    setNamingWidget(false);
    setSaveState("saving");
    try {
      const response = await fetch("/api/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          title,
          question: "Saved from SQL editor",
          kind: "table",
          sql,
          lastResult: tabular,
        }),
      });
      setSaveState(response.ok ? "saved" : "failed");
    } catch {
      setSaveState("failed");
    }
  }

  return (
    <div>
      {namingWidget && (
        <PromptDialog
          title="Add table to dashboard"
          defaultValue={defaultWidgetTitle(sql)}
          placeholder="Dashboard table name"
          submitLabel="Add table"
          onSubmit={saveToDashboard}
          onClose={() => setNamingWidget(false)}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--accent)]">SQL WORKSPACE</p>
          <h2 className="mt-2 text-3xl font-semibold">SQL Editor</h2>
        </div>
        {!connectionId && <span className="text-sm text-[var(--ink-muted)]">Pick a connection in the top bar</span>}
      </div>
      <p className="mt-3 text-sm text-[var(--ink-muted)]">Autocomplete uses the selected connection’s schema. Press ⌘/Ctrl + Enter to run.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border)]">
        <SqlEditor value={sql} onChange={setSql} schema={connectionId ? schema : undefined} onRun={run} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => run()} disabled={running || !connectionId} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {running ? "Running…" : "Run query"}
        </button>
        {running && <button onClick={cancel} className="rounded-lg border border-[#d7a39b] bg-white px-4 py-2 text-sm font-medium text-[#a63d2f] hover:bg-[#fff0ee]">Cancel query</button>}
      </div>

      {result && (
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {result.error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <p className="text-sm font-semibold">{result.code === "QUERY_COST_WARNING" ? "Review query cost" : result.code === "QUERY_CANCELLED" ? "Query cancelled" : "Query could not run"}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5">{result.errorDetails?.join("\n") ?? `Message: ${result.error}`}</pre>
              {result.code === "QUERY_COST_WARNING" && <button onClick={() => run(true)} disabled={running} className="mt-4 rounded-lg bg-[#a63d2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8c3222] disabled:opacity-50">Run anyway</button>}
            </div>
          ) : tabular ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Query results</h3>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {tabular.rows.length} rows{tabular.truncated ? "+" : ""} · {result.durationMs}ms · Updated {new Date(result.executedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadCsv(tabular, defaultWidgetTitle(sql))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--brand-soft)]">
                    ↓ CSV
                  </button>
                  {saveState === "saved" ? (
                    <Link href="/dashboard" className="rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-medium text-[var(--brand)]">
                      ✓ Added · View dashboard
                    </Link>
                  ) : (
                    <button onClick={() => setNamingWidget(true)} disabled={saveState === "saving"} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60">
                      {saveState === "saving" ? "Adding…" : saveState === "failed" ? "Couldn’t add — retry" : "Add to dashboard"}
                    </button>
                  )}
                </div>
              </div>
              {tabular.rows.length ? (
                <div className="mt-4"><ResultTable result={tabular} /></div>
              ) : (
                <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--ink-muted)]">The query ran successfully, but it did not return any rows.</p>
              )}
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}
