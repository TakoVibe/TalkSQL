"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { ConfirmDialog, PromptDialog } from "../../components/dialogs";
import { Icon } from "../../components/icons";
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

type ScriptSummary = {
  id: string;
  connectionId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ScriptRecord = ScriptSummary & { content: string };
type SaveState = "idle" | "saving" | "saved" | "failed";
type ScriptSaveState = "idle" | "saving" | "saved" | "failed";
type ScriptPrompt = "save-as" | "rename";
type ResultTab = "results" | "messages" | "details";
type PendingAction = { type: "new" } | { type: "open"; id: string } | { type: "import"; name: string; content: string };

const NEW_SCRIPT_SQL = "-- New read-only query\nSELECT CURRENT_TIMESTAMP AS queried_at;";
const RESULT_TABS: { value: ResultTab; label: string }[] = [
  { value: "results", label: "Results" },
  { value: "messages", label: "Messages" },
  { value: "details", label: "Query details" },
];

function defaultWidgetTitle(sql: string) {
  const table = sql.match(/\bfrom\s+([\w."`]+)/i)?.[1]?.replace(/["`]/g, "");
  return table ? `${table} results` : "SQL query results";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function downloadSqlFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/sql;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.toLowerCase().endsWith(".sql") ? name : `${name}.sql`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function responseData(response: Response): Promise<QueryResult> {
  const text = await response.text();
  const emptyResult = { columns: [], rows: [], durationMs: 0, executedAt: new Date().toISOString() };
  if (!text) return { ...emptyResult, error: "The server returned an empty response." };
  try {
    return JSON.parse(text) as QueryResult;
  } catch {
    return { ...emptyResult, error: "The server returned an invalid response." };
  }
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request failed.");
  return data;
}

export default function SqlPage() {
  const connectionId = useSearchParams().get("connection") ?? "";
  return <SqlWorkspace key={connectionId || "no-connection"} connectionId={connectionId} />;
}

function SqlWorkspace({ connectionId }: { connectionId: string }) {
  const [sql, setSql] = useState(NEW_SCRIPT_SQL);
  const [savedContent, setSavedContent] = useState(NEW_SCRIPT_SQL);
  const [activeScriptId, setActiveScriptId] = useState<string>();
  const [activeScriptName, setActiveScriptName] = useState("Untitled.sql");
  const [scripts, setScripts] = useState<ScriptSummary[] | undefined>(connectionId ? undefined : []);
  const [scriptSearch, setScriptSearch] = useState("");
  const [scriptSaveState, setScriptSaveState] = useState<ScriptSaveState>("idle");
  const [scriptError, setScriptError] = useState<string>();
  const [scriptPrompt, setScriptPrompt] = useState<ScriptPrompt>();
  const [deletingScript, setDeletingScript] = useState<ScriptSummary>();
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [loadingScriptId, setLoadingScriptId] = useState<string>();
  const [schema, setSchema] = useState<Schema>();
  const [result, setResult] = useState<QueryResult>();
  const [executedSql, setExecutedSql] = useState(NEW_SCRIPT_SQL);
  const [running, setRunning] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [namingWidget, setNamingWidget] = useState(false);
  const [resultTab, setResultTab] = useState<ResultTab>("results");
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [resultMaximized, setResultMaximized] = useState(false);
  const [resultPaneHeight, setResultPaneHeight] = useState(280);
  const queryController = useRef<AbortController | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const dirty = sql !== savedContent;

  const tabular = useMemo<ResultRows | undefined>(() => {
    if (!result || result.error || !result.columns || !result.rows) return undefined;
    return { columns: result.columns, rows: result.rows, truncated: result.truncated };
  }, [result]);

  const filteredScripts = useMemo(() => {
    const query = scriptSearch.trim().toLowerCase();
    return query ? (scripts ?? []).filter((script) => script.name.toLowerCase().includes(query)) : scripts ?? [];
  }, [scriptSearch, scripts]);
  const loadingScriptName = scripts?.find((script) => script.id === loadingScriptId)?.name;

  useEffect(() => {
    if (!connectionId) return;
    const controller = new AbortController();
    fetch(`/api/sql/scripts?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => jsonResponse<{ scripts: ScriptSummary[] }>(response))
      .then((data) => setScripts(data.scripts))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setScripts([]);
        setScriptError(error instanceof Error ? error.message : "Scripts could not be loaded.");
      });
    return () => controller.abort();
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId) return;
    const controller = new AbortController();
    fetch(`/api/connections/${connectionId}/schema`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Schema discovery failed.");
        return response.json() as Promise<Schema>;
      })
      .then(setSchema)
      .catch(() => setSchema(undefined));
    return () => controller.abort();
  }, [connectionId]);

  function upsertScript(script: ScriptRecord) {
    const summary: ScriptSummary = script;
    setScripts((current) => [summary, ...(current ?? []).filter((item) => item.id !== summary.id)]);
  }

  function startNewScript(name = "Untitled.sql", content = NEW_SCRIPT_SQL) {
    setActiveScriptId(undefined);
    setActiveScriptName(name);
    setSql(content);
    setSavedContent(NEW_SCRIPT_SQL);
    setResult(undefined);
    setScriptSaveState("idle");
    setScriptError(undefined);
  }

  async function openScript(id: string) {
    setScriptError(undefined);
    setLoadingScriptId(id);
    try {
      const data = await fetch(`/api/sql/scripts/${id}`, { cache: "no-store" }).then((response) => jsonResponse<{ script: ScriptRecord }>(response));
      setActiveScriptId(data.script.id);
      setActiveScriptName(data.script.name);
      setSql(data.script.content);
      setSavedContent(data.script.content);
      setResult(undefined);
      setScriptSaveState("idle");
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : "The script could not be opened.");
    } finally {
      setLoadingScriptId(undefined);
    }
  }

  async function performAction(action: PendingAction) {
    setPendingAction(undefined);
    if (action.type === "new") startNewScript();
    else if (action.type === "import") startNewScript(action.name, action.content);
    else await openScript(action.id);
  }

  function requestAction(action: PendingAction) {
    if (dirty) setPendingAction(action);
    else void performAction(action);
  }

  async function createScript(name: string) {
    if (!connectionId) return;
    setScriptSaveState("saving");
    setScriptError(undefined);
    try {
      const data = await fetch("/api/sql/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, name, content: sql }),
      }).then((response) => jsonResponse<{ script: ScriptRecord }>(response));
      setActiveScriptId(data.script.id);
      setActiveScriptName(data.script.name);
      setSavedContent(data.script.content);
      upsertScript(data.script);
      setScriptSaveState("saved");
    } catch (error) {
      setScriptSaveState("failed");
      setScriptError(error instanceof Error ? error.message : "The script could not be saved.");
    }
  }

  async function saveCurrentScript() {
    if (!connectionId) return;
    if (!activeScriptId) {
      setScriptPrompt("save-as");
      return;
    }
    setScriptSaveState("saving");
    setScriptError(undefined);
    try {
      const data = await fetch(`/api/sql/scripts/${activeScriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sql }),
      }).then((response) => jsonResponse<{ script: ScriptRecord }>(response));
      setSavedContent(data.script.content);
      upsertScript(data.script);
      setScriptSaveState("saved");
    } catch (error) {
      setScriptSaveState("failed");
      setScriptError(error instanceof Error ? error.message : "The script could not be saved.");
    }
  }

  async function renameCurrentScript(name: string) {
    if (!activeScriptId) return;
    setScriptSaveState("saving");
    setScriptError(undefined);
    try {
      const data = await fetch(`/api/sql/scripts/${activeScriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((response) => jsonResponse<{ script: ScriptRecord }>(response));
      setActiveScriptName(data.script.name);
      upsertScript(data.script);
      setScriptSaveState("saved");
    } catch (error) {
      setScriptSaveState("failed");
      setScriptError(error instanceof Error ? error.message : "The script could not be renamed.");
    }
  }

  async function deleteScript(script: ScriptSummary) {
    setScriptError(undefined);
    try {
      await fetch(`/api/sql/scripts/${script.id}`, { method: "DELETE" }).then((response) => jsonResponse<{ ok: true }>(response));
      setScripts((current) => (current ?? []).filter((item) => item.id !== script.id));
      if (activeScriptId === script.id) startNewScript();
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : "The script could not be deleted.");
    }
  }

  async function importFile(file: File) {
    if (file.size > 250_000) {
      setScriptError("SQL files can be at most 250 KB.");
      return;
    }
    const content = await file.text();
    requestAction({ type: "import", name: file.name.toLowerCase().endsWith(".sql") ? file.name : `${file.name}.sql`, content });
  }

  async function run(statement = sql, allowExpensive = false) {
    if (!connectionId || running || !statement.trim()) return;
    const controller = new AbortController();
    queryController.current = controller;
    setRunning(true);
    setResult(undefined);
    setResultTab("results");
    setResultCollapsed(false);
    setResultMaximized(false);
    setExecutedSql(statement);
    setSaveState("idle");
    try {
      const response = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, sql: statement, allowExpensive }),
        signal: controller.signal,
      });
      const data = await responseData(response);
      setResult(data);
      setResultTab(data.error ? "messages" : "results");
    } catch (error) {
      setResult({
        columns: [],
        rows: [],
        durationMs: 0,
        executedAt: new Date().toISOString(),
        error: error instanceof DOMException && error.name === "AbortError" ? "Query cancelled." : "Could not reach the query service. Try again.",
        code: error instanceof DOMException && error.name === "AbortError" ? "QUERY_CANCELLED" : "NETWORK_ERROR",
      });
      setResultTab("messages");
    } finally {
      if (queryController.current === controller) queryController.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    queryController.current?.abort(new DOMException("Query cancelled.", "AbortError"));
  }

  function startResultResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = resultPaneHeight;
    const onMove = (moveEvent: PointerEvent) => setResultPaneHeight(Math.min(520, Math.max(170, startHeight + startY - moveEvent.clientY)));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  async function saveToDashboard(title: string) {
    if (!tabular) return;
    setNamingWidget(false);
    setSaveState("saving");
    try {
      const response = await fetch("/api/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, title, question: "Saved from SQL editor", kind: "table", sql: executedSql, lastResult: tabular }),
      });
      setSaveState(response.ok ? "saved" : "failed");
    } catch {
      setSaveState("failed");
    }
  }

  return (
    <div>
      {namingWidget && <PromptDialog title="Add table to dashboard" defaultValue={defaultWidgetTitle(executedSql)} placeholder="Dashboard table name" submitLabel="Add table" onSubmit={saveToDashboard} onClose={() => setNamingWidget(false)} />}
      {scriptPrompt === "save-as" && <PromptDialog title="Save SQL script" defaultValue={activeScriptName === "Untitled.sql" ? "query.sql" : activeScriptName} placeholder="Script name" submitLabel="Save script" onSubmit={createScript} onClose={() => setScriptPrompt(undefined)} />}
      {scriptPrompt === "rename" && <PromptDialog title="Rename SQL script" defaultValue={activeScriptName} placeholder="Script name" submitLabel="Rename" onSubmit={renameCurrentScript} onClose={() => setScriptPrompt(undefined)} />}
      {deletingScript && <ConfirmDialog title="Delete this SQL script?" body={`“${deletingScript.name}” will be permanently removed from this workspace. Your database is not affected.`} onConfirm={() => void deleteScript(deletingScript)} onClose={() => setDeletingScript(undefined)} />}
      {pendingAction && <ConfirmDialog title="Discard unsaved changes?" body="The current editor has changes that have not been saved." confirmLabel="Discard changes" onConfirm={() => void performAction(pendingAction)} onClose={() => setPendingAction(undefined)} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold tracking-[.12em] text-[var(--accent)]">SQL WORKSPACE</p><h2 className="mt-2 text-3xl font-semibold">SQL Editor</h2></div>
        {!connectionId && <span className="text-sm text-[var(--ink-muted)]">Pick a connection in the top bar</span>}
      </div>
      <p className="mt-3 text-sm text-[var(--ink-muted)]">Save reusable scripts to your workspace, import or export .sql files, and run the selection with ⌘/Ctrl + Enter.</p>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)]">
        <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-[var(--border)] bg-[var(--surface-2)] lg:border-b-0 lg:border-r" aria-label="Saved SQL scripts">
            <div className="border-b border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--ink-subtle)]">Saved scripts</p><p className="mt-0.5 text-[11px] text-[var(--ink-subtle)]">{scripts?.length ?? 0} for this database</p></div><button type="button" onClick={() => requestAction({ type: "new" })} disabled={!connectionId} aria-label="New SQL script" title="New SQL script" className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)] disabled:opacity-45"><Icon name="plus" size={17} /></button></div>
              <label className="relative mt-3 block"><span className="sr-only">Search saved scripts</span><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)]" /><input value={scriptSearch} onChange={(event) => setScriptSearch(event.target.value)} placeholder="Search scripts…" className="min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" /></label>
            </div>
            <div className="max-h-60 flex-1 overflow-y-auto p-2 lg:max-h-[470px]">
              {scripts === undefined && <div className="space-y-2 p-1">{[1, 2, 3].map((item) => <div key={item} className="skeleton h-14 rounded-xl" />)}</div>}
              {scripts !== undefined && !filteredScripts.length && <p className="px-3 py-8 text-center text-xs leading-5 text-[var(--ink-subtle)]">{scripts.length ? "No scripts match your search." : "No saved scripts for this database yet."}</p>}
              <ul className="space-y-1">{filteredScripts.map((script) => <li key={script.id} className="group/script flex items-center gap-1">
                <button type="button" onClick={() => script.id !== activeScriptId && requestAction({ type: "open", id: script.id })} disabled={Boolean(loadingScriptId)} aria-busy={loadingScriptId === script.id} className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-wait ${script.id === activeScriptId ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"}`}><span className="flex items-center gap-2">{loadingScriptId === script.id ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--brand)]/25 border-t-[var(--brand)]" /> : <Icon name="terminal" size={14} className="shrink-0" />}<span className="truncate text-xs font-semibold">{script.name}</span>{script.id === activeScriptId && dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-label="Unsaved changes" />}</span><span className="mt-1 block pl-[22px] text-[10px] text-[var(--ink-subtle)]">{loadingScriptId === script.id ? "Opening…" : `Updated ${formatUpdatedAt(script.updatedAt)}`}</span></button>
                <button type="button" onClick={() => setDeletingScript(script)} disabled={Boolean(loadingScriptId)} aria-label={`Delete ${script.name}`} title="Delete script" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--ink-subtle)] opacity-0 hover:bg-[#fff0ee] hover:text-[#a63d2f] focus:opacity-100 focus-visible:ring-2 focus-visible:ring-[#a63d2f] disabled:pointer-events-none group-hover/script:opacity-100"><Icon name="trash" size={14} /></button>
              </li>)}</ul>
            </div>
            <div className="flex gap-2 border-t border-[var(--border)] p-3">
              <input ref={importInput} type="file" accept=".sql,text/sql,text/plain" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
              <button type="button" onClick={() => importInput.current?.click()} disabled={!connectionId} className="min-h-10 flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] disabled:opacity-45">Import .sql</button>
              <button type="button" onClick={() => downloadSqlFile(activeScriptName, sql)} className="min-h-10 flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--brand-soft)]">Export</button>
            </div>
          </aside>

          <div className="flex min-h-[680px] min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2"><Icon name="terminal" size={16} className="shrink-0 text-[var(--brand)]" /><p className="truncate text-sm font-semibold">{activeScriptName}</p>{dirty && <span className="shrink-0 rounded-full bg-[#fff3e8] px-2 py-0.5 text-[10px] font-semibold text-[#9a5b1f]">Unsaved</span>}{scriptSaveState === "saved" && !dirty && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[var(--brand)]"><Icon name="check" size={11} />Saved</span>}</div>
              <div className="flex flex-wrap items-center gap-2">
                {activeScriptId && <button type="button" onClick={() => setScriptPrompt("rename")} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">Rename</button>}
                <button type="button" onClick={() => setScriptPrompt("save-as")} disabled={!connectionId || scriptSaveState === "saving"} className="min-h-10 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-2)] disabled:opacity-45">Save as</button>
                <button type="button" onClick={() => void saveCurrentScript()} disabled={!connectionId || scriptSaveState === "saving"} className="min-h-10 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--surface-2)] disabled:opacity-45">{scriptSaveState === "saving" ? "Saving…" : "Save"}</button>
                {running ? <button type="button" onClick={cancel} className="min-h-10 rounded-lg border border-[#d7a39b] bg-[#fff0ee] px-3 text-xs font-semibold text-[#a63d2f] hover:bg-[#ffe4e0]">Cancel</button> : <button type="button" onClick={() => void run(sql)} disabled={!connectionId} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-xs font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-45"><Icon name="arrow-right" size={14} />Run</button>}
              </div>
            </div>
            {scriptError && <div role="alert" className="flex items-center justify-between gap-3 border-b border-[#f0c8c2] bg-[#fff0ee] px-4 py-2 text-xs text-[#a63d2f]"><span>{scriptError}</span><button type="button" onClick={() => setScriptError(undefined)} aria-label="Dismiss script error" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white"><Icon name="x" size={14} /></button></div>}
            <div className="relative min-h-[520px] flex-1 overflow-hidden">
              <SqlEditor height="100%" value={sql} onChange={(value) => { setSql(value); setScriptSaveState("idle"); }} schema={connectionId ? schema : undefined} onRun={(selection) => void run(selection ?? sql)} onSave={() => void saveCurrentScript()} />
              {loadingScriptId && <div className="absolute inset-0 z-30 grid place-items-center bg-[color-mix(in_srgb,var(--foreground)_18%,transparent)] p-6 backdrop-blur-[2px]" role="status" aria-live="polite" aria-label={`Opening ${loadingScriptName ?? "SQL script"}`}><div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 text-center shadow-[var(--shadow-md)]"><span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-[var(--brand)]/25 border-t-[var(--brand)]" /><p className="mt-3 text-sm font-semibold">Opening {loadingScriptName ?? "script"}…</p><p className="mt-1 text-xs text-[var(--ink-subtle)]">Loading the latest saved content</p></div></div>}
              {(running || result) && <div style={resultMaximized ? undefined : { height: resultCollapsed ? 44 : resultPaneHeight }} className={`absolute inset-x-0 bottom-0 z-20 flex min-h-0 flex-col border-t border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_-14px_34px_rgba(23,33,28,0.16)] ${resultMaximized ? "top-0" : ""}`}>
              {!resultCollapsed && !resultMaximized && <div role="separator" aria-label="Resize query output" aria-orientation="horizontal" aria-valuemin={170} aria-valuemax={520} aria-valuenow={resultPaneHeight} tabIndex={0} onPointerDown={startResultResize} onKeyDown={(event) => { if (event.key === "ArrowUp") setResultPaneHeight((height) => Math.min(520, height + 20)); if (event.key === "ArrowDown") setResultPaneHeight((height) => Math.max(170, height - 20)); }} className="group relative z-[1] h-2 shrink-0 cursor-row-resize touch-none border-y border-[var(--border)] bg-[var(--surface-2)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"><span className="absolute left-1/2 top-1/2 h-1 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--border-strong)] transition-colors group-hover:bg-[var(--brand-border)]" /></div>}
              <section aria-label="Query output" className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
                <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-2">
                  <div className="flex min-w-0 items-center self-stretch overflow-x-auto" role="tablist" aria-label="Query output views">{RESULT_TABS.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={resultTab === tab.value} onClick={() => { setResultTab(tab.value); setResultCollapsed(false); }} className={`min-h-11 shrink-0 border-b-2 px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${resultTab === tab.value ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--ink-muted)] hover:text-[var(--foreground)]"}`}>{tab.label}{tab.value === "messages" && result?.error && <span className="ml-1.5 rounded-full bg-[#fff0ee] px-1.5 py-0.5 text-[9px] text-[#a63d2f]">1</span>}</button>)}</div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="hidden text-[10px] text-[var(--ink-subtle)] sm:block">{running ? "Running…" : result?.error ? "Query failed" : tabular ? `${tabular.rows.length}${tabular.truncated ? "+" : ""} rows · ${result?.durationMs ?? 0}ms` : "No rows"}</span>
                    <button type="button" onClick={() => { setResultMaximized(false); setResultCollapsed((collapsed) => !collapsed); }} aria-label={resultCollapsed ? "Expand query output" : "Collapse query output"} title={resultCollapsed ? "Expand output" : "Collapse output"} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="panel-left" size={15} className={`transition-transform ${resultCollapsed ? "rotate-90" : "-rotate-90"}`} /></button>
                    <button type="button" onClick={() => { setResultCollapsed(false); setResultMaximized((maximized) => !maximized); }} aria-label={resultMaximized ? "Restore query output overlay" : "Maximize query output"} title={resultMaximized ? "Restore overlay" : "Maximize output"} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="expand" size={15} className={resultMaximized ? "rotate-45" : ""} /></button>
                    <button type="button" onClick={() => setResult(undefined)} disabled={running} aria-label="Close query output" title={running ? "Cancel the query before closing output" : "Close output"} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-35"><Icon name="x" size={15} /></button>
                  </div>
                </div>

                {!resultCollapsed && <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
                  {running && <div className="grid h-full min-h-32 place-items-center text-center"><div><span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand)]/25 border-t-[var(--brand)]" /><p className="mt-3 text-xs font-semibold text-[var(--brand)]">Running query…</p><p className="mt-1 text-[10px] text-[var(--ink-subtle)]">The output will appear in this pane.</p></div></div>}

                  {!running && resultTab === "results" && <>{tabular ? <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--ink-muted)]">{tabular.rows.length} rows{tabular.truncated ? "+" : ""} returned in {result?.durationMs}ms</p><div className="flex items-center gap-2"><button onClick={() => downloadCsv(tabular, defaultWidgetTitle(executedSql))} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--brand-soft)]">Export CSV</button>{saveState === "saved" ? <Link href={`/dashboard?connection=${encodeURIComponent(connectionId)}`} className="inline-flex min-h-9 items-center rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] px-3 text-xs font-semibold text-[var(--brand)]">✓ Added · Dashboard</Link> : <button onClick={() => setNamingWidget(true)} disabled={saveState === "saving"} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60">{saveState === "saving" ? "Adding…" : saveState === "failed" ? "Retry dashboard save" : "Add to dashboard"}</button>}</div></div>
                    {tabular.rows.length ? <ResultTable result={tabular} /> : <p className="rounded-lg border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--ink-muted)]">The query ran successfully but returned no rows.</p>}
                  </> : <div className="grid h-full min-h-32 place-items-center text-center"><div><p className="text-sm font-semibold">No result set</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Open Messages to review the query error.</p><button type="button" onClick={() => setResultTab("messages")} className="mt-3 min-h-9 rounded-lg bg-[var(--brand-soft)] px-3 text-xs font-semibold text-[var(--brand)]">View messages</button></div></div>}</>}

                  {!running && resultTab === "messages" && <div className={`rounded-xl border p-4 ${result?.error ? "border-red-200 bg-red-50 text-red-800" : "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]"}`} role="status">
                    <p className="text-sm font-semibold">{result?.error ? result.code === "QUERY_COST_WARNING" ? "Review query cost" : result.code === "QUERY_CANCELLED" ? "Query cancelled" : "Query could not run" : "Query completed successfully"}</p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5">{result?.error ? result.errorDetails?.join("\n") ?? `Message: ${result.error}` : `Completed in ${result?.durationMs ?? 0}ms with ${tabular?.rows.length ?? 0} rows.`}</pre>
                    {result?.code === "QUERY_COST_WARNING" && <button onClick={() => void run(executedSql, true)} disabled={running} className="mt-4 min-h-9 rounded-lg bg-[#a63d2f] px-4 text-xs font-semibold text-white hover:bg-[#8c3222] disabled:opacity-50">Run anyway</button>}
                  </div>}

                  {!running && resultTab === "details" && result && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--ink-subtle)]">Duration</p><p className="mt-2 text-xl font-semibold tabular-nums">{result.durationMs}ms</p></div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--ink-subtle)]">Rows</p><p className="mt-2 text-xl font-semibold tabular-nums">{tabular?.rows.length ?? 0}{tabular?.truncated ? "+" : ""}</p></div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--ink-subtle)]">Estimated rows</p><p className="mt-2 text-xl font-semibold tabular-nums">{result.estimate?.estimatedRows?.toLocaleString() ?? "—"}</p></div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--ink-subtle)]">Executed</p><p className="mt-2 text-sm font-semibold">{new Date(result.executedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p></div>
                    {!!result.estimate?.warnings?.length && <div className="rounded-xl border border-[#efcfaa] bg-[#fff8ee] p-4 text-[#8a581f] sm:col-span-2 xl:col-span-4"><p className="text-xs font-semibold">Planner warnings</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{result.estimate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                  </div>}
                </div>}
              </section>
              </div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[10px] text-[var(--ink-subtle)]"><span>Read-only SELECT statements only</span><span>⌘/Ctrl + S save · ⌘/Ctrl + Enter run selection</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
