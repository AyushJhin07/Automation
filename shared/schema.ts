import { pgTable, text, serial, integer, boolean, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;


export const workflowTriggers = pgTable("workflow_triggers", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  type: text("type").notNull(),
  appId: text("app_id").notNull(),
  triggerId: text("trigger_id").notNull(),
  endpoint: text("endpoint"),
  secret: text("secret"),
  metadata: json("metadata"),
  dedupeState: json("dedupe_state"),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pollingTriggers = pgTable("polling_triggers", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  appId: text("app_id").notNull(),
  triggerId: text("trigger_id").notNull(),
  interval: integer("interval").notNull(),
  lastPoll: timestamp("last_poll"),
  nextPoll: timestamp("next_poll").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  dedupeKey: text("dedupe_key"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const webhookLogs = pgTable("webhook_logs", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  appId: text("app_id").notNull(),
  triggerId: text("trigger_id").notNull(),
  payload: json("payload"),
  headers: json("headers"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  signature: text("signature"),
  processed: boolean("processed").notNull().default(false),
  source: text("source").notNull().default('webhook'),
  dedupeToken: text("dedupe_token"),
  executionId: text("execution_id"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
