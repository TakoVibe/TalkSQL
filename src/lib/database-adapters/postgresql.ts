import "server-only";

import { Client, Pool, type PoolClient } from "pg";

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
    ssl: target.ssl ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: policy.connectionTimeoutMs,
    query_timeout: policy.statementTimeoutMs + 2_000,
    application_name: "talksql",
  } as const;
}

type PostgreSqlPoolEntry = { fingerprint: string; pool: Pool };
const poolState = globalThis as typeof globalThis & { __talksqlPostgresqlPools?: Map<string, PostgreSqlPoolEntry> };
const pools = poolState.__talksqlPostgresqlPools ??= new Map<string, PostgreSqlPoolEntry>();

function getPool(target: DatabaseTarget, credentials: DatabaseCredentials, policy: QueryPolicy) {
  const key = poolKey(target, credentials);
  const fingerprint = poolFingerprint(target, credentials, policy);
  const existing = pools.get(key);
  if (existing?.fingerprint === fingerprint && !existing.pool.ending && !existing.pool.ended) return existing.pool;
  if (existing) {
    pools.delete(key);
    void existing.pool.end().catch(() => undefined);
  }
  const pool = new Pool({
    ...config(target, credentials, policy),
    max: policy.maxConcurrentPerDatabase,
    min: 1,
    idleTimeoutMillis: policy.poolIdleTimeoutMs,
    maxLifetimeSeconds: policy.poolMaxLifetimeSeconds,
    allowExitOnIdle: true,
  });
  // Pool errors can otherwise become uncaught EventEmitter errors while idle.
  pool.on("error", () => undefined);
  pools.set(key, { fingerprint, pool });
  return pool;
}

