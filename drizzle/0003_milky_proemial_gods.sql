CREATE TABLE "account_activity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"first_login_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"login_count" integer DEFAULT 0 NOT NULL
);
