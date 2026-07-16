import "server-only";

import { z } from "zod";

import { getDatabaseAdapter, type ConnectionHealth, type QueryPolicy } from "@/lib/database-adapters";
import { decryptConnectionCredentials } from "@/lib/connection-secrets";
import { QUERY_POLICY } from "@/lib/query-policy";

const connectionSchema = z.object({
  engine: z.enum(["postgresql", "mysql"]),
  host: z.string().trim().min(1, "Host is required").max(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().trim().min(1, "Database name is required").max(128),
  username: z.string().trim().min(1, "Username is required").max(128),
  password: z.string().max(1024),
  ssl: z.boolean().default(true),
});

export type ConnectionInput = z.infer<typeof connectionSchema>;

export function parseConnectionInput(input: unknown): ConnectionInput {
  return connectionSchema.parse(input);
}

/**
 * Tests credentials without retaining them. This is deliberately server-only:
 * passwords must never enter the client bundle or application logs.
 */
export async function testConnection(input: ConnectionInput, signal?: AbortSignal, policy: QueryPolicy = QUERY_POLICY): Promise<ConnectionHealth> {
  const port = input.port ?? (input.engine === "postgresql" ? 5432 : 3306);
  return getDatabaseAdapter(input.engine).testConnection(
    { engine: input.engine, host: input.host, port, database: input.database, ssl: input.ssl },
    { username: input.username, password: input.password },
    policy,
    signal,
  );
}

export async function testStoredConnection(connection: { engine: string; host: string; port: number; database: string; ssl: boolean; encryptedCredentials: string }, signal?: AbortSignal, policy: QueryPolicy = QUERY_POLICY): Promise<ConnectionHealth> {
  if (connection.engine !== "postgresql" && connection.engine !== "mysql") throw new Error("Unsupported database engine.");
  return getDatabaseAdapter(connection.engine).testConnection(
    { engine: connection.engine, host: connection.host, port: connection.port, database: connection.database, ssl: connection.ssl },
    decryptConnectionCredentials(connection.encryptedCredentials),
    policy,
    signal,
  );
}
