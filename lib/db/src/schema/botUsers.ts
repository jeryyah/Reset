import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const botUsersTable = pgTable("bot_users", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  tier: text("tier").notNull().default("standard"),
  usedToday: integer("used_today").notNull().default(0),
  lastResetDate: date("last_reset_date").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type BotUserRow = typeof botUsersTable.$inferSelect;
export type InsertBotUser = typeof botUsersTable.$inferInsert;
