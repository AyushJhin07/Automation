CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"type" text DEFAULT 'saas' NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"iv" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used" timestamp,
	"last_tested" timestamp,
	"test_status" text,
	"test_error" text,
	"last_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"contains_pii" boolean DEFAULT false NOT NULL,
	"pii_type" text,
	"security_level" text DEFAULT 'standard' NOT NULL,
	"access_restricted" boolean DEFAULT false NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "connector_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"config" json NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"popularity" integer DEFAULT 0 NOT NULL,
	"handles_personal_data" boolean DEFAULT false NOT NULL,
	"security_level" text DEFAULT 'standard' NOT NULL,
	"compliance_flags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connector_definitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "polling_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"app_id" text NOT NULL,
	"trigger_id" text NOT NULL,
	"interval" integer NOT NULL,
	"last_poll" timestamp,
	"next_poll" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"dedupe_key" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"revoke_reason" text,
	CONSTRAINT "sessions_token_unique" UNIQUE("token"),
	CONSTRAINT "sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "usage_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"llm_tokens" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"workflow_runs" integer DEFAULT 0 NOT NULL,
	"storage_used" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"webhooks_received" integer DEFAULT 0 NOT NULL,
	"http_requests" integer DEFAULT 0 NOT NULL,
	"data_transfer" integer DEFAULT 0 NOT NULL,
	"pii_records_processed" integer DEFAULT 0 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"estimated_cost" integer DEFAULT 0 NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_type" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"quota_reset_date" timestamp DEFAULT now() NOT NULL,
	"quota_api_calls" integer DEFAULT 1000 NOT NULL,
	"quota_tokens" integer DEFAULT 100000 NOT NULL,
	"monthly_api_calls" integer DEFAULT 0 NOT NULL,
	"monthly_tokens_used" integer DEFAULT 0 NOT NULL,
	"pii_consent_given" boolean DEFAULT false NOT NULL,
	"pii_consent_date" timestamp,
	"pii_last_reviewed" timestamp,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"app_id" text NOT NULL,
	"trigger_id" text NOT NULL,
	"payload" json,
	"headers" json,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"signature" text,
	"processed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'webhook' NOT NULL,
	"dedupe_token" text,
	"execution_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration" integer,
	"trigger_type" text NOT NULL,
	"trigger_data" json,
	"node_results" json,
	"error_details" json,
	"processed_pii" boolean DEFAULT false NOT NULL,
	"pii_types" text[],
	"api_calls_made" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"data_processed" integer DEFAULT 0 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "workflow_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"type" text NOT NULL,
	"app_id" text NOT NULL,
	"trigger_id" text NOT NULL,
	"endpoint" text,
	"secret" text,
	"metadata" json,
	"dedupe_state" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph" json NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_executed" timestamp,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"successful_runs" integer DEFAULT 0 NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"tags" text[],
	"contains_pii" boolean DEFAULT false NOT NULL,
	"pii_elements" text[],
	"security_review" boolean DEFAULT false NOT NULL,
	"security_review_date" timestamp,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"compliance_flags" text[],
	"data_retention_days" integer DEFAULT 90,
	"avg_execution_time" integer,
	"success_rate" integer DEFAULT 100,
	"metadata" json
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_tracking" ADD CONSTRAINT "usage_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_user_provider_idx" ON "connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "connections_provider_idx" ON "connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "connections_active_idx" ON "connections" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "connections_last_used_idx" ON "connections" USING btree ("last_used");--> statement-breakpoint
CREATE INDEX "connections_pii_idx" ON "connections" USING btree ("contains_pii","pii_type");--> statement-breakpoint
CREATE INDEX "connections_security_level_idx" ON "connections" USING btree ("security_level");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_provider_name_idx" ON "connections" USING btree ("user_id","provider","name");--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_slug_idx" ON "connector_definitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "connectors_category_idx" ON "connector_definitions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "connectors_active_idx" ON "connector_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "connectors_popularity_idx" ON "connector_definitions" USING btree ("popularity");--> statement-breakpoint
CREATE INDEX "connectors_pii_idx" ON "connector_definitions" USING btree ("handles_personal_data");--> statement-breakpoint
CREATE INDEX "connectors_security_level_idx" ON "connector_definitions" USING btree ("security_level");--> statement-breakpoint
CREATE INDEX "polling_triggers_workflow_id_idx" ON "polling_triggers" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "polling_triggers_app_trigger_idx" ON "polling_triggers" USING btree ("app_id","trigger_id");--> statement-breakpoint
CREATE INDEX "polling_triggers_next_poll_idx" ON "polling_triggers" USING btree ("next_poll");--> statement-breakpoint
CREATE INDEX "polling_triggers_active_idx" ON "polling_triggers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_idx" ON "sessions" USING btree ("refresh_token");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_active_idx" ON "sessions" USING btree ("is_revoked","expires_at");--> statement-breakpoint
CREATE INDEX "usage_user_date_idx" ON "usage_tracking" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "usage_date_idx" ON "usage_tracking" USING btree ("date");--> statement-breakpoint
CREATE INDEX "usage_user_idx" ON "usage_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_api_calls_idx" ON "usage_tracking" USING btree ("api_calls");--> statement-breakpoint
CREATE INDEX "usage_cost_idx" ON "usage_tracking" USING btree ("cost");--> statement-breakpoint
CREATE INDEX "usage_pii_idx" ON "usage_tracking" USING btree ("pii_records_processed");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_plan_idx" ON "users" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_last_login_idx" ON "users" USING btree ("last_login");--> statement-breakpoint
CREATE INDEX "users_email_verified_idx" ON "users" USING btree ("email_verified","is_active");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active","plan");--> statement-breakpoint
CREATE INDEX "users_quota_reset_idx" ON "users" USING btree ("quota_reset_date");--> statement-breakpoint
CREATE INDEX "webhook_logs_webhook_id_idx" ON "webhook_logs" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_logs_app_trigger_idx" ON "webhook_logs" USING btree ("app_id","trigger_id");--> statement-breakpoint
CREATE INDEX "webhook_logs_timestamp_idx" ON "webhook_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "webhook_logs_processed_idx" ON "webhook_logs" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "webhook_logs_workflow_idx" ON "webhook_logs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "webhook_logs_source_idx" ON "webhook_logs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "webhook_logs_dedupe_idx" ON "webhook_logs" USING btree ("dedupe_token");--> statement-breakpoint
CREATE INDEX "executions_workflow_idx" ON "workflow_executions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "executions_user_idx" ON "workflow_executions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "executions_status_idx" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "executions_started_at_idx" ON "workflow_executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "executions_duration_idx" ON "workflow_executions" USING btree ("duration");--> statement-breakpoint
CREATE INDEX "executions_trigger_type_idx" ON "workflow_executions" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "executions_pii_idx" ON "workflow_executions" USING btree ("processed_pii");--> statement-breakpoint
CREATE INDEX "executions_api_calls_idx" ON "workflow_executions" USING btree ("api_calls_made");--> statement-breakpoint
CREATE INDEX "executions_cost_idx" ON "workflow_executions" USING btree ("cost");--> statement-breakpoint
CREATE INDEX "executions_user_time_idx" ON "workflow_executions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "executions_workflow_time_idx" ON "workflow_executions" USING btree ("workflow_id","started_at");--> statement-breakpoint
CREATE INDEX "executions_status_time_idx" ON "workflow_executions" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "workflow_triggers_workflow_idx" ON "workflow_triggers" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_triggers_app_trigger_idx" ON "workflow_triggers" USING btree ("app_id","trigger_id");--> statement-breakpoint
CREATE INDEX "workflow_triggers_type_idx" ON "workflow_triggers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "workflow_triggers_active_idx" ON "workflow_triggers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflows_user_idx" ON "workflows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflows_category_idx" ON "workflows" USING btree ("category");--> statement-breakpoint
CREATE INDEX "workflows_active_idx" ON "workflows" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflows_last_executed_idx" ON "workflows" USING btree ("last_executed");--> statement-breakpoint
CREATE INDEX "workflows_execution_count_idx" ON "workflows" USING btree ("execution_count");--> statement-breakpoint
CREATE INDEX "workflows_pii_idx" ON "workflows" USING btree ("contains_pii");--> statement-breakpoint
CREATE INDEX "workflows_risk_level_idx" ON "workflows" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "workflows_security_review_idx" ON "workflows" USING btree ("security_review");--> statement-breakpoint
CREATE INDEX "workflows_compliance_idx" ON "workflows" USING btree ("compliance_flags");--> statement-breakpoint
CREATE INDEX "workflows_performance_idx" ON "workflows" USING btree ("avg_execution_time","success_rate");--> statement-breakpoint
CREATE INDEX "workflows_user_active_idx" ON "workflows" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "workflows_user_category_idx" ON "workflows" USING btree ("user_id","category");