import { botUsersTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

export type Tier = "standard" | "basic" | "premium";

export interface UserRecord {
  userId: number;
  tier: Tier;
  usedToday: number;
  lastResetDate: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

const TIER_LIMITS: Record<Tier, number> = {
  standard: 2,
  basic: 10,
  premium: Number.POSITIVE_INFINITY,
};

function normalizeTier(value: string | null | undefined): Tier {
  if (value === "basic" || value === "premium" || value === "standard") {
    return value;
  }
  return "standard";
}

function rowToRecord(row: {
  userId: number;
  tier: string;
  usedToday: number;
  lastResetDate: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): UserRecord {
  return {
    userId: row.userId,
    tier: normalizeTier(row.tier),
    usedToday: row.usedToday,
    lastResetDate: row.lastResetDate,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    username: row.username ?? undefined,
  };
}

export function getBangladeshDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function getBangladeshTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayPeriod = (get("dayPeriod") || "").toUpperCase();
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${dayPeriod}`.trim();
}

export function getTimeUntilResetString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  let h = parseInt(get("hour"), 10);
  if (Number.isNaN(h)) h = 0;
  if (h === 24) h = 0;
  const m = parseInt(get("minute"), 10) || 0;
  const s = parseInt(get("second"), 10) || 0;

  const secondsUntilMidnight = 24 * 3600 - (h * 3600 + m * 60 + s);
  const hh = Math.floor(secondsUntilMidnight / 3600);
  const mm = Math.floor((secondsUntilMidnight % 3600) / 60);
  const ss = secondsUntilMidnight % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export interface UpsertProfile {
  firstName?: string;
  lastName?: string;
  username?: string;
}

export async function getOrCreateUser(
  userId: number,
  profile: UpsertProfile = {},
): Promise<UserRecord> {
  const today = getBangladeshDateString();
  const existing = await db
    .select()
    .from(botUsersTable)
    .where(eq(botUsersTable.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    const inserted = await db
      .insert(botUsersTable)
      .values({
        userId,
        tier: "standard",
        usedToday: 0,
        lastResetDate: today,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        username: profile.username ?? null,
      })
      .returning();
    const row = inserted[0]!;
    return rowToRecord(row);
  }

  const row = existing[0]!;
  const needsReset = row.lastResetDate !== today;
  const profileChanged =
    (profile.firstName !== undefined && profile.firstName !== row.firstName) ||
    (profile.lastName !== undefined && profile.lastName !== row.lastName) ||
    (profile.username !== undefined && profile.username !== row.username);

  if (!needsReset && !profileChanged) {
    return rowToRecord(row);
  }

  const updates: Partial<typeof botUsersTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (needsReset) {
    updates.usedToday = 0;
    updates.lastResetDate = today;
  }
  if (profile.firstName !== undefined) updates.firstName = profile.firstName;
  if (profile.lastName !== undefined) updates.lastName = profile.lastName ?? null;
  if (profile.username !== undefined) updates.username = profile.username ?? null;

  const updated = await db
    .update(botUsersTable)
    .set(updates)
    .where(eq(botUsersTable.userId, userId))
    .returning();
  return rowToRecord(updated[0]!);
}

export function getTierLimit(tier: Tier): number {
  return TIER_LIMITS[tier];
}

export async function setTier(userId: number, tier: Tier): Promise<UserRecord> {
  const current = await getOrCreateUser(userId);
  const updated = await db
    .update(botUsersTable)
    .set({ tier, updatedAt: new Date() })
    .where(eq(botUsersTable.userId, current.userId))
    .returning();
  return rowToRecord(updated[0]!);
}

export async function incrementUsage(userId: number): Promise<UserRecord> {
  const current = await getOrCreateUser(userId);
  const updated = await db
    .update(botUsersTable)
    .set({
      usedToday: current.usedToday + 1,
      updatedAt: new Date(),
    })
    .where(eq(botUsersTable.userId, current.userId))
    .returning();
  return rowToRecord(updated[0]!);
}
