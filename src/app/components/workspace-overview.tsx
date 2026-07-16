"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ConnectionCards } from "./connection-cards";
import { Icon, type IconName } from "./icons";

type ConnectionSummary = {
  id: string;
  status: string;
  schemaSyncedAt: string | null;
};

type WidgetSummary = { id: string };

type OverviewData = {
  connections: ConnectionSummary[];
  widgets: WidgetSummary[];
};

const steps: { title: string; description: string; href: string; icon: IconName }[] = [
  { title: "Connect a source", description: "Add PostgreSQL or MySQL with encrypted credentials.", href: "#connections", icon: "database" },
  { title: "Ask a business question", description: "Turn plain language into inspectable, read-only SQL.", href: "/ask", icon: "sparkles" },
  { title: "Build a live view", description: "Save useful answers as refreshable dashboard widgets.", href: "/dashboard", icon: "dashboard" },
];

function LoadingMetric() {
  return <div className="skeleton h-9 w-16" />;
}

export function WorkspaceOverview() {
  const [data, setData] = useState<OverviewData>();

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/connections").then((response) => response.ok ? response.json() : { connections: [] }),
      fetch("/api/widgets").then((response) => response.ok ? response.json() : { widgets: [] }),
    ]).then(([connectionData, widgetData]) => {
      if (active) setData({ connections: connectionData.connections ?? [], widgets: widgetData.widgets ?? [] });
    }).catch(() => {
      if (active) setData({ connections: [], widgets: [] });
    });
    return () => { active = false; };
  }, []);

  const connectedCount = data?.connections.filter((connection) => connection.status === "connected").length ?? 0;
  const syncedCount = data?.connections.filter((connection) => Boolean(connection.schemaSyncedAt)).length ?? 0;
  const firstConnection = data?.connections[0]?.id;
  const hasConnections = Boolean(data?.connections.length);
  const connectionQuery = firstConnection ? `?connection=${encodeURIComponent(firstConnection)}` : "";
  const completedSteps = useMemo(() => [
    Boolean(data?.connections.length),
    Boolean(data?.connections.length),
    Boolean(data?.widgets.length),
  ], [data]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)] px-5 py-7 shadow-[var(--shadow-sm)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[var(--brand-soft)] blur-3xl" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_430px] xl:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Your data workspace
            </div>
            <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl lg:text-[44px] lg:leading-[1.08]">
              Go from database to decision, without the back-and-forth.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-muted)]">
              Ask questions in plain language, verify the generated SQL, and turn the answers your team relies on into living dashboards.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={hasConnections ? `/ask${connectionQuery}` : "#connections"} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2">
                <Icon name={hasConnections ? "sparkles" : "database"} size={18} /> {hasConnections ? "Ask your data" : "Connect your first database"} <Icon name="arrow-right" size={17} />
              </Link>
              <Link href={hasConnections ? `/sql${connectionQuery}` : "#workflow"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--brand-border)] hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2">
                <Icon name={hasConnections ? "terminal" : "arrow-right"} size={18} /> {hasConnections ? "Open SQL editor" : "See how it works"}
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
            <div className="border-r border-[var(--border)] p-4 sm:p-5">
              <dt className="text-xs font-medium leading-4 text-[var(--ink-subtle)]">Connected sources</dt>
              <dd className="mt-3 text-2xl font-semibold tabular-nums">{data ? connectedCount : <LoadingMetric />}</dd>
            </div>
            <div className="border-r border-[var(--border)] p-4 sm:p-5">
              <dt className="text-xs font-medium leading-4 text-[var(--ink-subtle)]">Schemas ready</dt>
              <dd className="mt-3 text-2xl font-semibold tabular-nums">{data ? syncedCount : <LoadingMetric />}</dd>
            </div>
            <div className="p-4 sm:p-5">
              <dt className="text-xs font-medium leading-4 text-[var(--ink-subtle)]">Saved insights</dt>
              <dd className="mt-3 text-2xl font-semibold tabular-nums">{data ? data.widgets.length : <LoadingMetric />}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="workflow" aria-labelledby="start-title" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">Your workflow</p>
            <h2 id="start-title" className="mt-1.5 text-xl font-semibold tracking-tight">Three steps from question to shared answer</h2>
          </div>
          <p className="text-sm text-[var(--ink-muted)]">Built to keep the SQL visible and the workflow accountable.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {steps.map((step, index) => {
            const done = completedSteps[index];
            const href = index > 0 ? `${step.href}${connectionQuery}` : step.href;
            return (
              <Link key={step.title} href={href} className="group relative min-h-44 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] hover:-translate-y-0.5 hover:border-[var(--brand-border)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name={step.icon} /></span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${done ? "bg-[var(--success-soft)] text-[var(--success-strong)]" : "bg-[var(--surface-2)] text-[var(--ink-subtle)]"}`}>
                    {done && <Icon name="check" size={13} />} {done ? "Ready" : `Step ${index + 1}`}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--ink-muted)]">{step.description}</p>
                <Icon name="arrow-right" size={18} className="absolute bottom-5 right-5 text-[var(--ink-subtle)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--brand)]" />
              </Link>
            );
          })}
        </div>
      </section>

      <section id="connections" aria-labelledby="connections-title" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">Data sources</p>
            <h2 id="connections-title" className="mt-1.5 text-xl font-semibold tracking-tight">Connected databases</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--ink-muted)]">Schema metadata is synced for context. Query results stay transient unless you explicitly save a dashboard snapshot.</p>
        </div>
        <ConnectionCards />
      </section>

      <section className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 md:grid-cols-[1fr_1fr_1fr] md:p-6" aria-labelledby="trust-title">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">Trust by design</p>
          <h2 id="trust-title" className="mt-2 text-lg font-semibold">Your database stays yours.</h2>
        </div>
        <div className="flex gap-3">
          <span className="mt-0.5 text-[var(--brand)]"><Icon name="lock" /></span>
          <div><h3 className="text-sm font-semibold">Encrypted credentials</h3><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Connection secrets are encrypted before they are stored.</p></div>
        </div>
        <div className="flex gap-3">
          <span className="mt-0.5 text-[var(--brand)]"><Icon name="shield" /></span>
          <div><h3 className="text-sm font-semibold">Read-only analysis</h3><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Generated and saved queries are restricted to a single read-only SELECT.</p></div>
        </div>
      </section>
    </div>
  );
}