function setupSql(target: DatabaseTarget) {
  return `-- Run as a database administrator, then connect TalkSQL with this role.\nCREATE ROLE talksql_reader LOGIN PASSWORD '<strong-password>';\nGRANT CONNECT ON DATABASE "${target.database.replaceAll('"', '""')}" TO talksql_reader;\nGRANT USAGE ON SCHEMA public TO talksql_reader;\nGRANT SELECT ON ALL TABLES IN SCHEMA public TO talksql_reader;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO talksql_reader;\nALTER ROLE talksql_reader SET default_transaction_read_only = on;`;
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

function attachCancellation(client: Client | PoolClient, signal: AbortSignal) {
  let destroyed = false;
  const onAbort = () => {
    destroyed = true;
    // Discard only this checked-out client. The pool creates a replacement later,
    // and no elevated pg_cancel_backend privilege is required.
    const connection = (client as unknown as { connection?: { stream?: { destroy: (error?: Error) => void } } }).connection;
    connection?.stream?.destroy(new Error("Query cancelled by TalkSQL."));
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return { detach: () => signal.removeEventListener("abort", onAbort), destroyed: () => destroyed };
}

function walkPlan(node: Record<string, unknown>, state: { rows: number; scans: string[] }) {
  const rows = Number(node["Plan Rows"] ?? 0);
  if (Number.isFinite(rows)) state.rows = Math.max(state.rows, rows);
  if (node["Node Type"] === "Seq Scan" && rows > 0) state.scans.push(String(node["Relation Name"] ?? "unknown relation"));
  const plans = Array.isArray(node.Plans) ? node.Plans : [];
  for (const child of plans) if (child && typeof child === "object") walkPlan(child as Record<string, unknown>, state);
}

function parseEstimate(value: unknown, policy: QueryPolicy): QueryEstimate {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const root = Array.isArray(parsed) ? parsed[0]?.Plan : undefined;
    if (!root || typeof root !== "object") throw new Error("Missing plan");
    const state = { rows: 0, scans: [] as string[] };
    walkPlan(root as Record<string, unknown>, state);
    const estimatedCost = Number((root as Record<string, unknown>)["Total Cost"] ?? 0);
    const warnings: string[] = [];
    if (state.rows >= policy.warnEstimatedRows) warnings.push(`PostgreSQL estimates that this query may process ${state.rows.toLocaleString()} rows.`);
    if (estimatedCost >= policy.warnEstimatedCost) warnings.push("PostgreSQL reports a high planner cost for this query.");
    if (state.scans.length && state.rows >= policy.warnEstimatedRows / 10) warnings.push(`Full scan detected on ${[...new Set(state.scans)].join(", ")}.`);
    return { available: true, estimatedRows: state.rows, estimatedCost, fullScans: [...new Set(state.scans)], warnings, requiresConfirmation: warnings.length > 0 };
  } catch {
    return { available: false, fullScans: [], warnings: [], requiresConfirmation: false };
  }
}

export const postgresqlAdapter: DatabaseAdapter = {
  engine: "postgresql",

  closePool(connectionId) {
    const existing = pools.get(connectionId);
    if (!existing) return;
    pools.delete(connectionId);
    void existing.pool.end().catch(() => undefined);
  },

  async testConnection(target, credentials, policy, signal): Promise<ConnectionHealth> {
    assertTls(target, policy);
    const client = new Client(config(target, credentials, policy));
    const startedAt = performance.now();
    const cancellation = signal ? attachCancellation(client, signal) : undefined;
    try {
      await client.connect();
      if (signal?.aborted) throw cancelled(signal);
      const result = await client.query(`
        SELECT current_user AS "currentUser",
          COALESCE((SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS "isPrivileged",
          EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_catalog = current_database()
              AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
              AND (
                has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'INSERT') OR
                has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'UPDATE') OR
                has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'DELETE') OR
                has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'TRUNCATE') OR
                has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'TRIGGER')
              )
          ) AS "hasTableWrites",
          EXISTS (
            SELECT 1 FROM pg_namespace
            WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
              AND has_schema_privilege(current_user, oid, 'CREATE')
          ) AS "hasSchemaCreate"
      `);
      const audit = result.rows[0] as { currentUser: string; isPrivileged: boolean; hasTableWrites: boolean; hasSchemaCreate: boolean };
      const issues = [
        audit.isPrivileged && "The role has administrative PostgreSQL privileges.",
        audit.hasTableWrites && "The role can modify one or more tables.",
        audit.hasSchemaCreate && "The role can create objects in a database schema.",
      ].filter((item): item is string => Boolean(item));
      if (issues.length && policy.enforceReadOnlyRole) {
        throw new DatabaseGuardrailError("TalkSQL requires a dedicated read-only PostgreSQL user.", {
          code: "READ_ONLY_USER_REQUIRED",
          status: 403,
          details: issues,
          setupSql: setupSql(target),
        });
      }
      return { ok: true, engine: "postgresql", currentUser: audit.currentUser, latencyMs: Math.round(performance.now() - startedAt), readOnlyVerified: issues.length === 0, warnings: issues.length ? ["Read-only role enforcement is disabled.", ...issues] : [] };
    } catch (error) {
      if (signal?.aborted) throw cancelled(signal);
      throw error;
    } finally {
      cancellation?.detach();
      await client.end().catch(() => undefined);
    }
  },

  async execute(target, credentials, sql, policy, options: ExecuteOptions): Promise<AdapterQueryResult> {
    assertTls(target, policy);
    const pool = getPool(target, credentials, policy);
    let client: PoolClient | undefined;
    let cancellation: ReturnType<typeof attachCancellation> | undefined;
    let reusable = true;
    const wrapped = `SELECT * FROM (${sql}) AS talksql_result LIMIT ${policy.maxRows + 1}`;
    try {
      client = await pool.connect();
      if (options.signal.aborted) {
        reusable = false;
        throw cancelled(options.signal);
      }
      cancellation = attachCancellation(client, options.signal);
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${policy.statementTimeoutMs}`);
      await client.query(`SET LOCAL lock_timeout = ${policy.lockTimeoutMs}`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${policy.wallClockTimeoutMs}`);
      await client.query(`SET LOCAL statement_timeout = ${policy.explainTimeoutMs}`);
      let estimate: QueryEstimate = { available: false, fullScans: [], warnings: [], requiresConfirmation: false };
      if (policy.enableCostWarnings) {
        await client.query("SAVEPOINT talksql_explain");
        try {
          const plan = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`);
          estimate = parseEstimate(plan.rows[0]?.["QUERY PLAN"], policy);
          await client.query("RELEASE SAVEPOINT talksql_explain");
        } catch (error) {
          if (options.signal.aborted) throw error;
          // PostgreSQL aborts the whole transaction after any statement error.
          // Roll back only the optional EXPLAIN so the real SELECT can still run.
          await client.query("ROLLBACK TO SAVEPOINT talksql_explain");
          await client.query("RELEASE SAVEPOINT talksql_explain");
        }
      }
      if (estimate.requiresConfirmation && !options.allowExpensive) {
        throw new DatabaseGuardrailError("This query may be expensive. Review the estimate before running it.", { code: "QUERY_COST_WARNING", status: 409, details: estimate.warnings, estimate });
      }
      await client.query(`SET LOCAL statement_timeout = ${policy.statementTimeoutMs}`);
      const result = await client.query(wrapped);
      return { columns: result.fields.map((field) => field.name), rows: result.rows.slice(0, policy.maxRows) as Record<string, unknown>[], truncated: result.rows.length > policy.maxRows, estimate };
    } catch (error) {
      if (options.signal.aborted) {
        reusable = false;
        throw cancelled(options.signal);
      }
      throw error;
    } finally {
      cancellation?.detach();
      if (client) {
        if (cancellation?.destroyed()) reusable = false;
        if (reusable) {
          try {
            await client.query("ROLLBACK");
          } catch {
            reusable = false;
          }
        }
        client.release(!reusable);
      }
    }
  },
};
