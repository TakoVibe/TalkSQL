CREATE TABLE "ask_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"question" text NOT NULL,
	"kind" text,
	"sql" text,
	"ok" boolean NOT NULL,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_widget" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"kind" text NOT NULL,
	"sql" text,
	"chart_type" text,
	"x_column" text,
	"y_column" text,
	"focus_tables" jsonb,
	"last_result" jsonb,
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
