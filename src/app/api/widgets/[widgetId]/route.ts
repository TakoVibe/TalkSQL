import { and, eq } from "drizzle-orm";

import { dashboardWidgets } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { getConnectionForOrganization } from "@/lib/connection-store";
import { executeReadOnlyQuery, looksReadOnlySelect } from "@/lib/query-runner";
import { getSchemaSnapshot } from "@/lib/schema-discovery";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_REFRESH_MS = 30_000;

async function getOrganizationId() {
  return getActiveOrganizationId();
}

async function getWidget(organizationId: string, widgetId: string) {
  const [widget] = await getAppDb().select().from(dashboardWidgets).where(and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.organizationId, organizationId))).limit(1);
  return widget ?? null;
}

/** Refresh: re-runs the pinned SQL (no LLM call) or re-snapshots the schema for diagrams. */
export async function POST(_request: Request, context: RouteContext<"/api/widgets/[widgetId]">) {
  const { widgetId } = await context.params;
  const organizationId = await getOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const widget = await getWidget(organizationId, widgetId);
  if (!widget) return Response.json({ error: "Widget not found." }, { status: 404 });
  if (widget.lastRefreshedAt && Date.now() - widget.lastRefreshedAt.getTime() < MIN_REFRESH_MS) {
    return Response.json({ ok: true, lastResult: widget.lastResult, lastRefreshedAt: widget.lastRefreshedAt, cached: true });
  }
  const connection = await getConnectionForOrganization(organizationId, widget.connectionId);
  if (!connection) return Response.json({ error: "Connection not found." }, { status: 404 });
  try {
    let lastResult: unknown;
    if (widget.kind === "schema_diagram") {
      lastResult = { schema: await getSchemaSnapshot(connection) };
    } else {
      if (!widget.sql || !looksReadOnlySelect(widget.sql)) return Response.json({ error: "Widget SQL is not a safe read-only SELECT." }, { status: 400 });
      lastResult = await executeReadOnlyQuery(connection, widget.sql);
    }
    const lastRefreshedAt = new Date();
    await getAppDb().update(dashboardWidgets).set({ lastResult, lastRefreshedAt }).where(eq(dashboardWidgets.id, widget.id));
    return Response.json({ ok: true, lastResult, lastRefreshedAt });
  } catch (error) {
    // Stale-but-usable beats empty: keep the last good snapshot and report the failure.
    return Response.json({ error: error instanceof Error ? error.message : "Refresh failed.", lastResult: widget.lastResult, lastRefreshedAt: widget.lastRefreshedAt }, { status: 422 });
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/widgets/[widgetId]">) {
  const { widgetId } = await context.params;
  const organizationId = await getOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { title } = await request.json() as { title?: string };
  if (!title?.trim() || title.length > 200) return Response.json({ error: "Title must be 1–200 characters." }, { status: 400 });
  await getAppDb().update(dashboardWidgets).set({ title: title.trim() }).where(and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.organizationId, organizationId)));
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/widgets/[widgetId]">) {
  const { widgetId } = await context.params;
  const organizationId = await getOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  await getAppDb().delete(dashboardWidgets).where(and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.organizationId, organizationId)));
  return Response.json({ ok: true });
}
