import { load } from "cheerio"
import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

export default defineSource(async (): Promise<NewsItem[]> => {
  const baseURL = "https://news.ycombinator.com"
  
  try {
    const html = await myFetch(baseURL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    })
    
    const $ = load(html)
    const $main = $(".athing")
    const news: NewsItem[] = []
    
    $main.each((_, el) => {
      const $el = $(el)
      const $titleLink = $el.find(".titleline a").first()
      const title = $titleLink.text()
      const id = $el.attr("id")
      const score = $(`#score_${id}`).text()
      const url = `${baseURL}/item?id=${id}`
      
      if (url && id && title) {
        news.push({
          url,
          title,
          id,
          extra: {
            info: score || undefined
          }
        })
      }
    })
    
    return news
  } catch (error) {
    console.error('Failed to fetch Hacker News:', error)
    throw error
  }
})