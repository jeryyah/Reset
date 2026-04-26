import {
  type UserRecord,
  getBangladeshTimeString,
  getTierLimit,
  getTimeUntilResetString,
} from "./storage";

const DIVIDER = "────────────────────";

function tierLabel(tier: UserRecord["tier"]): string {
  switch (tier) {
    case "premium":
      return "⭐ Premium";
    case "basic":
      return "💎 Basic";
    case "standard":
    default:
      return "📊 Standard";
  }
}

function tierAccessLine(tier: UserRecord["tier"]): string {
  switch (tier) {
    case "premium":
      return "Premium Access";
    case "basic":
      return "Basic Access";
    case "standard":
    default:
      return "Standard Access";
  }
}

function tierDailyLine(tier: UserRecord["tier"]): string {
  const limit = getTierLimit(tier);
  if (!Number.isFinite(limit)) return "Unlimited Daily Resets";
  return `${limit} Daily Resets`;
}

function progressBar(used: number, limit: number, length = 10): string {
  if (!Number.isFinite(limit) || limit <= 0) {
    return "▓".repeat(length);
  }
  const ratio = Math.min(1, Math.max(0, used / limit));
  const filled = Math.round(ratio * length);
  return "▓".repeat(filled) + "░".repeat(length - filled);
}

function statusEmoji(used: number, limit: number): string {
  if (!Number.isFinite(limit)) return "🟢 Available";
  if (used >= limit) return "🔴 Limit Reached";
  if (used / limit >= 0.8) return "🟡 Almost Full";
  return "🟢 Available";
}

export function formatStartMessage(userId: number): string {
  return [
    DIVIDER,
    "🚀 DRIP RESET SYSTEM",
    DIVIDER,
    "",
    "✅ System Ready",
    `├ Your ID: ${userId}`,
    "└ Status: 🟢 Active",
    "",
    "📖 How to Use:",
    "├ 1️⃣ Enter your Key For Reset",
    "├ 2️⃣ Bot processes instantly",
    "└ 3️⃣ Check status anytime",
    "",
    "📊 Access Tiers:",
    "├ 📊 Standard: 2 resets/day",
    "├ 💎 Basic: 10 resets/day",
    "└ ⭐ Premium: Unlimited",
    "",
    "⚡ Commands:",
    "├ /status ─ Check usage",
    "└ /help ─ Instructions",
    "",
    DIVIDER,
    "💡 Auto-delete in 24 hours",
  ].join("\n");
}

export function formatHelpMessage(): string {
  return [
    DIVIDER,
    "📚 USER GUIDE",
    DIVIDER,
    "",
    "📖 How to Use:",
    "├ Enter your Drip Key",
    "├ Example: 4863187000",
    "└ Bot processes instantly",
    "",
    "⚡ Commands:",
    "├ /status ─ View usage",
    "└ /help ─ This help",
    "",
    "📊 Access Tiers:",
    "├ 📊 Standard: 2/day",
    "├ 💎 Basic: 10/day",
    "└ ⭐ Premium: Unlimited",
    "",
    DIVIDER,
  ].join("\n");
}

export interface StatusMessageInput {
  user: UserRecord;
  firstName: string;
  lastName?: string;
  username?: string;
}

export function formatStatusMessage(input: StatusMessageInput): string {
  const { user, firstName, lastName, username } = input;
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const usernameLine = username ? `@${username}` : "—";
  const limit = getTierLimit(user.tier);
  const used = user.usedToday;
  const isPremium = user.tier === "premium";
  const premiumMark = isPremium ? "✅" : "❌";

  const usedLine = Number.isFinite(limit)
    ? `├ Used: ${used}/${limit} (${Math.round((used / Math.max(1, limit)) * 100)}%)`
    : `├ Used: ${used} (Unlimited)`;

  return [
    DIVIDER,
    "📊 ACCOUNT STATUS",
    DIVIDER,
    "",
    "👤 User Information",
    `├ Name: ${fullName || "—"}`,
    `├ Username: ${usernameLine}`,
    `├ ID: ${user.userId}`,
    `└ Premium: ${premiumMark}`,
    "",
    "🔐 Access Level",
    `├ ${tierAccessLine(user.tier)}`,
    `├ ${tierDailyLine(user.tier)}`,
    "└ Auto-delete: 24 hours",
    "",
    "📈 Today's Usage",
    usedLine,
    `├ Progress: ${progressBar(used, limit)}`,
    `├ Status: ${statusEmoji(used, limit)}`,
    `└ Reset in: ${getTimeUntilResetString()}`,
    "",
    "🕐 Bangladesh Time",
    `└ ${getBangladeshTimeString()}`,
    "",
    DIVIDER,
  ].join("\n");
}

