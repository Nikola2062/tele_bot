import { load } from "cheerio"
import type { NewsItem } from "../shared/types"
import { defineSource, myFetch, parseRelativeDate, fetchRSS } from "../utils/index"

export default defineSource(async (): Promise<NewsItem[]> => {
  try {
    const response = await myFetch("https://www.ithome.com/list/", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    })
    
    const $ = load(response)
    const $main = $("#list > div.fl > ul > li")
    const news: NewsItem[] = []
    
    $main.each((_, el) => {
      const $el = $(el)
      const $a = $el.find("a.t")
      const url = $a.attr("href")
      const title = $a.text()
      const date = $el.find("i").text()
      
      if (url && title && date) {
        // Filter out ads and promotional content
        const isAd = url?.includes("lapin") || 
                    ["神券", "优惠", "补贴", "京东", "天猫", "促销"].some(keyword => title.includes(keyword))
        
        if (!isAd) {
          news.push({
            url,
            title,
            id: url,
            pubDate: parseRelativeDate(date, "Asia/Shanghai").valueOf()
          })
        }
      }
    })
    
    // The /list/ page carries only titles. The RSS feed carries a full
    // article body per item under the same article URL, so join them by URL
    // (one extra list call, no per-article fetches) to add a teaser.
    try {
      const rss = await fetchRSS("https://www.ithome.com/rss/")
      const byUrl = new Map(rss.filter(it => it.description).map(it => [it.url, it.description!]))
      for (const item of news) {
        const desc = byUrl.get(item.url)
        if (desc) item.description = desc
      }
    } catch (error) {
      console.error('IT之家 RSS enrichment failed (keeping titles):', error)
    }

    // Sort by publication date (most recent first)
    return news.sort((a, b) => (Number(b.pubDate) || 0) - (Number(a.pubDate) || 0))
  } catch (error) {
    console.error('Failed to fetch IT之家:', error)
    throw error
  }
})