"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ConnectDatabase } from "./connect-database";
import { ConfirmDialog } from "./dialogs";

type Connection = { id: string; name: string; engine: "postgresql" | "mysql"; database: string; host: string; port: number; ssl: boolean; status: string; schemaSyncedAt: string | null };

function syncedLabel(iso: string | null) {
  if (!iso) return "schema not synced yet";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "synced just now";
  if (minutes < 60) return `synced ${minutes}m ago`;
  if (minutes < 1440) return `synced ${Math.round(minutes / 60)}h ago`;
  return `synced ${Math.round(minutes / 1440)}d ago`;
}

export function ConnectionCards() {
  const [connections, setConnections] = useState<Connection[]>();
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  useEffect(() => { fetch("/api/connections").then((r) => r.json()).then((d) => setConnections(d.connections ?? [])).catch(() => setConnections([])); }, []);

  async function sync(id: string) {
    setSyncing((s) => ({ ...s, [id]: true }));
    const response = await fetch(`/api/connections/${encodeURIComponent(id)}/schema?refresh=1`).catch(() => undefined);
    if (response?.ok) setConnections((current) => current?.map((c) => c.id === id ? { ...c, schemaSyncedAt: new Date().toISOString() } : c));
    setSyncing((s) => ({ ...s, [id]: false }));
  }

  const [deleting, setDeleting] = useState<Connection | null>(null);

  async function remove(connection: Connection) {
    const response = await fetch(`/api/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" }).catch(() => undefined);
    if (response?.ok) setConnections((current) => current?.filter((c) => c.id !== connection.id));
  }

  if (!connections) return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading connections">
      {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-start gap-3"><div className="skeleton h-10 w-10 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-3 w-full" /></div></div>
        <div className="skeleton mt-4 h-3 w-1/2" />
        <div className="mt-4 flex gap-2 border-t border-[#edf0ed] pt-4"><div className="skeleton h-7 w-24" /><div className="skeleton h-7 w-14" /><div className="skeleton h-7 w-14" /></div>
      </div>)}
    </div>
  );
  if (!connections.length) return (
    <div className="rounded-2xl border border-dashed border-[#cfd7d1] bg-white p-12 text-center">
      <p className="text-lg font-semibold">Connect your first database</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-muted)]">Add a PostgreSQL or MySQL connection with the “+ Connect database” button above. Credentials are encrypted before storage.</p>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {deleting && <ConfirmDialog title={`Delete “${deleting.name}”?`} body="Saved widgets using this connection will stop refreshing. Stored credentials are removed." onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />}
      {connections.map((connection) => (
        <section key={connection.id} className="flex flex-col rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand)]">{connection.engine === "postgresql" ? "Pg" : "My"}</span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{connection.name}</h2>
              <p className="truncate text-xs text-[#8b948e]">{connection.host} · {connection.database}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <span className={`h-2 w-2 rounded-full ${connection.status === "connected" ? "bg-[#2d9b65]" : "bg-[#d99a2b]"}`} />
            {connection.status} · {syncedLabel(connection.schemaSyncedAt)}
          </p>
          <div className="mt-4 flex gap-2 border-t border-[#edf0ed] pt-4 text-xs font-medium">
            <Link href={`/schema?connection=${encodeURIComponent(connection.id)}`} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-white hover:bg-[var(--brand-strong)]">Open schema</Link>
            <Link href={`/ask?connection=${encodeURIComponent(connection.id)}`} className="rounded-lg border border-[#cfd7d1] px-3 py-1.5 text-[var(--brand)] hover:bg-[#f0f4f1]">Ask</Link>
            <button onClick={() => sync(connection.id)} disabled={syncing[connection.id]} className="rounded-lg border border-[#cfd7d1] px-3 py-1.5 text-[var(--ink-muted)] hover:bg-[#f0f4f1] disabled:opacity-50">{syncing[connection.id] ? "Syncing…" : "Sync"}</button>
            <ConnectDatabase edit={{ id: connection.id, engine: connection.engine, host: connection.host, port: connection.port, database: connection.database, ssl: connection.ssl }} />
            <button onClick={() => setDeleting(connection)} className="ml-auto rounded-lg border border-[#dfe4df] px-3 py-1.5 text-[#a63d2f] hover:bg-[#fff0ee]">Delete</button>
          </div>
        </section>
      ))}
    </div>
  );
}
