import { headers } from "next/headers";

import { getAccountActivationStats } from "@/lib/account-activity";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(email: string) {
  const allowlist = (process.env.TALKSQL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

/** Internal metrics only. Configure TALKSQL_ADMIN_EMAILS before exposing this in an admin UI. */
export async function GET() {
  const session = await getAuth().api.getSession({
    headers: new Headers(await headers()),
    query: { disableCookieCache: true },
  });

  if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isAdmin(session.user.email)) return Response.json({ error: "Not authorized." }, { status: 403 });

  return Response.json(await getAccountActivationStats());
}
