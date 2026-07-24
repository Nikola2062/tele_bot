import type { NewsItem } from "../shared/types"
import { defineSource, fetchRSS } from "../utils/index"

// Deutsche Welle — Deutsch (RDF / RSS 1.0 feed)
export default defineSource(async (): Promise<NewsItem[]> => {
  return fetchRSS("https://rss.dw.com/rdf/rss-de-all")
})
