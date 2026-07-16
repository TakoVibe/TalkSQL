"use client";

import Link from "next/link";

import { authClient } from "@/lib/auth-client";

export function AccountMenu() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <span className="text-sm text-[#66716b]">Loading…</span>;
  if (!session?.user) return <Link href="/auth" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold shadow-[var(--shadow-xs)] hover:bg-[var(--surface-2)]">Sign in</Link>;
  return <button onClick={async () => { await authClient.signOut(); window.location.assign("/"); }} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold shadow-[var(--shadow-xs)] hover:bg-[var(--surface-2)]">Sign out</button>;
}
