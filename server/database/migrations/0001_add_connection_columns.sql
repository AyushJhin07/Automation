ALTER TABLE "connections" ADD COLUMN "type" text DEFAULT 'saas' NOT NULL;
ALTER TABLE "connections" ADD COLUMN "test_status" text;
ALTER TABLE "connections" ADD COLUMN "test_error" text;
