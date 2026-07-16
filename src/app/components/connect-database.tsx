"use client";

import { FormEvent, useState } from "react";

import { Icon } from "./icons";

type Engine = "postgresql" | "mysql";

const initialForm = {
  engine: "postgresql" as Engine,
  host: "",
  port: "",
  database: "",
  username: "",
  password: "",
  ssl: true,
};

export type ConnectionEdit = { id: string; engine: Engine; host: string; port: number; database: string; ssl: boolean };

export function ConnectDatabase({ edit }: { edit?: ConnectionEdit }) {
  const [open, setOpen] = useState(false);
  const startForm = edit ? { engine: edit.engine, host: edit.host, port: String(edit.port), database: edit.database, username: "", password: "", ssl: edit.ssl } : initialForm;
  const [form, setForm] = useState(startForm);
  const [status, setStatus] = useState<"idle" | "testing" | "verified" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [setupSql, setSetupSql] = useState("");

  function close() {
    setOpen(false);
    setStatus("idle");
    setMessage("");
    setSetupSql("");
    setForm(startForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("testing");
    setMessage("");
    setSetupSql("");

    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: form.port || undefined }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string; details?: string[]; setupSql?: string; health?: { latencyMs: number; currentUser: string; readOnlyVerified: boolean; warnings: string[] } };
      if (!response.ok || !result.ok) {
        setSetupSql(result.setupSql ?? "");
        throw new Error(result.error ?? "Connection failed.");
      }
      setStatus("verified");
      setMessage(result.health?.readOnlyVerified
        ? `Connection and read-only access verified for ${result.health.currentUser} in ${result.health.latencyMs}ms. Save it to your active workspace.`
        : `Connection verified${result.health ? ` for ${result.health.currentUser} in ${result.health.latencyMs}ms` : ""}. Read-only role enforcement is disabled in workspace settings.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Connection failed.");
    }
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(edit ? `/api/connections/${encodeURIComponent(edit.id)}` : "/api/connections", {
        method: edit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: form.port || undefined }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; setupSql?: string; connection?: { id: string } };
      if (!response.ok || !result.ok) {
        setSetupSql(result.setupSql ?? "");
        throw new Error(result.error ?? "Connection could not be saved.");
      }
      if (edit) { window.location.reload(); return; }
      if (!result.connection) throw new Error("Connection could not be saved.");
      window.location.assign(`/schema?connection=${encodeURIComponent(result.connection.id)}`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Connection could not be saved.");
    }
  }

  return (
    <>
      {edit
        ? <button onClick={() => setOpen(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="edit" size={14} />Edit</button>
        : <button onClick={() => setOpen(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold shadow-[var(--shadow-xs)] hover:border-[var(--brand-border)] hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="plus" size={17} />Connect database</button>}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#17211c]/30 p-4" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="connect-title" className="text-xl font-semibold">{edit ? "Update connection" : "Connect a database"}</h2><p className="mt-1 text-sm text-[#66716b]">{edit ? "Re-enter the username and password to verify before saving. The cached schema will be re-synced." : "Credentials are used only to test this connection and are not stored yet."}</p></div>
              <button type="button" onClick={close} aria-label="Close connection dialog" className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="x" /></button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Engine<select value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value as Engine })} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2"><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option></select></label>
              <label className="text-sm font-medium">Port<input inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder={form.engine === "postgresql" ? "5432" : "3306"} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium sm:col-span-2">Host<input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="db.example.com" className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium">Database<input required value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium">Username<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium sm:col-span-2">Password<input required type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-[#526059]"><input type="checkbox" checked={form.ssl} onChange={(e) => setForm({ ...form, ssl: e.target.checked })} /> Require TLS/SSL</label>
            {message && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${status === "verified" ? "bg-[#e6f1eb] text-[#205b43]" : "bg-[#fff0ee] text-[#a63d2f]"}`}>{message}</p>}
            {setupSql && <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66716b]">DBA setup SQL</p><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-[#17211c] p-3 text-xs leading-5 text-white"><code>{setupSql}</code></pre></div>}
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={close} className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-[#66716b] hover:bg-[#f0f2ef]">Cancel</button>{status === "verified" ? <button type="button" onClick={save} className="min-h-11 rounded-lg bg-[#205b43] px-4 py-2 text-sm font-medium text-white">Save connection</button> : <button disabled={status === "testing" || status === "saving"} className="min-h-11 rounded-lg bg-[#205b43] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{status === "testing" ? "Testing…" : "Test connection"}</button>}</div>
          </form>
        </div>
      )}
    </>
  );
}
