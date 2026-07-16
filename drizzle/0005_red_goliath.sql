ALTER TABLE "data_connection" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_connection" ADD COLUMN "health_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "data_connection" ADD COLUMN "read_only_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_connection" ADD COLUMN "credentials_rotated_at" timestamp with time zone;