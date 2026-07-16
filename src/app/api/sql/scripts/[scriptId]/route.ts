import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { sqlScripts } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { isUniqueViolation, normalizeScriptName, scriptContentSchema, scriptNameSchema } from "@/lib/sql-scripts";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateScriptInput = z.object({
  name: scriptNameSchema.optional(),
  content: scriptContentSchema.optional(),
}).refine((input) => input.name !== undefined || input.content !== undefined, "Nothing to update.");

async function getScript(organizationId: string, scriptId: string) {
  const [script] = await getAppDb().select().from(sqlScripts).where(and(
    eq(sqlScripts.id, scriptId),
    eq(sqlScripts.organizationId, organizationId),
  )).limit(1);
  return script ?? null;
}

export async function GET(_request: Request, context: RouteContext<"/api/sql/scripts/[scriptId]">) {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { scriptId } = await context.params;
  const script = await getScript(organizationId, scriptId);
  if (!script) return Response.json({ error: "Script not found." }, { status: 404 });
  return Response.json({ script }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: RouteContext<"/api/sql/scripts/[scriptId]">) {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = updateScriptInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid script." }, { status: 400 });
  const { scriptId } = await context.params;

  try {
    const [script] = await getAppDb().update(sqlScripts).set({
      ...(parsed.data.name === undefined ? {} : { name: normalizeScriptName(parsed.data.name) }),
      ...(parsed.data.content === undefined ? {} : { content: parsed.data.content }),
      updatedAt: new Date(),
    }).where(and(
      eq(sqlScripts.id, scriptId),
      eq(sqlScripts.organizationId, organizationId),
    )).returning();
    if (!script) return Response.json({ error: "Script not found." }, { status: 404 });
    return Response.json({ script });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "A script with this name already exists for this database." }, { status: 409 });
    return Response.json({ error: "The script could not be updated." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/sql/scripts/[scriptId]">) {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { scriptId } = await context.params;
  const [deleted] = await getAppDb().delete(sqlScripts).where(and(
    eq(sqlScripts.id, scriptId),
    eq(sqlScripts.organizationId, organizationId),
  )).returning({ id: sqlScripts.id });
  if (!deleted) return Response.json({ error: "Script not found." }, { status: 404 });
  return Response.json({ ok: true });
}
