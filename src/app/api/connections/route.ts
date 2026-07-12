import { ZodError } from "zod";

import { listConnectionsForOrganization, saveConnection } from "@/lib/connection-store";
import { parseConnectionInput, testConnection } from "@/lib/database";
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
    await testConnection(input);
    const saved = await saveConnection(organizationId, input);
    return Response.json({ ok: true, connection: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.issues[0]?.message ?? "Invalid connection details." }, { status: 400 });
    }
    return Response.json({ error: "The connection could not be saved." }, { status: 500 });
  }
}
