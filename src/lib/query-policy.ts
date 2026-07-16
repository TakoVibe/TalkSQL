import "server-only";

import type { QueryPolicy } from "@/lib/database-adapters/types";

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** One policy is shared by SQL, Ask, history and dashboard refreshes. */
export const QUERY_POLICY: QueryPolicy = Object.freeze({
  enforceReadOnlyRole: true,
  requireTls: true,
  enableCostWarnings: true,
  connectionTimeoutMs: positiveInteger("QUERY_CONNECTION_TIMEOUT_MS", 8_000),
  queueTimeoutMs: positiveInteger("QUERY_QUEUE_TIMEOUT_MS", 5_000),
  statementTimeoutMs: positiveInteger("QUERY_STATEMENT_TIMEOUT_MS", 15_000),
  wallClockTimeoutMs: positiveInteger("QUERY_WALL_CLOCK_TIMEOUT_MS", 22_000),
  explainTimeoutMs: positiveInteger("QUERY_EXPLAIN_TIMEOUT_MS", 3_000),
  lockTimeoutMs: positiveInteger("QUERY_LOCK_TIMEOUT_MS", 2_000),
  maxRows: positiveInteger("QUERY_MAX_ROWS", 100),
  maxColumns: positiveInteger("QUERY_MAX_COLUMNS", 100),
  maxCellBytes: positiveInteger("QUERY_MAX_CELL_BYTES", 64 * 1024),
  maxResponseBytes: positiveInteger("QUERY_MAX_RESPONSE_BYTES", 2 * 1024 * 1024),
  maxConcurrentPerDatabase: positiveInteger("QUERY_MAX_CONCURRENT", 3),
  poolIdleTimeoutMs: positiveInteger("QUERY_POOL_IDLE_TIMEOUT_MS", 5 * 60_000),
  poolMaxLifetimeSeconds: positiveInteger("QUERY_POOL_MAX_LIFETIME_SECONDS", 30 * 60),
  warnEstimatedRows: positiveInteger("QUERY_WARN_ESTIMATED_ROWS", 1_000_000),
  warnEstimatedCost: positiveInteger("QUERY_WARN_ESTIMATED_COST", 1_000_000),
});
