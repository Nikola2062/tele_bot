import type { Telegraf } from "telegraf"
import { logger } from "../utils/index"
import { berlinNow } from "./time"
import { listSubscriptions, markSent } from "./subscriptions"
import { sendDigest } from "./digest"

/**
 * Daily news-digest scheduler — the news counterpart to the papers worker's
 * daily loop (papers/src/main.py: _run_scheduler).
 *
 * It ticks once a minute (Europe/Berlin) and fires two kinds of push:
 *
 *  1. Per-chat subscriptions (/subscribe HH:MM) — each fires at its own time.
 *
 *  2. Auto "after papers" push (opt-in via DIGEST_AUTO=true) — fires the digest
 *     to DIGEST_AUTO_CHAT_ID (default: the papers chat TELEGRAM_CHAT_ID) at
 *     DIGEST_AFTER_PAPERS_MIN minutes (default 60) after the papers digest time
 *     (SCHEDULE_HOUR:SCHEDULE_MINUTE, default 10:00). Tying it to the papers
 *     schedule keeps "one hour after the paper notification" true even if that
 *     schedule is later changed.
 *
 * Both dedup once-per-day: subscriptions via last_sent_date on disk, the auto
 * push via an in-memory per-chat date (a bot restart at the exact fire minute
 * is the only edge that could re-send, which is acceptable for a daily digest).
 */
export class DigestScheduler {
  private timer: NodeJS.Timeout | null = null
  private ticking = false
  private autoSent = new Map<number, string>() // chat_id -> last auto-send date

  constructor(private bot: Telegraf) {}

  start(): void {
    if (this.timer) return
    const auto = autoChats()
    if (auto.length > 0) {
      logger.info(`news digest scheduler started; auto push at ${autoTime()} (Europe/Berlin) to ${auto.join(", ")}`)
    } else {
      logger.info("news digest scheduler started (checks every 60s, Europe/Berlin)")
    }
    // A plain 60s interval is close enough for a once-a-day digest, no cron dep.
    this.timer = setInterval(() => void this.tick(), 60 * 1000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Ping the "next run" time to the chat after a push, mirroring the papers
   * worker's `⏰ Next message at …` (papers/src/main.py: _notify_next_run).
   * Since the digest just fired at `hm` today, the next run is tomorrow at `hm`.
   */
  private async notifyNextRun(chatId: number, hm: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, `⏰ Next news digest: ${nextRunLabel(hm)}`)
    } catch (error) {
      logger.error(`digest: next-run ping to ${chatId} failed:`, error)
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return // never overlap two ticks
    this.ticking = true
    try {
      const { date, hm } = berlinNow()

      // 1. Per-chat subscriptions.
      for (const sub of listSubscriptions()) {
        if (sub.time !== hm || sub.last_sent_date === date) continue
        markSent(sub.chat_id, date)
        try {
          const n = await sendDigest(this.bot.telegram, sub.chat_id)
          logger.info(`digest: scheduled push to ${sub.chat_id} at ${hm} (${n} headlines)`)
        } catch (error) {
          logger.error(`digest: scheduled push to ${sub.chat_id} failed:`, error)
        }
        await this.notifyNextRun(sub.chat_id, sub.time)
      }

      // 2. Auto "after papers" push.
      if (hm === autoTime()) {
        for (const chatId of autoChats()) {
          if (this.autoSent.get(chatId) === date) continue
          this.autoSent.set(chatId, date)
          try {
            const n = await sendDigest(this.bot.telegram, chatId)
            logger.info(`digest: auto push (after papers) to ${chatId} at ${hm} (${n} headlines)`)
          } catch (error) {
            logger.error(`digest: auto push to ${chatId} failed:`, error)
          }
          await this.notifyNextRun(chatId, autoTime())
        }
      }
    } catch (error) {
      logger.error("digest scheduler tick failed:", error)
    } finally {
      this.ticking = false
    }
  }
}

/** "HH:MM" (Europe/Berlin) = papers time (SCHEDULE_HOUR:SCHEDULE_MINUTE) + offset. */
function autoTime(): string {
  const hour = parseInt(process.env.SCHEDULE_HOUR ?? "10", 10)
  const minute = parseInt(process.env.SCHEDULE_MINUTE ?? "0", 10)
  const offset = parseInt(process.env.DIGEST_AFTER_PAPERS_MIN ?? "60", 10)
  const total = (((hour * 60 + minute + offset) % 1440) + 1440) % 1440
  const hh = String(Math.floor(total / 60)).padStart(2, "0")
  const mm = String(total % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

/** Label for the next fire of `hm` (tomorrow, since it just fired today). */
function nextRunLabel(hm: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(tomorrow)
  return `${dateStr}, ${hm} (Europe/Berlin)`
}

/** Chats for the auto push: DIGEST_AUTO_CHAT_ID or the papers TELEGRAM_CHAT_ID. */
function autoChats(): number[] {
  if ((process.env.DIGEST_AUTO ?? "").trim().toLowerCase() !== "true") return []
  const raw = process.env.DIGEST_AUTO_CHAT_ID || process.env.TELEGRAM_CHAT_ID || ""
  return raw
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n !== 0)
}
