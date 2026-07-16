CREATE TABLE "workspace_query_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enforce_read_only_role" boolean DEFAULT true NOT NULL,
	"require_tls" boolean DEFAULT true NOT NULL,
	"enable_cost_warnings" boolean DEFAULT true NOT NULL,
	"statement_timeout_ms" integer DEFAULT 15000 NOT NULL,
	"queue_timeout_ms" integer DEFAULT 5000 NOT NULL,
	"max_rows" integer DEFAULT 100 NOT NULL,
	"max_concurrent" integer DEFAULT 3 NOT NULL,
	"warn_estimated_rows" integer DEFAULT 1000000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
