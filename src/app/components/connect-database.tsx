"use client";

import { FormEvent, useState } from "react";

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

  function close() {
    setOpen(false);
    setStatus("idle");
    setMessage("");
    setForm(startForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("testing");
    setMessage("");

    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: form.port || undefined }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Connection failed.");
      setStatus("verified");
      setMessage("Connection verified. Save it to your active workspace.");
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
      const result = (await response.json()) as { ok?: boolean; error?: string; connection?: { id: string } };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Connection could not be saved.");
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
        ? <button onClick={() => setOpen(true)} className="rounded-lg border border-[#cfd7d1] px-3 py-1.5 text-[#526059] hover:bg-[#f0f4f1]">Edit</button>
        : <button onClick={() => setOpen(true)} className="rounded-lg border border-[#cfd7d1] bg-white px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-[#f6f8f6]">+ Connect database</button>}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#17211c]/30 p-4" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="connect-title" className="text-xl font-semibold">{edit ? "Update connection" : "Connect a database"}</h2><p className="mt-1 text-sm text-[#66716b]">{edit ? "Re-enter the username and password to verify before saving. The cached schema will be re-synced." : "Credentials are used only to test this connection and are not stored yet."}</p></div>
              <button type="button" onClick={close} aria-label="Close" className="text-xl text-[#66716b] hover:text-[#17211c]">×</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Engine<select value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value as Engine })} className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2"><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option></select></label>
              <label className="text-sm font-medium">Port<input inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder={form.engine === "postgresql" ? "5432" : "3306"} className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium sm:col-span-2">Host<input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="db.example.com" className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium">Database<input required value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium">Username<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
              <label className="text-sm font-medium sm:col-span-2">Password<input required type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5 w-full rounded-lg border border-[#cfd7d1] px-3 py-2" /></label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-[#526059]"><input type="checkbox" checked={form.ssl} onChange={(e) => setForm({ ...form, ssl: e.target.checked })} /> Require TLS/SSL</label>
            {message && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${status === "verified" ? "bg-[#e6f1eb] text-[#205b43]" : "bg-[#fff0ee] text-[#a63d2f]"}`}>{message}</p>}
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm font-medium text-[#66716b] hover:bg-[#f0f2ef]">Cancel</button>{status === "verified" ? <button type="button" onClick={save} className="rounded-lg bg-[#205b43] px-4 py-2 text-sm font-medium text-white">Save connection</button> : <button disabled={status === "testing" || status === "saving"} className="rounded-lg bg-[#205b43] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{status === "testing" ? "Testing…" : "Test connection"}</button>}</div>
          </form>
        </div>
      )}
    </>
  );
}
