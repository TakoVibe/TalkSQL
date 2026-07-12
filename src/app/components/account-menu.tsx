"use client";

import Link from "next/link";

import { authClient } from "@/lib/auth-client";

export function AccountMenu() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <span className="text-sm text-[#66716b]">Loading…</span>;
  if (!session?.user) return <Link href="/auth" className="rounded-lg border border-[#cfd7d1] bg-white px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-[#f6f8f6]">Sign in</Link>;
  return <button onClick={async () => { await authClient.signOut(); window.location.assign("/"); }} className="rounded-lg border border-[#cfd7d1] bg-white px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-[#f6f8f6]">Sign out</button>;
}
