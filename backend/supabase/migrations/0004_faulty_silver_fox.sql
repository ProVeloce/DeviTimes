CREATE TABLE "mfa_login_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_pending_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_pending_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_pending_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_recovery_code_hashes" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_last_used_step" bigint DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mfa_login_challenges_user_id_idx" ON "mfa_login_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_login_challenges_expires_at_idx" ON "mfa_login_challenges" USING btree ("expires_at");