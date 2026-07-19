import { load } from "cheerio"
import type { NewsItem } from "@shared/types"
import { defineSource, myFetch } from "@utils/index"

export default defineSource(async (): Promise<NewsItem[]> => {
  const baseURL = "https://github.com"
  
  try {
    const html = await myFetch("https://github.com/trending?spoken_language_code=", {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    const $ = load(html)
    const $main = $("main .Box div[data-hpc] > article")
    const news: NewsItem[] = []
    
    $main.each((_, el) => {
      const $el = $(el)
      const $titleLink = $el.find("> h2 a")
      const title = $titleLink.text().replace(/\n+/g, "").trim()
      const url = $titleLink.attr("href")
      const star = $el.find("[href$=stargazers]").text().replace(/\s+/g, "").trim()
      const desc = $el.find("> p").text().replace(/\n+/g, "").trim()
      const language = $el.find("[itemprop='programmingLanguage']").text().trim()
      
      if (url && title) {
        news.push({
          url: `${baseURL}${url}`,
          title,
          id: url,
          extra: {
            info: `⭐ ${star}${language ? ` • ${language}` : ''}`,
            hover: desc || undefined
          }
        })
      }
    })
    
    return news
  } catch (error) {
    console.error('Failed to fetch GitHub trending:', error)
    throw error
  }
})