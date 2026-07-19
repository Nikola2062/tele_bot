import type { NewsItem } from "@shared/types"
import { defineSource, myFetch } from "@utils/index"

interface DouyinResponse {
  data: {
    word_list: {
      sentence_id: string
      word: string
      event_time: string
      hot_value: string
    }[]
  }
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1"
  
  try {
    // First get cookie from login page
    const cookieResponse = await myFetch("https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383", {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    })
    
    // Extract cookies from response headers
    let cookies = ''
    if (cookieResponse && typeof cookieResponse === 'object') {
      // This is a simplified cookie extraction - in real implementation,
      // you'd need to properly parse Set-Cookie headers
      cookies = 'ttwid=1%7C; msToken=; __ac_signature=_02B4Z6wo00f01'
    }
    
    const res: DouyinResponse = await myFetch(url, {
      headers: {
        'Cookie': cookies,
        'Referer': 'https://www.douyin.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    if (!res?.data?.word_list) {
      throw new Error('Invalid response format')
    }
    
    return res.data.word_list.map((item) => ({
      id: item.sentence_id,
      title: item.word,
      url: `https://www.douyin.com/hot/${item.sentence_id}`,
      extra: {
        info: item.hot_value ? `🔥 ${item.hot_value}` : undefined,
        date: item.event_time ? new Date(item.event_time).getTime() : undefined
      }
    }))
  } catch (error) {
    console.error('Failed to fetch Douyin trending:', error)
    throw error
  }
})