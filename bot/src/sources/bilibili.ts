import type { NewsItem } from "../shared/types"
import { defineSource, myFetch, proxyPicture } from "../utils/index"

interface BilibiliHotSearchResponse {
  code: number
  exp_str: string
  list: {
    hot_id: number
    keyword: string
    show_name: string
    score: number
    word_type: number
    goto_type: number
    goto_value: string
    icon: string
    live_id: any[]
    call_reason: number
    heat_layer: string
    pos: number
    id: number
    status: string
    name_type: string
    resource_id: number
    set_gray: number
    card_values: any[]
    heat_score: number
    stat_datas: {
      etime: string
      stime: string
      is_commercial: string
    }
  }[]
  top_list: any[]
  hotword_egg_info: string
  seid: string
  timestamp: number
  total_count: number
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://s.search.bilibili.com/main/hotword?limit=30"
  
  try {
    const res: BilibiliHotSearchResponse = await myFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'application/json'
      }
    })
    
    if (!res?.list) {
      throw new Error('Invalid response format')
    }
    
    return res.list.map(item => ({
      id: item.keyword,
      title: item.show_name,
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword)}`,
      extra: {
        icon: item.icon ? proxyPicture(item.icon) : undefined,
        info: `🔥 ${item.heat_score || item.score}`
      }
    }))
  } catch (error) {
    console.error('Failed to fetch Bilibili trending:', error)
    throw error
  }
})