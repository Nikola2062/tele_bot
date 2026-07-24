import type { NewsItem } from "../shared/types"
import { defineSource, fetchRSS } from "../utils/index"

// BBC News — World edition (English)
export default defineSource(async (): Promise<NewsItem[]> => {
  return fetchRSS("https://feeds.bbci.co.uk/news/world/rss.xml")
})
