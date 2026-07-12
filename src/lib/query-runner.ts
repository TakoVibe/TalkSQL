import "server-only";

import { createConnection } from "mysql2/promise";
import { Client } from "pg";
import type { FieldPacket, RowDataPacket } from "mysql2/promise";

import { decryptConnectionCredentials } from "@/lib/connection-secrets";

type StoredConnection = { engine: string; host: string; port: number; database: string; ssl: boolean; encryptedCredentials: string };
export type QueryResult = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean };

export const MAX_ROWS = 100;
const STATEMENT_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_PER_DATABASE = 3;

/**
 * Bounded concurrency per target database (the Grafana/Metabase pattern): clients may
 * request freely; this semaphore is the real throttle. Excess queries wait their turn.
 * ponytail: in-memory, per-instance — swap for pgbouncer/connection-pool limits when multi-node.
 */
const gates = new Map<string, { active: number; waiters: (() => void)[] }>();
async function withQuerySlot<T>(key: string, run: () => Promise<T>): Promise<T> {
  const gate = gates.get(key) ?? { active: 0, waiters: [] };
  gates.set(key, gate);
  if (gate.active >= MAX_CONCURRENT_PER_DATABASE) await new Promise<void>((resolve) => gate.waiters.push(resolve));
  gate.active++;
  try {
    return await run();
  } finally {
    gate.active--;
    gate.waiters.shift()?.();
    if (!gate.active && !gate.waiters.length) gates.delete(key);
  }
}

/** Cheap first filter only — real enforcement is the READ ONLY transaction below. */
export function looksReadOnlySelect(sql: string) {
  return /^(?:with\b[\s\S]+\bselect\b|select\b)/i.test(sql.trim()) && !/;\s*\S/.test(sql) && !/\b(insert|update|delete|drop|alter|create|grant|copy)\b/i.test(sql);
}

/** Read-only is enforced by the database (READ ONLY transaction), not by SQL inspection. */
export async function executeReadOnlyQuery(connection: StoredConnection, sql: string): Promise<QueryResult> {
  return withQuerySlot(`${connection.host}:${connection.port}/${connection.database}`, () => runQuery(connection, sql));
}

async function runQuery(connection: StoredConnection, sql: string): Promise<QueryResult> {
  const credentials = decryptConnectionCredentials(connection.encryptedCredentials);
  const wrapped = `SELECT * FROM (${sql.trim().replace(/;+\s*$/, "")}) AS talksql_result LIMIT ${MAX_ROWS + 1}`;

  if (connection.engine === "postgresql") {
    const client = new Client({ host: connection.host, port: connection.port, database: connection.database, user: credentials.username, password: credentials.password, ssl: connection.ssl ? { rejectUnauthorized: true } : false, connectionTimeoutMillis: 8_000, query_timeout: STATEMENT_TIMEOUT_MS + 2_000 });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const result = await client.query(wrapped);
      return { columns: result.fields.map((field) => field.name), rows: result.rows.slice(0, MAX_ROWS) as Record<string, unknown>[], truncated: result.rows.length > MAX_ROWS };
    } finally { await client.end().catch(() => undefined); }
  }

  if (connection.engine === "mysql") {
    const client = await createConnection({ host: connection.host, port: connection.port, database: connection.database, user: credentials.username, password: credentials.password, ssl: connection.ssl ? { rejectUnauthorized: true } : undefined, connectTimeout: 8_000 });
    try {
      await client.query(`SET SESSION max_execution_time = ${STATEMENT_TIMEOUT_MS}`);
      await client.query("START TRANSACTION READ ONLY");
      const [rows, fields] = await client.query(wrapped) as [RowDataPacket[], FieldPacket[]];
      return { columns: fields.map((field) => field.name), rows: rows.slice(0, MAX_ROWS) as Record<string, unknown>[], truncated: rows.length > MAX_ROWS };
    } finally { await client.end().catch(() => undefined); }
  }

  throw new Error("Unsupported database engine.");
}
