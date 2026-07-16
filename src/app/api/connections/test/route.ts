import { ZodError } from "zod";

import { DatabaseGuardrailError } from "@/lib/database-adapters";
import { parseConnectionInput, testConnection } from "@/lib/database";
import { getQueryPolicyForOrganization } from "@/lib/query-settings";
import { getActiveOrganizationId } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const connection = parseConnectionInput(await request.json());
    const health = await testConnection(connection, request.signal, await getQueryPolicyForOrganization(await getActiveOrganizationId()));
    return Response.json({ ok: true, health });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid connection details." },
        { status: 400 },
      );
    }

    if (error instanceof DatabaseGuardrailError) {
      return Response.json(
        { ok: false, error: error.message, code: error.code, details: error.details, setupSql: error.setupSql },
        { status: error.status },
      );
    }

    // Database driver errors can contain hostnames or vendor details. Keep the
    // response safe to display while retaining no credential material.
    return Response.json(
      { ok: false, error: "Could not connect. Check the details and network access, then try again." },
      { status: 422 },
    );
  }
}
