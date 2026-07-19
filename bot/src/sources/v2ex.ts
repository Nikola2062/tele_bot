import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

interface V2exResponse {
  version: string
  title: string
  description: string
  home_page_url: string
  feed_url: string
  icon: string
  favicon: string
  items: {
    url: string
    date_modified?: string
    content_html: string
    date_published: string
    title: string
    id: string
  }[]
}

export default defineSource(async (): Promise<NewsItem[]> => {
  try {
    const feedUrls = ["create", "ideas", "programmer", "share"]
    const promises = feedUrls.map(feed => 
      myFetch(`https://www.v2ex.com/feed/${feed}.json`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json'
        }
      }) as Promise<V2exResponse>
    )
    
    const responses = await Promise.all(promises)
    
    // Combine all items from different feeds
    const allItems = responses
      .map(response => response.items)
      .flat()
      .map(item => ({
        id: item.id,
        title: item.title,
        url: item.url,
        extra: {
          date: new Date(item.date_modified ?? item.date_published).getTime()
        }
      }))
      // Sort by date (most recent first)
      .sort((a, b) => (b.extra?.date || 0) - (a.extra?.date || 0))
    
    return allItems
  } catch (error) {
    console.error('Failed to fetch V2EX:', error)
    throw error
  }
})