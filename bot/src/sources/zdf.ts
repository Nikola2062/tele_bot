import type { NewsItem } from "../shared/types"
import { defineSource, fetchRSS } from "../utils/index"

// ZDFheute — Nachrichten (Deutsch)
export default defineSource(async (): Promise<NewsItem[]> => {
  return fetchRSS("https://www.zdfheute.de/rss/zdf/nachrichten")
})
