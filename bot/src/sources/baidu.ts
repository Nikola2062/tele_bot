import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

interface BaiduResponse {
  data: {
    cards: {
      content: {
        isTop?: boolean
        word: string
        rawUrl: string
        desc?: string
      }[]
    }[]
  }
}

export default defineSource(async (): Promise<NewsItem[]> => {
  try {
    const rawData = await myFetch(`https://top.baidu.com/board?tab=realtime`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    }) as string
    
    const jsonMatch = rawData.match(/<!--s-data:(.*?)-->/s)
    if (!jsonMatch) {
      throw new Error('Could not extract data from Baidu response')
    }
    
    const data: BaiduResponse = JSON.parse(jsonMatch[1])
    
    if (!data?.data?.cards?.[0]?.content) {
      throw new Error('Invalid Baidu response format')
    }
    
    return data.data.cards[0].content
      .filter(item => !item.isTop) // Remove pinned items
      .map((item) => ({
        id: item.rawUrl,
        title: item.word,
        url: item.rawUrl,
        extra: {
          hover: item.desc
        }
      }))
  } catch (error) {
    console.error('Failed to fetch Baidu trending:', error)
    throw error
  }
})