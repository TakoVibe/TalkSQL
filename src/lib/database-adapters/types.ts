import "server-only";

export type DatabaseEngine = "postgresql" | "mysql";

export type DatabaseCredentials = {
  username: string;
  password: string;
};

export type DatabaseTarget = {
  connectionId?: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
};

export type QueryPolicy = {
  enforceReadOnlyRole: boolean;
  requireTls: boolean;
  enableCostWarnings: boolean;
  connectionTimeoutMs: number;
  queueTimeoutMs: number;
  statementTimeoutMs: number;
  wallClockTimeoutMs: number;
  explainTimeoutMs: number;
  lockTimeoutMs: number;
  maxRows: number;
  maxColumns: number;
  maxCellBytes: number;
  maxResponseBytes: number;
  maxConcurrentPerDatabase: number;
  poolIdleTimeoutMs: number;
  poolMaxLifetimeSeconds: number;
  warnEstimatedRows: number;
  warnEstimatedCost: number;
};

export type QueryEstimate = {
  available: boolean;
  estimatedRows?: number;
  estimatedCost?: number;
  fullScans: string[];
  warnings: string[];
  requiresConfirmation: boolean;
};

export type AdapterQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  estimate: QueryEstimate;
};

export type ConnectionHealth = {
  ok: true;
  engine: DatabaseEngine;
  currentUser: string;
  latencyMs: number;
  readOnlyVerified: boolean;
  warnings: string[];
};

export type ExecuteOptions = {
  signal: AbortSignal;
  allowExpensive: boolean;
};

export interface DatabaseAdapter {
  readonly engine: DatabaseEngine;
  closePool(connectionId: string): void;
  testConnection(target: DatabaseTarget, credentials: DatabaseCredentials, policy: QueryPolicy, signal?: AbortSignal): Promise<ConnectionHealth>;
  execute(target: DatabaseTarget, credentials: DatabaseCredentials, sql: string, policy: QueryPolicy, options: ExecuteOptions): Promise<AdapterQueryResult>;
}

export class DatabaseGuardrailError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: string[];
  readonly estimate?: QueryEstimate;
  readonly setupSql?: string;

  constructor(message: string, options: { code: string; status?: number; details?: string[]; estimate?: QueryEstimate; setupSql?: string }) {
    super(message);
    this.name = "DatabaseGuardrailError";
    this.code = options.code;
    this.status = options.status ?? 422;
    this.details = options.details ?? [];
    this.estimate = options.estimate;
    this.setupSql = options.setupSql;
  }
}
