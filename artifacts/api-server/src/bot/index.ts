import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { logger } from "../lib/logger";
import {
  formatAdminAck,
  formatBroadcastToAdmin,
  formatHelpMessage,
  formatLimitFailure,
  formatNotDetectedFailure,
  formatStartMessage,
  formatStatusMessage,
  formatSuccess,
} from "./messages";
import { createRequest, deleteRequest, getRequest } from "./requests";
import {
  getOrCreateUser,
  getTierLimit,
  incrementUsage,
} from "./storage";

const AUTO_DELETE_MS = 24 * 60 * 60 * 1000;

type AdminAction = "limit" | "notfound" | "success";

export function startTelegramBot(): void {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const adminChatId = process.env["ADMIN_CHAT_ID"];

  if (!token) {
    logger.error(
      "TELEGRAM_BOT_TOKEN is not set; Telegram bot will not start.",
    );
    return;
  }
  if (!adminChatId) {
    logger.error("ADMIN_CHAT_ID is not set; Telegram bot will not start.");
    return;
  }

  const bot = new Bot(token);

  const scheduleAutoDelete = (chatId: number, messageId: number) => {
    const timer = setTimeout(() => {
      bot.api.deleteMessage(chatId, messageId).catch((err) => {
        logger.debug({ err }, "Auto-delete failed (message may be too old)");
      });
    }, AUTO_DELETE_MS);
    timer.unref?.();
  };

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await getOrCreateUser(from.id, {
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
    });
    const sent = await ctx.reply(formatStartMessage(from.id));
    scheduleAutoDelete(sent.chat.id, sent.message_id);
  });

  bot.command("help", async (ctx) => {
    const sent = await ctx.reply(formatHelpMessage());
    scheduleAutoDelete(sent.chat.id, sent.message_id);
  });

  bot.command("status", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const user = await getOrCreateUser(from.id, {
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
    });
    const sent = await ctx.reply(
      formatStatusMessage({
        user,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
      }),
    );
    scheduleAutoDelete(sent.chat.id, sent.message_id);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text ?? "";
    if (text.startsWith("/")) return;

    const from = ctx.from;
    if (!from) return;

    const user = await getOrCreateUser(from.id, {
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
    });

    const request = createRequest({
      userChatId: ctx.chat.id,
      userId: from.id,
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
      key: text,
      submittedAt: Date.now(),
    });

    const keyboard = new InlineKeyboard()
      .text("⛔ Limit", `act:limit:${request.id}`)
      .text("🚫 Not Detected", `act:notfound:${request.id}`)
      .text("✅ Success", `act:success:${request.id}`);

    try {
      await bot.api.sendMessage(
        adminChatId,
        formatBroadcastToAdmin({
          text,
          firstName: from.first_name,
          lastName: from.last_name,
          username: from.username,
          userId: from.id,
          user,
        }),
        { reply_markup: keyboard },
      );
    } catch (err) {
      logger.error({ err }, "Failed to forward message to admin");
    }
  });

  bot.callbackQuery(/^act:(limit|notfound|success):(.+)$/, async (ctx) => {
    const match = ctx.match;
    const action = match[1] as AdminAction;
    const requestId = match[2];

    if (!requestId) {
      await ctx.answerCallbackQuery({ text: "Invalid request" });
      return;
    }

    const adminId = String(ctx.from?.id ?? "");
    if (adminId !== adminChatId) {
      await ctx.answerCallbackQuery({
        text: "Only admin can use these buttons.",
        show_alert: true,
      });
      return;
    }

    const request = getRequest(requestId);
    if (!request) {
      await ctx.answerCallbackQuery({
        text: "This request expired or was already handled.",
        show_alert: true,
      });
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      } catch {
        // ignore
      }
      return;
    }

    const now = new Date();
    let userMessage: string;

    if (action === "limit") {
      userMessage = formatLimitFailure(now);
    } else if (action === "notfound") {
      userMessage = formatNotDetectedFailure();
    } else {
      const userRecord = await incrementUsage(request.userId);
      const limit = getTierLimit(userRecord.tier);
      userMessage = formatSuccess({
        speedMs: now.getTime() - request.submittedAt,
        used: userRecord.usedToday,
        limit,
        key: request.key,
        now,
      });
    }

    try {
      const sent = await bot.api.sendMessage(
        request.userChatId,
        userMessage,
      );
      scheduleAutoDelete(sent.chat.id, sent.message_id);
    } catch (err) {
      logger.error({ err }, "Failed to send reply to user");
      await ctx.answerCallbackQuery({
        text: "Failed to send reply to user.",
        show_alert: true,
      });
      return;
    }

    deleteRequest(requestId);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {
      // ignore — markup may already be removed
    }

    try {
      const ackText = formatAdminAck({ action, now });
      const original = ctx.callbackQuery.message?.text ?? "";
      await ctx.editMessageText(`${original}\n\n${ackText}`);
    } catch {
      // ignore — older messages cannot be edited
    }

    await ctx.answerCallbackQuery({ text: "Reply sent." });
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      logger.error({ err: e }, "Telegram API error");
    } else if (e instanceof HttpError) {
      logger.error({ err: e }, "Telegram network error");
    } else {
      logger.error({ err: e }, "Unknown bot error");
    }
  });

  bot.start({
    drop_pending_updates: true,
    onStart: (botInfo) => {
      logger.info(
        { username: botInfo.username, id: botInfo.id },
        "Telegram bot started",
      );
    },
  });
}
