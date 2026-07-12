import "server-only";

import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

/**
 * Returns the signed-in user's active workspace id, auto-provisioning a personal
 * workspace on first use so new accounts are never stuck without one.
 */
export async function getActiveOrganizationId(): Promise<string | null> {
  const auth = getAuth();
  const requestHeaders = new Headers(await headers());
  const session = await auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
  if (!session?.user) return null;
  const active = (session.session as { activeOrganizationId?: string }).activeOrganizationId;
  if (active) return active;

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders }).catch(() => []);
  let organizationId: string | null = organizations[0]?.id ?? null;
  if (!organizationId) {
    const created = await auth.api.createOrganization({
      body: { name: `${session.user.name?.trim() || "My"} workspace`, slug: `ws-${session.user.id.slice(0, 12).toLowerCase()}` },
      headers: requestHeaders,
    }).catch(() => null);
    organizationId = created?.id ?? null;
  }
  if (!organizationId) return null;
  await auth.api.setActiveOrganization({ body: { organizationId }, headers: requestHeaders }).catch(() => undefined);
  return organizationId;
}
