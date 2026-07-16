"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ConnectDatabase } from "./connect-database";
import { ConfirmDialog } from "./dialogs";
import { Icon } from "./icons";

type Connection = { id: string; name: string; engine: "postgresql" | "mysql"; database: string; host: string; port: number; ssl: boolean; status: string; schemaSyncedAt: string | null; healthCheckedAt: string | null; healthLatencyMs: number | null; readOnlyVerifiedAt: string | null; credentialsRotatedAt: string | null };

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
  const [checking, setChecking] = useState<Record<string, boolean>>({});

  useEffect(() => { fetch("/api/connections").then((r) => r.json()).then((d) => setConnections(d.connections ?? [])).catch(() => setConnections([])); }, []);

  async function sync(id: string) {
    setSyncing((s) => ({ ...s, [id]: true }));
    const response = await fetch(`/api/connections/${encodeURIComponent(id)}/schema?refresh=1`).catch(() => undefined);
    if (response?.ok) setConnections((current) => current?.map((c) => c.id === id ? { ...c, schemaSyncedAt: new Date().toISOString() } : c));
    setSyncing((s) => ({ ...s, [id]: false }));
  }

  async function checkHealth(id: string) {
    setChecking((state) => ({ ...state, [id]: true }));
    const response = await fetch(`/api/connections/${encodeURIComponent(id)}/health`, { method: "POST" }).catch(() => undefined);
    const data = await response?.json().catch(() => undefined) as { health?: { latencyMs: number; readOnlyVerified: boolean }; checkedAt?: string } | undefined;
    setConnections((current) => current?.map((connection) => connection.id === id ? {
      ...connection,
      status: response?.ok ? "connected" : "unreachable",
      healthCheckedAt: data?.checkedAt ?? new Date().toISOString(),
      healthLatencyMs: data?.health?.latencyMs ?? null,
      readOnlyVerifiedAt: data?.health ? data.health.readOnlyVerified ? new Date().toISOString() : null : connection.readOnlyVerifiedAt,
    } : connection));
    setChecking((state) => ({ ...state, [id]: false }));
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
    <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-5 py-10 text-center sm:px-12">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name="database" size={23} /></span>
      <p className="mt-4 text-lg font-semibold">Connect your first database</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">Start with PostgreSQL or MySQL. TalkSQL encrypts credentials and syncs schema metadata so you can ask useful questions right away.</p>
      <div className="mt-5 flex justify-center"><ConnectDatabase /></div>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {deleting && <ConfirmDialog title={`Delete “${deleting.name}”?`} body="Saved widgets using this connection will stop refreshing. Stored credentials are removed." onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />}
      {connections.map((connection) => (
        <section key={connection.id} className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-border)] hover:shadow-[var(--shadow-sm)]">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand)]">{connection.engine === "postgresql" ? "Pg" : "My"}</span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{connection.name}</h3>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-subtle)]">{connection.host} · {connection.database}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <span className={`h-2 w-2 rounded-full ${connection.status === "connected" ? "bg-[var(--success)]" : "bg-[#b57318]"}`} />
            {connection.status} · {connection.healthLatencyMs != null ? `${connection.healthLatencyMs}ms` : "health not checked"} · {syncedLabel(connection.schemaSyncedAt)}
          </p>
          {connection.readOnlyVerifiedAt && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[var(--success-strong)]"><Icon name="shield" size={14} />Read-only role verified</p>}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4 text-xs font-semibold">
            <Link href={`/ask?connection=${encodeURIComponent(connection.id)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-white hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="sparkles" size={14} />Ask data</Link>
            <Link href={`/schema?connection=${encodeURIComponent(connection.id)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--brand)] hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><Icon name="schema" size={14} />Schema</Link>
            <button onClick={() => sync(connection.id)} disabled={syncing[connection.id]} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] disabled:opacity-50"><Icon name="refresh" size={14} className={syncing[connection.id] ? "animate-spin" : ""} />{syncing[connection.id] ? "Syncing…" : "Sync"}</button>
            <button onClick={() => checkHealth(connection.id)} disabled={checking[connection.id]} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[var(--ink-muted)] hover:bg-[var(--brand-soft)] disabled:opacity-50"><Icon name="shield" size={14} />{checking[connection.id] ? "Checking…" : "Health"}</button>
            <ConnectDatabase edit={{ id: connection.id, engine: connection.engine, host: connection.host, port: connection.port, database: connection.database, ssl: connection.ssl }} />
            <button onClick={() => setDeleting(connection)} className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[#a63d2f] hover:bg-[#fff0ee]"><Icon name="trash" size={14} />Delete</button>
          </div>
        </section>
      ))}
    </div>
  );
}
