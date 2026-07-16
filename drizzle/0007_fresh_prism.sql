CREATE TABLE "sql_script" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sql_script_org_connection_name_unique" ON "sql_script" USING btree ("organization_id","connection_id","name");