"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AccountMenu } from "./account-menu";
import { ConnectDatabase } from "./connect-database";
import { Icon, type IconName } from "./icons";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { authClient } from "@/lib/auth-client";

function AuthGate() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending || session?.user) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#17211c]/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
        <span className="mx-auto inline-block"><Logo size={44} /></span>
        <h2 id="auth-gate-title" className="mt-4 text-xl font-semibold tracking-tight">Sign in to TalkSQL</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">You need a signed-in workspace to connect databases, explore schemas, and ask questions about your data.</p>
        <Link href="/auth" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]">Sign in or create account</Link>
      </div>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/ask", label: "Ask your data", icon: "sparkles" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/sql", label: "SQL editor", icon: "terminal" },
  { href: "/schema", label: "Schema", icon: "schema" },
  { href: "/dashboard", label: "Dashboards", icon: "dashboard" },
  { href: "/settings", label: "Settings", icon: "settings" },
] satisfies { href: string; label: string; icon: IconName }[];

function ConnectionPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("connection") ?? "";
  const [connections, setConnections] = useState<{ id: string; name: string; engine: string }[]>([]);
  useEffect(() => { fetch("/api/connections").then((r) => r.json()).then((d) => setConnections(d.connections ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (!selected && connections.length) router.replace(`${pathname}?connection=${encodeURIComponent(connections[0].id)}`); }, [selected, connections, pathname, router]);
  if (!connections.length) return null;
  return (
    <label className="relative min-w-0">
      <span className="sr-only">Active database</span>
      <select value={selected} onChange={(e) => router.replace(`${pathname}?connection=${encodeURIComponent(e.target.value)}`)} className="min-h-11 w-full max-w-48 cursor-pointer appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-8 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-xs)] outline-none hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label="Active database">
      {!selected && <option value="">Connection…</option>}
      {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Icon name="database" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)]" />
      <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--ink-subtle)]"><path d="m2.5 4 3.5 3.5L9.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </label>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const connection = searchParams.get("connection");
  const [collapsed, setCollapsed] = useState(false);
  const withConnection = (href: string) => connection ? `${href}?connection=${encodeURIComponent(connection)}` : href;
  const title = NAV.find((item) => item.href === pathname)?.label ?? "TalkSQL";

  const navItems = NAV.map((item) => {
    const active = pathname === item.href;
    return <Link key={item.href} href={withConnection(item.href)} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"}`}>
      <Icon name={item.icon} size={19} className="shrink-0" />{!collapsed && item.label}
    </Link>;
  });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <a href="#main-content" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] focus:translate-y-0">Skip to main content</a>
      <AuthGate />
      <aside className={`fixed inset-y-0 z-20 hidden flex-col border-r border-[var(--border)] bg-[var(--surface)] px-3 py-5 transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px]" : "w-[248px]"}`}>
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label="TalkSQL overview">
          <Logo size={34} />
          {!collapsed && <span className="text-[17px] font-semibold tracking-[-0.03em]">TalkSQL</span>}
        </Link>
        {!collapsed && <div className="mx-2 mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"><p className="truncate text-xs font-semibold">My workspace</p><p className="mt-0.5 text-[11px] text-[var(--ink-subtle)]">Private analytics space</p></div>}
        <nav className="mt-7 space-y-1" aria-label="Primary navigation">{navItems}</nav>
        {!collapsed && <div className="mx-2 mt-auto mb-3 flex gap-2.5 rounded-xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]"><Icon name="shield" size={18} className="mt-0.5 shrink-0" /><p className="text-[11px] leading-4"><strong className="block text-xs">Read-only by design</strong>Your source data stays in your database.</p></div>}
        <button onClick={() => setCollapsed(!collapsed)} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[var(--ink-muted)] outline-none hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
          <Icon name="panel-left" size={19} />{!collapsed && "Collapse sidebar"}
        </button>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]"}`}>
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/" className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden" aria-label="TalkSQL overview"><Logo size={32} /></Link>
                <div className="min-w-0"><p className="hidden text-[11px] font-medium text-[var(--ink-subtle)] sm:block">Workspace</p><h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1></div>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="hidden min-w-0 sm:block"><ConnectionPicker /></div>
                <div className="hidden md:block"><ThemeToggle /></div>
                <div className="hidden xl:block"><ConnectDatabase /></div>
                <AccountMenu />
              </div>
            </div>
            <div className="mt-2 sm:hidden"><ConnectionPicker /></div>
          </div>
          <nav className="mx-auto mt-2 flex max-w-[1440px] gap-1 overflow-x-auto pb-0.5 lg:hidden" aria-label="Mobile navigation">{NAV.map((item) => {
            const active = pathname === item.href;
            return <Link key={item.href} href={withConnection(item.href)} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"}`}><Icon name={item.icon} size={15} />{item.label}</Link>;
          })}</nav>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-5 outline-none sm:px-6 sm:py-7 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
