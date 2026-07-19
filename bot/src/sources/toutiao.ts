import type { NewsItem } from "../shared/types"
import { defineSource, myFetch, proxyPicture } from "../utils/index"

interface ToutiaoResponse {
  data: {
    ClusterIdStr: string
    Title: string
    HotValue: string
    Image: {
      url: string
    }
    LabelUri?: {
      url: string
    }
  }[]
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc"
  
  try {
    const res: ToutiaoResponse = await myFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.toutiao.com/',
        'Accept': 'application/json'
      }
    })
    
    if (!res?.data) {
      throw new Error('Invalid response format')
    }
    
    return res.data.map((item) => ({
      id: item.ClusterIdStr,
      title: item.Title,
      url: `https://www.toutiao.com/trending/${item.ClusterIdStr}/`,
      extra: {
        icon: item.LabelUri?.url ? proxyPicture(item.LabelUri.url) : undefined,
        info: item.HotValue ? `🔥 ${item.HotValue}` : undefined
      }
    }))
  } catch (error) {
    console.error('Failed to fetch 今日头条:', error)
    throw error
  }
})