CREATE TABLE IF NOT EXISTS "node_execution_results" (
    "id" serial PRIMARY KEY NOT NULL,
    "execution_id" text NOT NULL,
    "node_id" text NOT NULL,
    "idempotency_key" text NOT NULL,
    "result_hash" text NOT NULL,
    "result_data" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "node_execution_results_execution_idx"
    ON "node_execution_results" ("execution_id", "node_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "node_execution_results_expiry_idx"
    ON "node_execution_results" ("expires_at");

COMMENT ON TABLE "node_execution_results" IS 'Stores deduplicated node execution payloads for retry idempotency with 24h TTL enforced by application cleanup.';
