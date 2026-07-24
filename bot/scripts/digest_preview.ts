#!/usr/bin/env node
/**
 * Preview the daily world-news digest exactly as Telegram would receive it,
 * without sending anything and without touching real dedup state.
 *
 *   npm run digest:preview
 *
 * Uses a stub Telegram that captures outgoing messages. A throwaway temp dir
 * holds the cache DB and dedup state, so a preview never marks headlines as
 * "seen" for a real chat.
 */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent"

import dotenv from "dotenv"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { initializeCache, closeCache } from "../src/database/cache"
import { logger } from "../src/utils/index"
import { sendDigest } from "../src/digest/digest"

logger.level = -999

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") })
dotenv.config()

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "digest-preview-"))
  process.env.NEWS_STATE_FILE = path.join(tmp, "news_state.json")
  initializeCache(path.join(tmp, "cache.db"))

  const captured: string[] = []
  const stub: any = {
    sendMessage: async (_chatId: number, text: string) => {
      captured.push(text)
      return { message_id: captured.length }
    },
    sendChatAction: async () => {},
  }

  const realError = console.error
  console.error = () => {} // source modules log fetch failures here
  let n = 0
  try {
    n = await sendDigest(stub, 999999, { notifyEmpty: true })
  } finally {
    console.error = realError
  }

  console.log(`\n===== WORLD NEWS DIGEST PREVIEW =====`)
  console.log(`${n} new headlines across ${captured.length} Telegram message(s)\n`)
  captured.forEach((m, i) => {
    console.log(`----- MESSAGE ${i + 1} (${m.length}/4096 chars) -----`)
    console.log(m)
    console.log()
  })
  closeCache()
}

main().catch((err) => {
  console.error(err)
  closeCache()
  process.exit(1)
})
