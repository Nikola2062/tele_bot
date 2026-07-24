import type { NewsItem } from "../shared/types"
import { defineSource, fetchRSS } from "../utils/index"

// ARD / Tagesschau — alle Meldungen (Deutsch)
export default defineSource(async (): Promise<NewsItem[]> => {
  return fetchRSS("https://www.tagesschau.de/index~rss2.xml")
})
