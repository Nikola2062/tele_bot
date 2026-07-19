import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

interface JuejinResponse {
  data: {
    content: {
      title: string
      content_id: string
    }
  }[]
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = `https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot&spider=0`
  
  try {
    const res: JuejinResponse = await myFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://juejin.cn/'
      }
    })
    
    if (!res?.data) {
      throw new Error('Invalid response format')
    }
    
    return res.data.map((item) => {
      const url = `https://juejin.cn/post/${item.content.content_id}`
      return {
        id: item.content.content_id,
        title: item.content.title,
        url
      }
    })
  } catch (error) {
    console.error('Failed to fetch Juejin trending:', error)
    throw error
  }
})