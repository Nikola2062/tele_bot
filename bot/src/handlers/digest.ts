import { Context } from "telegraf"
import { logger } from "../utils/index"
import {
  isValidTime,
  normalizeTime,
  upsertSubscription,
  removeSubscription,
  getSubscription,
} from "../digest/subscriptions"
import { sendDigest } from "../digest/digest"

const DEFAULT_TIME = "08:00"

/**
 * Commands for the daily world-news digest push:
 *   /subscribe [HH:MM]  — opt this chat into a daily digest (default 08:00 Berlin)
 *   /unsubscribe        — stop the daily digest
 *   /mydigest           — show this chat's subscription
 *   /digestnow          — send the digest right now (respects per-chat dedup)
 */
export class DigestHandlers {
  async handleSubscribe(ctx: Context) {
    const message = ctx.message
    const chatId = ctx.chat?.id
    if (!chatId || !message || !("text" in message)) return

    const arg = message.text.split(/\s+/)[1]?.trim()
    const time = arg || DEFAULT_TIME
    if (arg && !isValidTime(arg)) {
      await ctx.reply("❌ Invalid time. Use 24h HH:MM, e.g. `/subscribe 08:00`.", {
        parse_mode: "Markdown",
      })
      return
    }

    try {
      const sub = upsertSubscription(chatId, time)
      await ctx.reply(
        `🗞️ Subscribed to the daily *News Digest* at *${sub.time}* (Europe/Berlin).\n\n` +
          `You'll get new headlines across 🌍 World (BBC, DW, ARD, ZDF), 💻 Tech & Dev ` +
          `(Hacker News, GitHub, …) and 🇨🇳 China trending (微博, 知乎, …) — each in its original language.\n` +
          `• \`/digestnow\` — get it right now\n` +
          `• \`/mydigest\` — check your settings\n` +
          `• \`/unsubscribe\` — stop`,
        { parse_mode: "Markdown" }
      )
      logger.success(`digest: chat ${chatId} subscribed at ${sub.time}`)
    } catch (error) {
      logger.error("digest: subscribe failed:", error)
      await ctx.reply("❌ Failed to save your subscription. Please try again.")
    }
  }

  async handleUnsubscribe(ctx: Context) {
    const chatId = ctx.chat?.id
    if (!chatId) return
    try {
      const removed = removeSubscription(chatId)
      await ctx.reply(
        removed
          ? "🗑️ Unsubscribed from the daily News Digest."
          : "ℹ️ This chat isn't subscribed. Use `/subscribe` to start.",
        { parse_mode: "Markdown" }
      )
    } catch (error) {
      logger.error("digest: unsubscribe failed:", error)
      await ctx.reply("❌ Failed to update your subscription. Please try again.")
    }
  }

  async handleMyDigest(ctx: Context) {
    const chatId = ctx.chat?.id
    if (!chatId) return
    const sub = getSubscription(chatId)
    if (!sub) {
      await ctx.reply(
        "📭 No digest subscription for this chat.\nStart one with `/subscribe [HH:MM]` (default 08:00 Berlin).",
        { parse_mode: "Markdown" }
      )
      return
    }
    const last = sub.last_sent_date ? sub.last_sent_date : "never"
    await ctx.reply(
      `🗞️ *Your News Digest*\n\n` +
        `• Time: *${sub.time}* (Europe/Berlin)\n` +
        `• Last sent: ${last}\n\n` +
        `\`/digestnow\` to get it now · \`/unsubscribe\` to stop`,
      { parse_mode: "Markdown" }
    )
  }

  async handleDigestNow(ctx: Context) {
    const chatId = ctx.chat?.id
    if (!chatId) return
    await ctx.sendChatAction("typing")
    try {
      await sendDigest(ctx.telegram, chatId, { notifyEmpty: true })
    } catch (error) {
      logger.error("digest: /digestnow failed:", error)
      await ctx.reply("❌ Couldn't build the digest right now. Please try again later.")
    }
  }
}

export const digestHandlers = new DigestHandlers()
