import { and, desc, eq } from "drizzle-orm";

import { askLog, dataConnections } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY_ITEMS = 250;

export async function GET() {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });

  const entries = await getAppDb()
    .select({
      id: askLog.id,
      connectionId: askLog.connectionId,
      connectionName: dataConnections.name,
      question: askLog.question,
      kind: askLog.kind,
      sql: askLog.sql,
      ok: askLog.ok,
      error: askLog.error,
      durationMs: askLog.durationMs,
      createdAt: askLog.createdAt,
    })
    .from(askLog)
    .leftJoin(dataConnections, and(eq(dataConnections.id, askLog.connectionId), eq(dataConnections.organizationId, organizationId)))
    .where(eq(askLog.organizationId, organizationId))
    .orderBy(desc(askLog.createdAt))
    .limit(MAX_HISTORY_ITEMS);

  return Response.json(
    { entries, limit: MAX_HISTORY_ITEMS },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
