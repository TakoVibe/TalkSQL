import { randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";

import { dashboardWidgets, dataConnections } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { getConnectionForOrganization } from "@/lib/connection-store";
import { looksReadOnlySelect } from "@/lib/query-runner";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const widgetInput = z.object({
  connectionId: z.string().min(1),
  title: z.string().min(1).max(200),
  question: z.string().min(1).max(2000),
  kind: z.enum(["metric", "table", "chart", "schema_diagram"]),
  sql: z.string().max(10_000).nullish(),
  chartType: z.enum(["bar", "line", "area", "pie"]).nullish(),
  xColumn: z.string().max(200).nullish(),
  yColumn: z.string().max(200).nullish(),
  focusTables: z.array(z.string()).nullish(),
  lastResult: z.unknown().nullish(),
});

async function getOrganizationId() {
  return getActiveOrganizationId();
}

export async function GET() {
  const organizationId = await getOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const widgets = await getAppDb()
    .select({
      ...getTableColumns(dashboardWidgets),
      connectionName: dataConnections.name,
      connectionEngine: dataConnections.engine,
    })
    .from(dashboardWidgets)
    .leftJoin(dataConnections, and(
      eq(dataConnections.id, dashboardWidgets.connectionId),
      eq(dataConnections.organizationId, organizationId),
    ))
    .where(eq(dashboardWidgets.organizationId, organizationId))
    .orderBy(desc(dashboardWidgets.createdAt));
  return Response.json({ widgets });
}

export async function POST(request: Request) {
  const organizationId = await getOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = widgetInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid widget." }, { status: 400 });
  const input = parsed.data;
  if (!await getConnectionForOrganization(organizationId, input.connectionId)) return Response.json({ error: "Connection not found." }, { status: 404 });
  if (input.kind !== "schema_diagram" && (!input.sql || !looksReadOnlySelect(input.sql))) return Response.json({ error: "Widget SQL must be a single read-only SELECT." }, { status: 400 });
  const id = randomUUID();
  await getAppDb().insert(dashboardWidgets).values({
    id,
    organizationId,
    connectionId: input.connectionId,
    title: input.title,
    question: input.question,
    kind: input.kind,
    sql: input.sql ?? null,
    chartType: input.chartType ?? null,
    xColumn: input.xColumn ?? null,
    yColumn: input.yColumn ?? null,
    focusTables: input.focusTables ?? null,
    lastResult: input.lastResult ?? null,
    lastRefreshedAt: input.lastResult ? new Date() : null,
  });
  return Response.json({ ok: true, id }, { status: 201 });
}
