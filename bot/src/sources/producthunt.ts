import { load } from "cheerio"
import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

export default defineSource(async (): Promise<NewsItem[]> => {
  const baseURL = "https://www.producthunt.com"
  
  try {
    const html = await myFetch(baseURL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    })
    
    const $ = load(html)
    const $main = $("[data-test=homepage-section-0] [data-test^=post-item]")
    const news: NewsItem[] = []
    
    $main.each((_, el) => {
      const $el = $(el)
      const $link = $el.find("a").first()
      const url = $link.attr("href")
      const title = $el.find("a[data-test^=post-name]").text().replace(/^\d+\.\s*/, "")
      const id = $el.attr("data-test")?.replace("post-item-", "")
      const vote = $el.find("[data-test=vote-button]").text()
      
      if (url && id && title) {
        news.push({
          url: `${baseURL}${url}`,
          title,
          id,
          extra: {
            info: `△ ${vote}`
          }
        })
      }
    })
    
    return news
  } catch (error) {
    console.error('Failed to fetch Product Hunt:', error)
    throw error
  }
})