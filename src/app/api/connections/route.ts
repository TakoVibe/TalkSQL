import { ZodError } from "zod";

import { DatabaseGuardrailError } from "@/lib/database-adapters";
import { listConnectionsForOrganization, saveConnection } from "@/lib/connection-store";
import { parseConnectionInput, testConnection } from "@/lib/database";
import { getQueryPolicyForOrganization } from "@/lib/query-settings";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in and select a workspace." }, { status: 401 });
  return Response.json({ connections: await listConnectionsForOrganization(organizationId) });
}

export async function POST(request: Request) {
  try {
    const organizationId = await getActiveOrganizationId();
    if (!organizationId) {
      return Response.json({ error: "Sign in and select a workspace before saving a connection." }, { status: 401 });
    }

    const input = parseConnectionInput(await request.json());
    const health = await testConnection(input, request.signal, await getQueryPolicyForOrganization(organizationId));
    const saved = await saveConnection(organizationId, input, health);
    return Response.json({ ok: true, connection: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.issues[0]?.message ?? "Invalid connection details." }, { status: 400 });
    }
    if (error instanceof DatabaseGuardrailError) {
      return Response.json({ error: error.message, code: error.code, details: error.details, setupSql: error.setupSql }, { status: error.status });
    }
    return Response.json({ error: "The connection could not be saved." }, { status: 500 });
  }
}
