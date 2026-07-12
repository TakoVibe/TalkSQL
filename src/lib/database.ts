import "server-only";

import { createConnection } from "mysql2/promise";
import { Client } from "pg";
import { z } from "zod";

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
export async function testConnection(input: ConnectionInput): Promise<void> {
  if (input.engine === "postgresql") {
    const client = new Client({
      host: input.host,
      port: input.port ?? 5432,
      database: input.database,
      user: input.username,
      password: input.password,
      ssl: input.ssl ? { rejectUnauthorized: true } : false,
      connectionTimeoutMillis: 8_000,
      query_timeout: 8_000,
    });

    try {
      await client.connect();
      await client.query("SELECT 1");
    } finally {
      await client.end().catch(() => undefined);
    }
    return;
  }

  const connection = await createConnection({
    host: input.host,
    port: input.port ?? 3306,
    database: input.database,
    user: input.username,
    password: input.password,
    ssl: input.ssl ? { rejectUnauthorized: true } : undefined,
    connectTimeout: 8_000,
  });

  try {
    await connection.query("SELECT 1");
  } finally {
    await connection.end().catch(() => undefined);
  }
}
