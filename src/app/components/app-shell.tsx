"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AccountMenu } from "./account-menu";
import { ConnectDatabase } from "./connect-database";
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
        <Link href="/auth" className="mt-5 inline-block w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand-strong)]">Sign in or create account</Link>
      </div>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Database", icon: "⛁" },
  { href: "/schema", label: "Schema", icon: "⌘" },
  { href: "/ask", label: "Ask data", icon: "✦" },
  { href: "/sql", label: "SQL Editor", icon: "›_" },
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
];

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
    <select value={selected} onChange={(e) => router.replace(`${pathname}?connection=${encodeURIComponent(e.target.value)}`)} className="max-w-44 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-sm text-[var(--ink-muted)]" aria-label="Active connection">
      {!selected && <option value="">Connection…</option>}
      {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
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
    return <Link key={item.href} href={withConnection(item.href)} title={item.label} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-[var(--brand-soft)] font-medium text-[var(--brand)]" : "text-[var(--ink-muted)] hover:bg-[#f0f2ef]"}`}>
      <span className="w-4 text-center">{item.icon}</span>{!collapsed && item.label}
    </Link>;
  });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AuthGate />
      <aside className={`fixed inset-y-0 z-20 hidden flex-col border-r border-[var(--border)] bg-[#fcfcfa] px-3 py-5 lg:flex ${collapsed ? "w-16" : "w-60"}`}>
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <Logo size={32} />
          {!collapsed && <span className="text-lg font-semibold tracking-tight">TalkSQL</span>}
        </Link>
        <nav className="mt-10 space-y-1">{navItems}</nav>
        <button onClick={() => setCollapsed(!collapsed)} className="mt-auto rounded-lg px-3 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[#f0f2ef]" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "»" : "« Collapse"}</button>
      </aside>

      <div className={collapsed ? "lg:pl-16" : "lg:pl-60"}>
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            <div className="flex items-center gap-2.5">
              <ConnectionPicker />
              <ThemeToggle />
              <ConnectDatabase />
              <AccountMenu />
            </div>
          </div>
          <nav className="mt-2 flex gap-1 overflow-x-auto lg:hidden">{NAV.map((item) => <Link key={item.href} href={withConnection(item.href)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${pathname === item.href ? "bg-[var(--brand-soft)] font-medium text-[var(--brand)]" : "text-[var(--ink-muted)]"}`}>{item.label}</Link>)}</nav>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
