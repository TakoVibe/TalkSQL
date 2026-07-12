import "server-only";

import { createConnection } from "mysql2/promise";
import { Client } from "pg";
import { eq } from "drizzle-orm";

import { dataConnections } from "@/db/schema";
import { getAppDb } from "@/lib/app-db";
import { decryptConnectionCredentials } from "@/lib/connection-secrets";

type StoredConnection = { id: string; engine: string; host: string; port: number; database: string; ssl: boolean; encryptedCredentials: string; schemaSnapshot?: unknown; schemaSyncedAt?: Date | null };

const SNAPSHOT_TTL_MS = 60 * 60 * 1000;

export async function getSchemaSnapshot(connection: StoredConnection, options?: { refresh?: boolean }): Promise<SchemaSnapshot> {
  const fresh = connection.schemaSyncedAt && Date.now() - connection.schemaSyncedAt.getTime() < SNAPSHOT_TTL_MS;
  if (connection.schemaSnapshot && fresh && !options?.refresh) return connection.schemaSnapshot as SchemaSnapshot;
  const snapshot = await discoverSchema(connection);
  await getAppDb().update(dataConnections).set({ schemaSnapshot: snapshot, schemaSyncedAt: new Date() }).where(eq(dataConnections.id, connection.id));
  return snapshot;
}
export type SchemaSnapshot = { tables: Array<{ schema: string; name: string }>; columns: Array<{ schema: string; table: string; name: string; type: string; nullable: boolean }>; relationships: Array<{ fromSchema: string; fromTable: string; fromColumn: string; toSchema: string; toTable: string; toColumn: string }> };

export async function discoverSchema(connection: StoredConnection): Promise<SchemaSnapshot> {
  const credentials = decryptConnectionCredentials(connection.encryptedCredentials);
  if (connection.engine === "postgresql") {
    const client = new Client({ host: connection.host, port: connection.port, database: connection.database, user: credentials.username, password: credentials.password, ssl: connection.ssl ? { rejectUnauthorized: true } : false, connectionTimeoutMillis: 8_000, query_timeout: 12_000 });
    try {
      await client.connect();
      const [tables, columns, relationships] = await Promise.all([
        client.query("SELECT table_schema AS schema, table_name AS name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name LIMIT 200"),
        client.query("SELECT table_schema AS schema, table_name AS table, column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name, ordinal_position LIMIT 2000"),
        client.query("SELECT tc.table_schema AS \"fromSchema\", tc.table_name AS \"fromTable\", kcu.column_name AS \"fromColumn\", ccu.table_schema AS \"toSchema\", ccu.table_name AS \"toTable\", ccu.column_name AS \"toColumn\" FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' ORDER BY tc.table_schema, tc.table_name LIMIT 500"),
      ]);
      return { tables: tables.rows as SchemaSnapshot["tables"], columns: columns.rows as SchemaSnapshot["columns"], relationships: relationships.rows as SchemaSnapshot["relationships"] };
    } finally { await client.end().catch(() => undefined); }
  }
  if (connection.engine === "mysql") {
    const client = await createConnection({ host: connection.host, port: connection.port, database: connection.database, user: credentials.username, password: credentials.password, ssl: connection.ssl ? { rejectUnauthorized: true } : undefined, connectTimeout: 8_000 });
    try {
      const [tables] = await client.query("SELECT table_schema AS `schema`, table_name AS name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema = DATABASE() ORDER BY table_name LIMIT 200");
      const [columns] = await client.query("SELECT table_schema AS `schema`, table_name AS `table`, column_name AS name, column_type AS type, is_nullable = 'YES' AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position LIMIT 2000");
      const [relationships] = await client.query("SELECT table_schema AS fromSchema, table_name AS fromTable, column_name AS fromColumn, referenced_table_schema AS toSchema, referenced_table_name AS toTable, referenced_column_name AS toColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL ORDER BY table_name LIMIT 500");
      return { tables: tables as SchemaSnapshot["tables"], columns: columns as SchemaSnapshot["columns"], relationships: relationships as SchemaSnapshot["relationships"] };
    } finally { await client.end().catch(() => undefined); }
  }
  throw new Error("Unsupported database engine.");
}
