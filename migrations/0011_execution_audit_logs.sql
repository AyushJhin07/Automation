CREATE TABLE IF NOT EXISTS "execution_audit_logs" (
    "id" SERIAL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT,
    "app_id" TEXT NOT NULL,
    "function_id" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL CHECK ("duration_ms" >= 0),
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "execution_audit_logs_created_at_idx"
    ON "execution_audit_logs" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "execution_audit_logs_request_idx"
    ON "execution_audit_logs" ("request_id");

CREATE INDEX IF NOT EXISTS "execution_audit_logs_app_function_idx"
    ON "execution_audit_logs" ("app_id", "function_id");

CREATE INDEX IF NOT EXISTS "execution_audit_logs_success_idx"
    ON "execution_audit_logs" ("success");

COMMENT ON TABLE "execution_audit_logs" IS 'Append-only audit trail for connector executions captured via OTEL logs.';
