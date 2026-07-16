import "server-only";

import { decryptConnectionCredentials } from "@/lib/connection-secrets";
import { DatabaseGuardrailError, getDatabaseAdapter, type QueryEstimate, type QueryPolicy } from "@/lib/database-adapters";
import { QUERY_POLICY } from "@/lib/query-policy";
import { getQueryPolicyForOrganization } from "@/lib/query-settings";

type StoredConnection = {
  id?: string;
  organizationId?: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  encryptedCredentials: string;
  readOnlyVerifiedAt?: Date | null;
};

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  responseBytes: number;
  estimate: QueryEstimate;
};

export type QueryExecutionOptions = {
  signal?: AbortSignal;
  allowExpensive?: boolean;
};

export const MAX_ROWS = QUERY_POLICY.maxRows;

type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  timer: ReturnType<typeof setTimeout>;
};

const gates = new Map<string, { active: number; waiters: Waiter[] }>();

function queueError(code: "QUERY_CANCELLED" | "QUERY_QUEUE_TIMEOUT", message: string) {
  return new DatabaseGuardrailError(message, { code, status: code === "QUERY_CANCELLED" ? 408 : 429 });
}

async function acquireQuerySlot(key: string, policy: QueryPolicy, signal?: AbortSignal) {
  const gate = gates.get(key) ?? { active: 0, waiters: [] };
  gates.set(key, gate);
  if (gate.active < policy.maxConcurrentPerDatabase) {
    gate.active++;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const removeWaiter = (waiter: Waiter) => {
      const index = gate.waiters.indexOf(waiter);
      if (index >= 0) gate.waiters.splice(index, 1);
    };
    const waiter: Waiter = {
      resolve: () => {
        clearTimeout(waiter.timer);
        if (waiter.onAbort) signal?.removeEventListener("abort", waiter.onAbort);
        resolve();
      },
      reject,
      signal,
      timer: setTimeout(() => {
        removeWaiter(waiter);
        reject(queueError("QUERY_QUEUE_TIMEOUT", "The database is busy. The query timed out while waiting for a slot."));
      }, policy.queueTimeoutMs),
    };
    waiter.onAbort = () => {
      clearTimeout(waiter.timer);
      removeWaiter(waiter);
      reject(queueError("QUERY_CANCELLED", "Query cancelled before execution."));
    };
    if (signal?.aborted) waiter.onAbort();
    else {
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      gate.waiters.push(waiter);
    }
  });
  gate.active++;
}

function releaseQuerySlot(key: string) {
  const gate = gates.get(key);
  if (!gate) return;
  gate.active--;
  gate.waiters.shift()?.resolve();
  if (!gate.active && !gate.waiters.length) gates.delete(key);
}

async function withQuerySlot<T>(key: string, policy: QueryPolicy, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  await acquireQuerySlot(key, policy, signal);
  try {
    return await run();
  } finally {
    releaseQuerySlot(key);
  }
}

function executionSignal(policy: QueryPolicy, parent?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Query exceeded the total execution timeout.", "TimeoutError")), policy.wallClockTimeoutMs);
  const onParentAbort = () => controller.abort(parent?.reason ?? new DOMException("Query cancelled.", "AbortError"));
  if (parent?.aborted) onParentAbort();
  else parent?.addEventListener("abort", onParentAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

function stripLeadingComments(sql: string) {
  return sql.replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))+/g, "").trim();
}

