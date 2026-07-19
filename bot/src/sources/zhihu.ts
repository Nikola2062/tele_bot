import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

interface ZhihuResponse {
  data: {
    type: "hot_list_feed"
    style_type: "1"
    feed_specific: {
      answer_count: number
    }
    target: {
      title_area: {
        text: string
      }
      excerpt_area: {
        text: string
      }
      image_area: {
        url: string
      }
      metrics_area: {
        text: string
        font_color: string
        background: string
        weight: string
      }
      label_area: {
        type: "trend"
        trend: number
        night_color: string
        normal_color: string
      }
      link: {
        url: string
      }
    }
  }[]
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=20&desktop=true"
  
  try {
    const res: ZhihuResponse = await myFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.zhihu.com/',
        'Accept': 'application/json, text/plain, */*'
      }
    })
    
    if (!res?.data) {
      throw new Error('Invalid response format')
    }
    
    return res.data.map((item) => ({
      id: item.target.link.url.match(/(\d+)$/)?.[1] ?? item.target.link.url,
      title: item.target.title_area.text,
      url: item.target.link.url,
      extra: {
        info: item.target.metrics_area.text,
        hover: item.target.excerpt_area.text
      }
    }))
  } catch (error) {
    console.error('Failed to fetch Zhihu trending:', error)
    throw error
  }
})