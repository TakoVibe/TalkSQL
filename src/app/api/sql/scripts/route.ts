import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { sqlScripts } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { getConnectionForOrganization } from "@/lib/connection-store";
import { isUniqueViolation, normalizeScriptName, scriptContentSchema, scriptNameSchema } from "@/lib/sql-scripts";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createScriptInput = z.object({
  connectionId: z.string().min(1),
  name: scriptNameSchema,
  content: scriptContentSchema,
});

export async function GET(request: Request) {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return Response.json({ error: "Choose a database first." }, { status: 400 });
  if (!await getConnectionForOrganization(organizationId, connectionId)) return Response.json({ error: "Connection not found." }, { status: 404 });

  const scripts = await getAppDb().select({
    id: sqlScripts.id,
    connectionId: sqlScripts.connectionId,
    name: sqlScripts.name,
    createdAt: sqlScripts.createdAt,
    updatedAt: sqlScripts.updatedAt,
  }).from(sqlScripts).where(and(
    eq(sqlScripts.organizationId, organizationId),
    eq(sqlScripts.connectionId, connectionId),
  )).orderBy(desc(sqlScripts.updatedAt)).limit(200);

  return Response.json({ scripts }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = createScriptInput.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid script." }, { status: 400 });
  if (!await getConnectionForOrganization(organizationId, parsed.data.connectionId)) return Response.json({ error: "Connection not found." }, { status: 404 });

  try {
    const [script] = await getAppDb().insert(sqlScripts).values({
      id: randomUUID(),
      organizationId,
      connectionId: parsed.data.connectionId,
      name: normalizeScriptName(parsed.data.name),
      content: parsed.data.content,
    }).returning();
    return Response.json({ script }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "A script with this name already exists for this database." }, { status: 409 });
    return Response.json({ error: "The script could not be saved." }, { status: 500 });
  }
}
