import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

interface ThePaperResponse {
  data: {
    hotNews: {
      contId: string
      name: string
      pubTimeLong: string
      tagList?: { tag: string }[]
    }[]
  }
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar"
  
  try {
    const res: ThePaperResponse = await myFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.thepaper.cn/',
        'Accept': 'application/json'
      }
    })
    
    if (!res?.data?.hotNews) {
      throw new Error('Invalid response format')
    }
    
    return res.data.hotNews.map((item) => {
      // 澎湃 hot items are often cryptic editorial titles with no summary in
      // the payload; surface the topic tags as lightweight context instead.
      const tags = (item.tagList ?? []).map(t => t.tag).filter(Boolean).slice(0, 3)
      return {
        id: item.contId,
        title: item.name,
        url: `https://www.thepaper.cn/newsDetail_forward_${item.contId}`,
        mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${item.contId}`,
        extra: tags.length ? { info: `#${tags.join(" #")}` } : undefined
      }
    })
  } catch (error) {
    console.error('Failed to fetch 澎湃新闻:', error)
    throw error
  }
})