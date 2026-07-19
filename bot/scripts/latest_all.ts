#!/usr/bin/env node
/**
 * Fetch latest news from every implemented source and print a pretty dump.
 *
 *   npm run latest
 *   # or from hub root:  python latest_news.py
 */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent"

import dotenv from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { sourceManager } from "../src/shared/sourceManager"
import { initializeCache, closeCache } from "../src/database/cache"
import { formatNewsForTerminal, logger } from "../src/utils/index"
import { getSourceDisplayName } from "../src/shared/sources"
import type { SourceID } from "../src/shared/types"

// Imports hoist above the env assignment in some runners ? force quiet anyway.
logger.level = -999

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") })
dotenv.config() // also allow bot/.env

const ITEMS_PER_SOURCE = 8
const BAR = "=".repeat(56)
const RULE = "-".repeat(56)

async function main() {
  const dataDir = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data")
  const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "cache.db")
  initializeCache(path.resolve(dbPath))

  const sources = sourceManager.getAvailableSources()
  const force = process.argv.includes("--fresh") || process.argv.includes("-f")
  const realError = console.error
  console.error = () => {} // source modules log failures here; we print our own summary

  console.log(`\nFetching latest from ${sources.length} sources${force ? " (force refresh)" : ""}...\n`)

  let ok = 0
  let failed = 0

  try {
    // Sequential: friendlier to rate limits / remote sites
    for (const sourceId of sources) {
      const name = getSourceDisplayName(sourceId as SourceID)
      try {
        const response = await sourceManager.getSourceNews(sourceId, force)
        if (response.status === "error") {
          failed++
          console.log(BAR)
          console.log(`  ${name}  (${sourceId})`)
          console.log(BAR)
          console.log(`  x ${response.error || "unknown error"}\n`)
          continue
        }
        ok++
        process.stdout.write(formatNewsForTerminal(response.items, name, sourceId, ITEMS_PER_SOURCE))
      } catch (err) {
        failed++
        console.log(BAR)
        console.log(`  ${name}  (${sourceId})`)
        console.log(BAR)
        console.log(`  x ${err instanceof Error ? err.message : String(err)}\n`)
      }
    }
  } finally {
    console.error = realError
  }

  console.log(RULE)
  console.log(`Done: ${ok} ok, ${failed} failed, ${sources.length} total\n`)
  closeCache()
}

main().catch((err) => {
  console.error(err)
  closeCache()
  process.exit(1)
})
