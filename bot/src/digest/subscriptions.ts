import path from "node:path"
import fs from "node:fs"
import { logger, getEnvVar } from "../utils/index"

/**
 * Per-chat news-digest subscription registry (Telegram_Hub/data/subscriptions.json).
 *
 * Same design as the parcel registry (src/handlers/parcels.ts): plain JSON,
 * atomic writes (temp file + rename). Unlike the papers worker — which pushes
 * to a single env-configured TELEGRAM_CHAT_ID — the news digest is opt-in
 * per chat via /subscribe, because the bot is interactive and multi-user.
 *
 * Schema:
 * {
 *   "subscriptions": [
 *     {
 *       "chat_id": 123456789,
 *       "time": "08:00",             // HH:MM, Europe/Berlin
 *       "added_at": "2026-07-24T06:00:00.000Z",
 *       "last_sent_date": "2026-07-24" | null   // YYYY-MM-DD (Berlin) of last push
 *     }
 *   ]
 * }
 */

export interface DigestSubscription {
  chat_id: number
  time: string
  added_at: string
  last_sent_date: string | null
}

interface SubscriptionRegistry {
  subscriptions: DigestSubscription[]
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time.trim())
}

/** "8:5" → "08:05". Assumes isValidTime() already passed. */
export function normalizeTime(time: string): string {
  const [h, m] = time.trim().split(":")
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
}

export function getSubscriptionsFilePath(): string {
  const dataDir = getEnvVar("DATA_DIR", "./data")
  return getEnvVar("SUBSCRIPTIONS_FILE", path.join(dataDir, "subscriptions.json"))
}

function load(filePath: string): SubscriptionRegistry {
  try {
    if (!fs.existsSync(filePath)) return { subscriptions: [] }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    if (data && Array.isArray(data.subscriptions)) return data as SubscriptionRegistry
    return { subscriptions: [] }
  } catch (error) {
    logger.error(`Failed to read subscriptions at ${filePath}:`, error)
    return { subscriptions: [] }
  }
}

function save(filePath: string, registry: SubscriptionRegistry): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2) + "\n", "utf-8")
  fs.renameSync(tmpPath, filePath)
}

export function listSubscriptions(): DigestSubscription[] {
  return load(getSubscriptionsFilePath()).subscriptions
}

export function getSubscription(chatId: number): DigestSubscription | undefined {
  return listSubscriptions().find(s => s.chat_id === chatId)
}

/** Create or update this chat's subscription time. Returns the stored entry. */
export function upsertSubscription(chatId: number, time: string): DigestSubscription {
  const filePath = getSubscriptionsFilePath()
  const registry = load(filePath)
  const normalized = normalizeTime(time)

  const existing = registry.subscriptions.find(s => s.chat_id === chatId)
  if (existing) {
    existing.time = normalized
    save(filePath, registry)
    return existing
  }

  const entry: DigestSubscription = {
    chat_id: chatId,
    time: normalized,
    added_at: new Date().toISOString(),
    last_sent_date: null,
  }
  registry.subscriptions.push(entry)
  save(filePath, registry)
  return entry
}

export function removeSubscription(chatId: number): boolean {
  const filePath = getSubscriptionsFilePath()
  const registry = load(filePath)
  const index = registry.subscriptions.findIndex(s => s.chat_id === chatId)
  if (index === -1) return false
  registry.subscriptions.splice(index, 1)
  save(filePath, registry)
  return true
}

/** Record that the daily push fired for this chat on `date` (Berlin YYYY-MM-DD). */
export function markSent(chatId: number, date: string): void {
  const filePath = getSubscriptionsFilePath()
  const registry = load(filePath)
  const sub = registry.subscriptions.find(s => s.chat_id === chatId)
  if (!sub) return
  sub.last_sent_date = date
  save(filePath, registry)
}
