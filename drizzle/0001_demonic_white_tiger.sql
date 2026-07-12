ALTER TABLE "data_connection" ADD COLUMN "schema_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "data_connection" ADD COLUMN "schema_synced_at" timestamp with time zone;