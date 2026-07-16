
import { getConnectionForOrganization } from "@/lib/connection-store";
import { executeReadOnlyQuery, looksReadOnlySelect, serializeQueryError } from "@/lib/query-runner";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const serialized = serializeQueryError(error);
  return Response.json(serialized.body, { status: serialized.status });
}

export async function POST(request: Request) {
  try {
    const { connectionId, sql, allowExpensive } = await request.json() as { connectionId?: string; sql?: string; allowExpensive?: boolean };
    if (!connectionId || !sql || !looksReadOnlySelect(sql)) {
      return Response.json({ error: "Only one read-only SELECT query is allowed." }, { status: 400 });
    }

    const organizationId = await getActiveOrganizationId();
    if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });

    const connection = await getConnectionForOrganization(organizationId, connectionId);
    if (!connection) return Response.json({ error: "Connection not found." }, { status: 404 });

    const startedAt = performance.now();
    const result = await executeReadOnlyQuery(connection, sql, { signal: request.signal, allowExpensive: allowExpensive === true });
    return Response.json({
      ...result,
      durationMs: Math.round(performance.now() - startedAt),
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