/** Conservative first filter. The database role and READ ONLY transaction remain the security boundary. */
export function looksReadOnlySelect(sql: string) {
  const normalized = stripLeadingComments(sql).replace(/;+\s*$/, "");
  if (!/^(?:with\b[\s\S]+\bselect\b|select\b)/i.test(normalized)) return false;
  if (/;\s*\S/.test(normalized)) return false;
  if (/\b(insert|update|delete|merge|replace|drop|alter|create|grant|revoke|truncate|copy|call|execute|prepare|deallocate|load\s+data|outfile|dumpfile)\b/i.test(normalized)) return false;
  if (/\bselect\b[\s\S]*\binto\b/i.test(normalized)) return false;
  if (/\bfor\s+(update|share)\b|\block\s+in\s+share\s+mode\b/i.test(normalized)) return false;
  if (/\b(pg_read_file|pg_read_binary_file|lo_import|lo_export|dblink|load_file|sleep|benchmark)\s*\(/i.test(normalized)) return false;
  return true;
}

function safeValue(value: unknown, policy: QueryPolicy): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[binary value: ${value.byteLength.toLocaleString()} bytes]`;
  const string = typeof value === "string" ? value : JSON.stringify(value, (_, nested) => typeof nested === "bigint" ? nested.toString() : nested);
  if (Buffer.byteLength(string, "utf8") <= policy.maxCellBytes) return typeof value === "string" ? value : JSON.parse(string);
  return `${string.slice(0, policy.maxCellBytes)}… [truncated]`;
}

function applyResponseLimits(columns: string[], rows: Record<string, unknown>[], alreadyTruncated: boolean, policy: QueryPolicy) {
  if (columns.length > policy.maxColumns) {
    throw new DatabaseGuardrailError(`The result has ${columns.length} columns; the maximum is ${policy.maxColumns}. Select fewer columns.`, { code: "QUERY_COLUMN_LIMIT", status: 422 });
  }
  const safeRows: Record<string, unknown>[] = [];
  let bytes = Buffer.byteLength(JSON.stringify(columns), "utf8");
  let truncated = alreadyTruncated;
  for (const row of rows) {
    const safeRow = Object.fromEntries(columns.map((column) => [column, safeValue(row[column], policy)]));
    const rowBytes = Buffer.byteLength(JSON.stringify(safeRow), "utf8");
    if (bytes + rowBytes > policy.maxResponseBytes) {
      truncated = true;
      break;
    }
    safeRows.push(safeRow);
    bytes += rowBytes;
  }
  return { rows: safeRows, truncated, responseBytes: bytes };
}

export async function executeReadOnlyQuery(connection: StoredConnection, sql: string, options: QueryExecutionOptions = {}): Promise<QueryResult> {
  const policy = await getQueryPolicyForOrganization(connection.organizationId);
  if (policy.enforceReadOnlyRole && !connection.readOnlyVerifiedAt) {
    throw new DatabaseGuardrailError("Verify this connection uses a dedicated read-only database user before running queries.", {
      code: "READ_ONLY_VERIFICATION_REQUIRED",
      status: 403,
      details: ["Open Connections and run the Health check. TalkSQL will verify the role's database privileges."],
    });
  }
  if (policy.requireTls && !connection.ssl) {
    throw new DatabaseGuardrailError("TLS/SSL is required by workspace settings.", { code: "TLS_REQUIRED", status: 403, details: ["Enable SSL on the saved connection or change the TLS requirement in Settings."] });
  }
  const normalizedSql = stripLeadingComments(sql).replace(/;+\s*$/, "");
  if (!looksReadOnlySelect(normalizedSql)) {
    throw new DatabaseGuardrailError("Only one read-only SELECT query is allowed.", { code: "UNSAFE_QUERY", status: 400 });
  }
  const adapter = getDatabaseAdapter(connection.engine);
  const credentials = decryptConnectionCredentials(connection.encryptedCredentials);
  const execution = executionSignal(policy, options.signal);
  const key = `${connection.engine}:${connection.host}:${connection.port}/${connection.database}`;
  try {
    const result = await withQuerySlot(key, policy, execution.signal, () => adapter.execute({
      connectionId: connection.id,
      engine: adapter.engine,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      ssl: connection.ssl,
    }, credentials, normalizedSql, policy, {
      signal: execution.signal,
      allowExpensive: options.allowExpensive ?? false,
    }));
    const limited = applyResponseLimits(result.columns, result.rows, result.truncated, policy);
    return { columns: result.columns, ...limited, estimate: result.estimate };
  } finally {
    execution.cleanup();
  }
}

export function serializeQueryError(error: unknown) {
  if (error instanceof DatabaseGuardrailError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        errorDetails: error.details,
        estimate: error.estimate,
        setupSql: error.setupSql,
      },
    };
  }
  const databaseError = error as Error & { code?: string; detail?: string; hint?: string; position?: string; severity?: string; sqlMessage?: string; sqlState?: string };
  const message = error instanceof Error ? error.message : "Query failed.";
  const details = [
    `Message: ${databaseError.sqlMessage ?? message}`,
    databaseError.severity && `Severity: ${databaseError.severity}`,
    (databaseError.code ?? databaseError.sqlState) && `Code: ${databaseError.code ?? databaseError.sqlState}`,
    databaseError.detail && `Detail: ${databaseError.detail}`,
    databaseError.hint && `Hint: ${databaseError.hint}`,
    databaseError.position && `Position: ${databaseError.position}`,
  ].filter((line): line is string => Boolean(line));
  return { status: 422, body: { error: message, code: databaseError.code ?? databaseError.sqlState ?? "QUERY_FAILED", errorDetails: details } };
}
