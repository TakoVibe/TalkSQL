"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Icon } from "./icons";

type Settings = {
  enforceReadOnlyRole: boolean;
  requireTls: boolean;
  enableCostWarnings: boolean;
  statementTimeoutMs: number;
  queueTimeoutMs: number;
  maxRows: number;
  maxConcurrent: number;
  warnEstimatedRows: number;
};

const RECOMMENDED: Settings = {
  enforceReadOnlyRole: true,
  requireTls: true,
  enableCostWarnings: true,
  statementTimeoutMs: 15_000,
  queueTimeoutMs: 5_000,
  maxRows: 100,
  maxConcurrent: 3,
  warnEstimatedRows: 1_000_000,
};

function Toggle({ id, checked, title, description, onChange, danger }: { id: string; checked: boolean; title: string; description: string; onChange: (checked: boolean) => void; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-[var(--border)] py-4 last:border-0">
      <div className="min-w-0">
        <label id={`${id}-label`} htmlFor={id} className="text-sm font-semibold text-[var(--foreground)]">{title}</label>
        <p id={`${id}-description`} className="mt-1 max-w-2xl text-xs leading-5 text-[var(--ink-muted)]">{description}</p>
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`} onClick={() => onChange(!checked)} className={`relative mt-1 h-7 w-12 shrink-0 rounded-full border p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 ${checked ? "border-[var(--brand)] bg-[var(--brand)]" : danger ? "border-[#c77b6f] bg-[#f3d5d0]" : "border-[var(--border-strong)] bg-[var(--surface-2)]"}`}>
        <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function NumberSetting({ id, label, description, value, min, max, step = 1, suffix, onChange }: { id: string; label: string; description: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label htmlFor={id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <span className="block text-sm font-semibold">{label}</span>
      <span id={`${id}-description`} className="mt-1 block min-h-10 text-xs leading-5 text-[var(--ink-muted)]">{description}</span>
      <span className="mt-3 flex items-center overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
        <input id={id} type="number" required min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-describedby={`${id}-description`} className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none" />
        {suffix && <span className="border-l border-[var(--border)] px-3 text-xs font-medium text-[var(--ink-muted)]">{suffix}</span>}
      </span>
    </label>
  );
}

export function QuerySettingsForm() {
  const [settings, setSettings] = useState<Settings>();
  const [saved, setSaved] = useState<Settings>();
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const dirty = useMemo(() => Boolean(settings && saved && JSON.stringify(settings) !== JSON.stringify(saved)), [saved, settings]);

  useEffect(() => {
    fetch("/api/settings/query", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Settings could not be loaded.");
      setSettings(data.settings); setSaved(data.settings); setState("idle");
    }).catch((error: unknown) => { setState("error"); setMessage(error instanceof Error ? error.message : "Settings could not be loaded."); });
  }, []);

  async function persist(next: Settings, successMessage: string) {
    setSettings(next); setState("saving"); setMessage("Saving workspace settings…");
    try {
      const response = await fetch("/api/settings/query", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Settings could not be saved.");
      setSettings(data.settings); setSaved(data.settings); setState("saved"); setMessage(successMessage);
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    }
  }

  function saveToggle(key: "enforceReadOnlyRole" | "requireTls" | "enableCostWarnings", value: boolean) {
    if (!settings) return;
    void persist({ ...settings, [key]: value }, "Safety setting saved. New queries use it immediately.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    await persist(settings, "Query settings saved. New queries use them immediately.");
  }

  if (!settings) return <div aria-busy="true" aria-label="Loading query settings" className="space-y-4"><div className="skeleton h-8 w-52" /><div className="skeleton h-40 w-full rounded-2xl" /><div className="skeleton h-72 w-full rounded-2xl" />{message && <p role="alert" className="text-sm text-[#a63d2f]">{message}</p>}</div>;

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">Workspace controls</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Query settings</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">Control how TalkSQL protects and executes queries for this workspace. Changes apply to SQL, Ask, history, and dashboards.</p></div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand)]"><Icon name="shield" size={15} />SELECT-only mode always active</span>
      </div>

      {!settings.enforceReadOnlyRole && <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-[#e5b8b1] bg-[#fff0ee] p-4 text-[#8c3222]"><Icon name="shield" size={20} className="mt-0.5 shrink-0" /><div><p className="text-sm font-semibold">Read-only user verification is disabled</p><p className="mt-1 text-xs leading-5">TalkSQL will allow a connection even if its database account has write privileges. SQL filtering and read-only transactions remain enforced, but a dedicated reader account is still strongly recommended.</p></div></div>}

      <fieldset className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 shadow-[var(--shadow-xs)] sm:px-6">
        <legend className="px-2 text-base font-semibold">Safety checks</legend>
        <p className="px-1 pt-2 text-xs text-[var(--ink-muted)]">Safety switches save immediately.</p>
        <Toggle id="read-only-role" checked={settings.enforceReadOnlyRole} title="Require a verified read-only database user" description="Block queries until the selected PostgreSQL or MySQL account passes the privilege audit. Disable this to use an existing broader account." danger={!settings.enforceReadOnlyRole} onChange={(value) => saveToggle("enforceReadOnlyRole", value)} />
        <Toggle id="require-tls" checked={settings.requireTls} title="Require TLS/SSL connections" description="Reject saved connections that do not encrypt traffic between TalkSQL and the customer database." onChange={(value) => saveToggle("requireTls", value)} />
        <Toggle id="cost-warnings" checked={settings.enableCostWarnings} title="Analyze query cost before execution" description="Use EXPLAIN to detect large scans and require confirmation for potentially expensive SQL." onChange={(value) => saveToggle("enableCostWarnings", value)} />
      </fieldset>

      <fieldset className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] sm:p-6">
        <legend className="px-2 text-base font-semibold">Execution limits</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberSetting id="statement-timeout" label="Query timeout" description="Maximum execution time for one database statement." value={settings.statementTimeoutMs / 1_000} min={1} max={120} suffix="seconds" onChange={(value) => setSettings({ ...settings, statementTimeoutMs: value * 1_000 })} />
          <NumberSetting id="queue-timeout" label="Queue timeout" description="How long a query may wait when all pool slots are busy." value={settings.queueTimeoutMs / 1_000} min={1} max={30} suffix="seconds" onChange={(value) => setSettings({ ...settings, queueTimeoutMs: value * 1_000 })} />
          <NumberSetting id="max-rows" label="Preview row limit" description="Maximum rows returned to interactive result views." value={settings.maxRows} min={10} max={1_000} step={10} suffix="rows" onChange={(maxRows) => setSettings({ ...settings, maxRows })} />
          <NumberSetting id="max-concurrent" label="Concurrent queries" description="Maximum pooled queries running against the database." value={settings.maxConcurrent} min={1} max={10} suffix="queries" onChange={(maxConcurrent) => setSettings({ ...settings, maxConcurrent })} />
          <NumberSetting id="warn-rows" label="Cost warning threshold" description="Warn when the optimizer expects to process at least this many rows." value={settings.warnEstimatedRows} min={1_000} max={100_000_000} step={1_000} suffix="rows" onChange={(warnEstimatedRows) => setSettings({ ...settings, warnEstimatedRows })} />
        </div>
      </fieldset>

      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-3 shadow-[var(--shadow-md)] backdrop-blur-xl">
        <div aria-live="polite" className={`min-h-5 text-sm ${state === "error" ? "text-[#a63d2f]" : "text-[var(--ink-muted)]"}`}>{message || (dirty ? "You have unsaved changes." : "Settings are up to date.")}</div>
        <div className="flex gap-2"><button type="button" onClick={() => { setSettings({ ...RECOMMENDED }); setState("idle"); setMessage("Recommended defaults restored locally. Save to apply them."); }} className="min-h-11 rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Restore defaults</button><button type="submit" disabled={!dirty || state === "saving"} className="min-h-11 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50">{state === "saving" ? "Saving…" : "Save settings"}</button></div>
      </div>
    </form>
  );
}
