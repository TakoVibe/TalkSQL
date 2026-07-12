
import { getConnectionForOrganization } from "@/lib/connection-store";
import { executeReadOnlyQuery, looksReadOnlySelect } from "@/lib/query-runner";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";

type DatabaseError = Error & {
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  severity?: string;
  sqlMessage?: string;
  sqlState?: string;
  where?: string;
};

function errorResponse(error: unknown) {
  const databaseError = error as DatabaseError;
  const message = error instanceof Error ? error.message : "Query failed.";
  const details = [
    `Message: ${databaseError.sqlMessage ?? message}`,
    databaseError.severity && `Severity: ${databaseError.severity}`,
    (databaseError.code ?? databaseError.sqlState) && `Code: ${databaseError.code ?? databaseError.sqlState}`,
    databaseError.detail && `Detail: ${databaseError.detail}`,
    databaseError.hint && `Hint: ${databaseError.hint}`,
    databaseError.position && `Position: ${databaseError.position}`,
    databaseError.where && `Where: ${databaseError.where}`,
  ].filter((line): line is string => Boolean(line));

  return Response.json({ error: message, errorDetails: details }, { status: 422 });
}

export async function POST(request: Request) {
  try {
    const { connectionId, sql } = await request.json() as { connectionId?: string; sql?: string };
    if (!connectionId || !sql || !looksReadOnlySelect(sql)) {
      return Response.json({ error: "Only one read-only SELECT query is allowed." }, { status: 400 });
    }

    const organizationId = await getActiveOrganizationId();
    if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });

    const connection = await getConnectionForOrganization(organizationId, connectionId);
    if (!connection) return Response.json({ error: "Connection not found." }, { status: 404 });

    const startedAt = performance.now();
    const result = await executeReadOnlyQuery(connection, sql);
    return Response.json({
      ...result,
      durationMs: Math.round(performance.now() - startedAt),
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
