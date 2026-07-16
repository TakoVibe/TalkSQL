import { ZodError } from "zod";

import { DatabaseGuardrailError } from "@/lib/database-adapters";
import { deleteConnectionForOrganization, getConnectionForOrganization, updateConnectionForOrganization } from "@/lib/connection-store";
import { parseConnectionInput, testConnection } from "@/lib/database";
import { getQueryPolicyForOrganization } from "@/lib/query-settings";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/connections/[connectionId]">) {
  try {
    const { connectionId } = await context.params;
    const organizationId = await getActiveOrganizationId();
    if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (!await getConnectionForOrganization(organizationId, connectionId)) return Response.json({ error: "Connection not found." }, { status: 404 });
    const input = parseConnectionInput(await request.json());
    const health = await testConnection(input, request.signal, await getQueryPolicyForOrganization(organizationId));
    await updateConnectionForOrganization(organizationId, connectionId, input, health);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid connection details." }, { status: 400 });
    if (error instanceof DatabaseGuardrailError) return Response.json({ error: error.message, code: error.code, details: error.details, setupSql: error.setupSql }, { status: error.status });
    return Response.json({ error: "The connection could not be updated." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/connections/[connectionId]">) {
  const { connectionId } = await context.params;
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  await deleteConnectionForOrganization(organizationId, connectionId);
  return Response.json({ ok: true });
}
