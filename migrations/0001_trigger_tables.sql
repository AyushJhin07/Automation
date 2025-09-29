CREATE TABLE IF NOT EXISTS "workflow_triggers" (
    "id" text PRIMARY KEY,
    "workflow_id" text NOT NULL,
    "type" text NOT NULL,
    "app_id" text NOT NULL,
    "trigger_id" text NOT NULL,
    "endpoint" text,
    "secret" text,
    "metadata" json,
    "dedupe_state" json,
    "is_active" boolean NOT NULL DEFAULT true,
    "last_synced_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "polling_triggers" (
    "id" text PRIMARY KEY,
    "workflow_id" text NOT NULL,
    "app_id" text NOT NULL,
    "trigger_id" text NOT NULL,
    "interval" integer NOT NULL,
    "last_poll" timestamp,
    "next_poll" timestamp NOT NULL,
    "is_active" boolean NOT NULL DEFAULT true,
    "dedupe_key" text,
    "metadata" json,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "webhook_logs" (
    "id" text PRIMARY KEY,
    "webhook_id" text NOT NULL,
    "workflow_id" text NOT NULL,
    "app_id" text NOT NULL,
    "trigger_id" text NOT NULL,
    "payload" json,
    "headers" json,
    "timestamp" timestamp NOT NULL DEFAULT now(),
    "signature" text,
    "processed" boolean NOT NULL DEFAULT false,
    "source" text NOT NULL DEFAULT 'webhook',
    "dedupe_token" text,
    "execution_id" text,
    "error" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_triggers_workflow_idx" ON "workflow_triggers" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_triggers_app_trigger_idx" ON "workflow_triggers" ("app_id", "trigger_id");
CREATE INDEX IF NOT EXISTS "workflow_triggers_type_idx" ON "workflow_triggers" ("type");
CREATE INDEX IF NOT EXISTS "workflow_triggers_active_idx" ON "workflow_triggers" ("is_active");

CREATE INDEX IF NOT EXISTS "polling_triggers_workflow_id_idx" ON "polling_triggers" ("workflow_id");
CREATE INDEX IF NOT EXISTS "polling_triggers_app_trigger_idx" ON "polling_triggers" ("app_id", "trigger_id");
CREATE INDEX IF NOT EXISTS "polling_triggers_next_poll_idx" ON "polling_triggers" ("next_poll");
CREATE INDEX IF NOT EXISTS "polling_triggers_active_idx" ON "polling_triggers" ("is_active");

CREATE INDEX IF NOT EXISTS "webhook_logs_webhook_id_idx" ON "webhook_logs" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_logs_app_trigger_idx" ON "webhook_logs" ("app_id", "trigger_id");
CREATE INDEX IF NOT EXISTS "webhook_logs_timestamp_idx" ON "webhook_logs" ("timestamp");
CREATE INDEX IF NOT EXISTS "webhook_logs_processed_idx" ON "webhook_logs" ("processed");
CREATE INDEX IF NOT EXISTS "webhook_logs_workflow_idx" ON "webhook_logs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "webhook_logs_source_idx" ON "webhook_logs" ("source");
CREATE INDEX IF NOT EXISTS "webhook_logs_dedupe_idx" ON "webhook_logs" ("dedupe_token");
