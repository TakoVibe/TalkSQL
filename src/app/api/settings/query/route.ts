import { ZodError } from "zod";

import { closeDatabasePools } from "@/lib/database-adapters";
import { listConnectionsForOrganization } from "@/lib/connection-store";
import { getWorkspaceQuerySettings, saveWorkspaceQuerySettings } from "@/lib/query-settings";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json({ settings: await getWorkspaceQuerySettings(organizationId) });
}

export async function PATCH(request: Request) {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const settings = await saveWorkspaceQuerySettings(organizationId, await request.json());
    const connections = await listConnectionsForOrganization(organizationId);
    for (const connection of connections) closeDatabasePools(connection.id);
    return Response.json({ ok: true, settings });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid query settings." }, { status: 400 });
    return Response.json({ error: "Settings could not be saved." }, { status: 500 });
  }
}
