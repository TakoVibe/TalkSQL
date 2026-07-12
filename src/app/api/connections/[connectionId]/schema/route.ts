
import { getConnectionForOrganization } from "@/lib/connection-store";
import { getSchemaSnapshot } from "@/lib/schema-discovery";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/connections/[connectionId]/schema">) {
  try {
    const { connectionId } = await context.params;
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const organizationId = await getActiveOrganizationId();
    if (!organizationId) return Response.json({ error: "Sign in and select a workspace." }, { status: 401 });
    const connection = await getConnectionForOrganization(organizationId, connectionId);
    if (!connection) return Response.json({ error: "Connection not found." }, { status: 404 });
    return Response.json(await getSchemaSnapshot(connection, { refresh }));
  } catch { return Response.json({ error: "Schema discovery failed. Check database permissions and try again." }, { status: 422 }); }
}