export function formatBroadcastToAdmin(input: {
  text: string;
  firstName: string;
  lastName?: string;
  username?: string;
  userId: number;
  user: UserRecord;
}): string {
  const { text, firstName, lastName, username, userId, user } = input;
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const usernameLine = username ? `@${username}` : "—";
  return [
    DIVIDER,
    "📥 NEW KEY SUBMISSION",
    DIVIDER,
    "",
    "👤 From User",
    `├ Name: ${fullName || "—"}`,
    `├ Username: ${usernameLine}`,
    `├ ID: ${userId}`,
    `└ Tier: ${tierLabel(user.tier)}`,
    "",
    "🔑 Message:",
    text,
    "",
    `🕐 ${getBangladeshTimeString()} (BD)`,
    DIVIDER,
  ].join("\n");
}

function formatBangladeshDateTime24(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

function formatBangladeshTime12(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const dayPeriod = (get("dayPeriod") || "").toUpperCase();
  return `${get("hour")}:${get("minute")}:${get("second")} ${dayPeriod}`.trim();
}

export function formatLimitFailure(now: Date = new Date()): string {
  const tryAfter = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tryAfterStr = formatBangladeshDateTime24(tryAfter);
  return [
    DIVIDER,
    "❌ RESET FAILED",
    DIVIDER,
    "",
    "⚠️ API Error Details:",
    "",
    "├ Status: 429",
    `└ Response: {"success":false,"message":"Daily reset limit reached. Try again after ${tryAfterStr}"}`,
    "",
    DIVIDER,
  ].join("\n");
}

export function formatNotDetectedFailure(): string {
  return [
    DIVIDER,
    "❌ RESET FAILED",
    DIVIDER,
    "",
    "⚠️ API Error Details:",
    "",
    "├ Status: 403",
    '└ Response: {"error":"Token does not belong to this API key"}',
    "",
    DIVIDER,
  ].join("\n");
}

export function formatSuccess(input: {
  speedMs: number;
  used: number;
  limit: number;
  key: string;
  now?: Date;
}): string {
  const { speedMs, used, limit, key } = input;
  const now = input.now ?? new Date();
  const time = formatBangladeshTime12(now);
  const speedLabel = speedMs < 2000 ? "✅ Fast" : speedMs < 5000 ? "🟡 Normal" : "🔴 Slow";
  const usageStr = Number.isFinite(limit) ? `${used}/${limit}` : `${used} (Unlimited)`;

  return [
    DIVIDER,
    "✅ RESET SUCCESSFUL",
    DIVIDER,
    "",
    "🎯 Operation Complete",
    "├ Status: 🟢 Success",
    `├ Speed: ${speedLabel} (${speedMs}ms)`,
    `├ Time: ${time}`,
    `└ Usage: ${usageStr}`,
    "",
    "🔑 Key Processed:",
    key,
    "",
    DIVIDER,
  ].join("\n");
}

export function formatAdminAck(input: {
  action: "limit" | "notfound" | "success";
  now?: Date;
}): string {
  const { action } = input;
  const now = input.now ?? new Date();
  const time = formatBangladeshTime12(now);
  const label =
    action === "success"
      ? "✅ Marked as SUCCESS"
      : action === "limit"
        ? "⛔ Marked as LIMIT (429)"
        : "🚫 Marked as NOT DETECTED (403)";
  return `${label}\n└ at ${time} (BD)`;
}
