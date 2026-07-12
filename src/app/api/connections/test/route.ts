import { ZodError } from "zod";

import { parseConnectionInput, testConnection } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const connection = parseConnectionInput(await request.json());
    await testConnection(connection);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid connection details." },
        { status: 400 },
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
