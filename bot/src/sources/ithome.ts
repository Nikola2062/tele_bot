import { load } from "cheerio"
import type { NewsItem } from "../shared/types"
import { defineSource, myFetch, parseRelativeDate } from "../utils/index"

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
    
    // Sort by publication date (most recent first)
    return news.sort((a, b) => (Number(b.pubDate) || 0) - (Number(a.pubDate) || 0))
  } catch (error) {
    console.error('Failed to fetch IT之家:', error)
    throw error
  }
})