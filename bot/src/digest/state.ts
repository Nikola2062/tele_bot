import path from "node:path"
import fs from "node:fs"
import md5 from "md5"
import type { NewsItem } from "../shared/types"
import { logger, getEnvVar } from "../utils/index"

/**
 * Per-chat "already delivered" store for the news digest
 * (Telegram_Hub/data/news_digest_state.json).
 *
 * The papers worker dedups arXiv IDs it has ever sent (papers/src/state.py);
 * the DHL worker dedups event hashes. This is the same idea for headlines: a
 * chat's morning push shows what is NEW since its last digest, not the same
 * BBC/DW/ZDF headlines every day.
 *
 * Schema:
 * {
 *   "sent": {
 *     "<chat_id>": { "<md5(url)>": "2026-07-24T06:00:00.000Z", ... }
 *   }
 * }
 *
 * Entries older than RETENTION_DAYS are pruned on every write so the file
 * cannot grow without bound.
 */

interface NewsDigestState {
  sent: Record<string, Record<string, string>>
}

const RETENTION_DAYS = 14
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

export function getNewsStateFilePath(): string {
  const dataDir = getEnvVar("DATA_DIR", "./data")
  return getEnvVar("NEWS_STATE_FILE", path.join(dataDir, "news_digest_state.json"))
}

function load(filePath: string): NewsDigestState {
  try {
    if (!fs.existsSync(filePath)) return { sent: {} }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    if (data && typeof data.sent === "object" && data.sent !== null) return data as NewsDigestState
    return { sent: {} }
  } catch (error) {
    logger.error(`Failed to read news digest state at ${filePath}:`, error)
    return { sent: {} }
  }
}

function save(filePath: string, state: NewsDigestState): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + "\n", "utf-8")
  fs.renameSync(tmpPath, filePath)
}

/** Stable key for a headline. The URL is the closest thing to a unique id. */
function itemKey(item: NewsItem): string {
  return md5(String(item.url || item.id))
}

function prune(seen: Record<string, string>, now: number): void {
  for (const [key, iso] of Object.entries(seen)) {
    const t = Date.parse(iso)
    if (Number.isNaN(t) || now - t > RETENTION_MS) delete seen[key]
  }
}

/** Items this chat has NOT been sent before, preserving order. Read-only. */
export function filterUnseen(chatId: number, items: NewsItem[]): NewsItem[] {
  const seen = load(getNewsStateFilePath()).sent[String(chatId)] ?? {}
  return items.filter(item => !(itemKey(item) in seen))
}

/** Record these items as delivered to this chat, and prune stale entries. */
export function markSeen(chatId: number, items: NewsItem[]): void {
  if (items.length === 0) return
  const filePath = getNewsStateFilePath()
  const state = load(filePath)
  const key = String(chatId)
  const seen = state.sent[key] ?? {}
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  for (const item of items) seen[itemKey(item)] = nowIso
  prune(seen, nowMs)
  state.sent[key] = seen
  save(filePath, state)
}
