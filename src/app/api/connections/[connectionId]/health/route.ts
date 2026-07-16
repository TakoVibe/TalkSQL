import { DatabaseGuardrailError } from "@/lib/database-adapters";
import { getConnectionForOrganization, updateConnectionHealth } from "@/lib/connection-store";
import { testStoredConnection } from "@/lib/database";
import { getQueryPolicyForOrganization } from "@/lib/query-settings";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/connections/[connectionId]/health">) {
  const { connectionId } = await context.params;
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const connection = await getConnectionForOrganization(organizationId, connectionId);
  if (!connection) return Response.json({ error: "Connection not found." }, { status: 404 });

  try {
    const health = await testStoredConnection(connection, request.signal, await getQueryPolicyForOrganization(organizationId));
    await updateConnectionHealth(organizationId, connectionId, { status: "connected", latencyMs: health.latencyMs, readOnlyVerified: health.readOnlyVerified });
    return Response.json({ ok: true, health, checkedAt: new Date().toISOString() });
  } catch (error) {
    await updateConnectionHealth(organizationId, connectionId, { status: error instanceof DatabaseGuardrailError && error.code === "READ_ONLY_USER_REQUIRED" ? "unsafe" : "unreachable" });
    if (error instanceof DatabaseGuardrailError) {
      return Response.json({ ok: false, error: error.message, code: error.code, details: error.details, setupSql: error.setupSql }, { status: error.status });
    }
    return Response.json({ ok: false, error: "Health check failed. Verify the database is reachable and the credentials are current." }, { status: 422 });
  }
}
