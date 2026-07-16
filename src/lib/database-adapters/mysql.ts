import "server-only";

import type { EventEmitter } from "node:events";
import { createConnection, createPool, type Connection, type FieldPacket, type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

import {
  DatabaseGuardrailError,
  type AdapterQueryResult,
  type ConnectionHealth,
  type DatabaseAdapter,
  type DatabaseCredentials,
  type DatabaseTarget,
  type ExecuteOptions,
  type QueryEstimate,
  type QueryPolicy,
} from "./types";
import { poolFingerprint, poolKey } from "./pool-identity";

function config(target: DatabaseTarget, credentials: DatabaseCredentials, policy: QueryPolicy) {
  return {
    host: target.host,
    port: target.port,
    database: target.database,
    user: credentials.username,
    password: credentials.password,
    ssl: target.ssl ? { rejectUnauthorized: true } : undefined,
    connectTimeout: policy.connectionTimeoutMs,
  };
}

type MySqlPoolEntry = { fingerprint: string; pool: Pool };
const poolState = globalThis as typeof globalThis & { __talksqlMysqlPools?: Map<string, MySqlPoolEntry> };
const pools = poolState.__talksqlMysqlPools ??= new Map<string, MySqlPoolEntry>();

function getPool(target: DatabaseTarget, credentials: DatabaseCredentials, policy: QueryPolicy) {
  const key = poolKey(target, credentials);
  const fingerprint = poolFingerprint(target, credentials, policy);
  const existing = pools.get(key);
  if (existing?.fingerprint === fingerprint) return existing.pool;
  if (existing) {
    pools.delete(key);
    void existing.pool.end().catch(() => undefined);
  }
  const pool = createPool({
    ...config(target, credentials, policy),
    waitForConnections: true,
    connectionLimit: policy.maxConcurrentPerDatabase,
    maxIdle: policy.maxConcurrentPerDatabase,
    idleTimeout: policy.poolIdleTimeoutMs,
    queueLimit: policy.maxConcurrentPerDatabase * 4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    resetOnRelease: true,
  });
  (pool as unknown as EventEmitter).on("error", () => undefined);
  pools.set(key, { fingerprint, pool });
  return pool;
}

function setupSql(target: DatabaseTarget) {
  const database = target.database.replaceAll("`", "``");
  return `-- Run as a database administrator, restrict the host, and use a strong password.\nCREATE USER 'talksql_reader'@'%' IDENTIFIED BY '<strong-password>' REQUIRE SSL;\nGRANT SELECT, SHOW VIEW ON \`${database}\`.* TO 'talksql_reader'@'%';\nALTER USER 'talksql_reader'@'%' WITH MAX_USER_CONNECTIONS 3;`;
}

function assertTls(target: DatabaseTarget, policy: QueryPolicy) {
  if (policy.requireTls && !target.ssl) throw new DatabaseGuardrailError("TLS/SSL is required by workspace settings.", { code: "TLS_REQUIRED", status: 403 });
}

function cancelled(signal: AbortSignal) {
  return new DatabaseGuardrailError(signal.reason instanceof Error ? signal.reason.message : "Query cancelled.", {
    code: signal.reason instanceof DOMException && signal.reason.name === "TimeoutError" ? "QUERY_TIMEOUT" : "QUERY_CANCELLED",
    status: 408,
  });
}

function attachCancellation(connection: Connection | PoolConnection, signal: AbortSignal) {
  let destroyed = false;
  const onAbort = () => {
    destroyed = true;
    connection.destroy();
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return { detach: () => signal.removeEventListener("abort", onAbort), destroyed: () => destroyed };
}

function walkPlan(value: unknown, state: { rows: number; cost: number; scans: string[] }) {
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  for (const key of ["rows_examined_per_scan", "rows_produced_per_join"]) {
    const rows = Number(node[key] ?? 0);
    if (Number.isFinite(rows)) state.rows = Math.max(state.rows, rows);
  }
  const costInfo = node.cost_info as Record<string, unknown> | undefined;
  const cost = Number(costInfo?.query_cost ?? costInfo?.prefix_cost ?? 0);
  if (Number.isFinite(cost)) state.cost = Math.max(state.cost, cost);
  if (node.access_type === "ALL" && node.table_name) state.scans.push(String(node.table_name));
  for (const child of Object.values(node)) if (child && typeof child === "object") walkPlan(child, state);
}

function parseEstimate(value: unknown, policy: QueryPolicy): QueryEstimate {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const state = { rows: 0, cost: 0, scans: [] as string[] };
    walkPlan(parsed, state);
    const warnings: string[] = [];
    if (state.rows >= policy.warnEstimatedRows) warnings.push(`MySQL estimates that this query may examine ${state.rows.toLocaleString()} rows.`);
    if (state.cost >= policy.warnEstimatedCost) warnings.push("MySQL reports a high optimizer cost for this query.");
    if (state.scans.length && state.rows >= policy.warnEstimatedRows / 10) warnings.push(`Full scan detected on ${[...new Set(state.scans)].join(", ")}.`);
    return { available: true, estimatedRows: state.rows, estimatedCost: state.cost, fullScans: [...new Set(state.scans)], warnings, requiresConfirmation: warnings.length > 0 };
  } catch {
    return { available: false, fullScans: [], warnings: [], requiresConfirmation: false };
  }
}

const FORBIDDEN_GRANTS = /\b(ALL PRIVILEGES|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INDEX|TRIGGER|EXECUTE|FILE|PROCESS|SUPER|RELOAD|SHUTDOWN|GRANT OPTION|CREATE USER|SYSTEM_USER|CONNECTION_ADMIN)\b/i;

export const mysqlAdapter: DatabaseAdapter = {
  engine: "mysql",

  closePool(connectionId) {
    const existing = pools.get(connectionId);
    if (!existing) return;
    pools.delete(connectionId);
    void existing.pool.end().catch(() => undefined);
  },

  async testConnection(target, credentials, policy, signal): Promise<ConnectionHealth> {
    assertTls(target, policy);
    const startedAt = performance.now();
    const connection = await createConnection(config(target, credentials, policy));
    const cancellation = signal ? attachCancellation(connection, signal) : undefined;
    try {
      if (signal?.aborted) throw cancelled(signal);
      const [identityRows] = await connection.query("SELECT CURRENT_USER() AS currentUser");
      const currentUser = String((identityRows as RowDataPacket[])[0]?.currentUser ?? credentials.username);
      const [grantRows] = await connection.query("SHOW GRANTS FOR CURRENT_USER");
      const grants = (grantRows as RowDataPacket[]).flatMap((row) => Object.values(row).map(String));
      const unsafe = grants.filter((grant) => FORBIDDEN_GRANTS.test(grant));
      if (unsafe.length && policy.enforceReadOnlyRole) {
        throw new DatabaseGuardrailError("TalkSQL requires a dedicated read-only MySQL user.", {
          code: "READ_ONLY_USER_REQUIRED",
          status: 403,
          details: ["The account has write, administrative, or privilege-delegation access."],
          setupSql: setupSql(target),
        });
      }
      return { ok: true, engine: "mysql", currentUser, latencyMs: Math.round(performance.now() - startedAt), readOnlyVerified: unsafe.length === 0, warnings: unsafe.length ? ["Read-only role enforcement is disabled.", "The account has write, administrative, or privilege-delegation access."] : [] };
    } catch (error) {
      if (signal?.aborted) throw cancelled(signal);
      throw error;
    } finally {
      cancellation?.detach();
      await connection.end().catch(() => undefined);
    }
  },

  async execute(target, credentials, sql, policy, options: ExecuteOptions): Promise<AdapterQueryResult> {
    assertTls(target, policy);
    const pool = getPool(target, credentials, policy);
    let connection: PoolConnection | undefined;
    let cancellation: ReturnType<typeof attachCancellation> | undefined;
    let reusable = true;
    const wrapped = `SELECT * FROM (${sql}) AS talksql_result LIMIT ${policy.maxRows + 1}`;
    try {
      connection = await pool.getConnection();
      if (options.signal.aborted) {
        reusable = false;
        throw cancelled(options.signal);
      }
      cancellation = attachCancellation(connection, options.signal);
      await connection.query(`SET SESSION max_execution_time = ${policy.explainTimeoutMs}`);
      await connection.query("START TRANSACTION READ ONLY");
      let estimate: QueryEstimate = { available: false, fullScans: [], warnings: [], requiresConfirmation: false };
      if (policy.enableCostWarnings) {
        try {
          const [planRows] = await connection.query(`EXPLAIN FORMAT=JSON ${sql}`);
          const first = (planRows as RowDataPacket[])[0];
          estimate = parseEstimate(first ? Object.values(first)[0] : undefined, policy);
        } catch (error) {
          if (options.signal.aborted) throw error;
        }
      }
      if (estimate.requiresConfirmation && !options.allowExpensive) {
        throw new DatabaseGuardrailError("This query may be expensive. Review the estimate before running it.", { code: "QUERY_COST_WARNING", status: 409, details: estimate.warnings, estimate });
      }
      await connection.query(`SET SESSION max_execution_time = ${policy.statementTimeoutMs}`);
      const [rows, fields] = await connection.query(wrapped) as [RowDataPacket[], FieldPacket[]];
      return { columns: fields.map((field) => field.name), rows: rows.slice(0, policy.maxRows) as Record<string, unknown>[], truncated: rows.length > policy.maxRows, estimate };
    } catch (error) {
      if (options.signal.aborted) {
        reusable = false;
        throw cancelled(options.signal);
      }
      throw error;
    } finally {
      cancellation?.detach();
      if (connection) {
        if (cancellation?.destroyed()) reusable = false;
        if (reusable) {
          try {
            await connection.rollback();
          } catch {
            reusable = false;
          }
        }
        if (reusable) connection.release();
        else if (!cancellation?.destroyed()) connection.destroy();
      }
    }
  },
};
