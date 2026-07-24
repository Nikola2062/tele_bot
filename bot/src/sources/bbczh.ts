import type { NewsItem } from "../shared/types"
import { defineSource, fetchRSS } from "../utils/index"

// BBC 中文网 (BBC Chinese). The simplified feed now redirects to this one.
export default defineSource(async (): Promise<NewsItem[]> => {
  return fetchRSS("https://feeds.bbci.co.uk/zhongwen/trad/rss.xml")
})
