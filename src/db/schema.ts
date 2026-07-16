import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Minimal lifecycle telemetry; it deliberately does not duplicate user names, emails, or passwords. */
export const accountActivity = pgTable("account_activity", {
  userId: text("user_id").primaryKey(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  firstLoginAt: timestamp("first_login_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  loginCount: integer("login_count").notNull().default(0),
  welcomeEmailSentAt: timestamp("welcome_email_sent_at", { withTimezone: true }),
});

/** Customer database credentials are encrypted before storage. */
export const dataConnections = pgTable(
  "data_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    engine: text("engine").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull(),
    database: text("database_name").notNull(),
    ssl: boolean("ssl").notNull().default(true),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    status: text("status").notNull().default("connected"),
    healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
    healthLatencyMs: integer("health_latency_ms"),
    readOnlyVerifiedAt: timestamp("read_only_verified_at", { withTimezone: true }),
    credentialsRotatedAt: timestamp("credentials_rotated_at", { withTimezone: true }),
    schemaSnapshot: jsonb("schema_snapshot"),
    schemaSyncedAt: timestamp("schema_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("data_connection_org_name_unique").on(table.organizationId, table.name)],
);

/** Organization-level query controls. SQL filtering and READ ONLY transactions are never configurable. */
export const workspaceQuerySettings = pgTable("workspace_query_settings", {
  organizationId: text("organization_id").primaryKey(),
  enforceReadOnlyRole: boolean("enforce_read_only_role").notNull().default(true),
  requireTls: boolean("require_tls").notNull().default(true),
  enableCostWarnings: boolean("enable_cost_warnings").notNull().default(true),
  statementTimeoutMs: integer("statement_timeout_ms").notNull().default(15_000),
  queueTimeoutMs: integer("queue_timeout_ms").notNull().default(5_000),
  maxRows: integer("max_rows").notNull().default(100),
  maxConcurrent: integer("max_concurrent").notNull().default(3),
  warnEstimatedRows: integer("warn_estimated_rows").notNull().default(1_000_000),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every ask is logged: audit trail now, few-shot examples and history UI later. */
export const askLog = pgTable("ask_log", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  connectionId: text("connection_id").notNull(),
  question: text("question").notNull(),
  kind: text("kind"),
  sql: text("sql"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Workspace SQL files stay bound to the connection whose dialect and schema they target. */
export const sqlScripts = pgTable(
  "sql_script",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sql_script_org_connection_name_unique").on(table.organizationId, table.connectionId, table.name)],
);

/** SQL is pinned at save time; question kept for meaning and future regeneration. */
export const dashboardWidgets = pgTable("dashboard_widget", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  connectionId: text("connection_id").notNull(),
  title: text("title").notNull(),
  question: text("question").notNull(),
  kind: text("kind").notNull(),
  sql: text("sql"),
  chartType: text("chart_type"),
  xColumn: text("x_column"),
  yColumn: text("y_column"),
  focusTables: jsonb("focus_tables"),
  lastResult: jsonb("last_result"),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
