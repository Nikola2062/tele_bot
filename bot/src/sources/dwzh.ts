import type { NewsItem } from "../shared/types"
import { defineSource, fetchRSS } from "../utils/index"

// Deutsche Welle — 中文 (RSS 2.0 feed)
export default defineSource(async (): Promise<NewsItem[]> => {
  return fetchRSS("https://rss.dw.com/xml/rss-chi-all")
})
