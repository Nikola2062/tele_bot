import { load } from "cheerio"
import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

interface CoolapkResponse {
  data: {
    id: string
    message: string
    editor_title: string
    url: string
    entityType: string
    pubDate: string
    dateline: number
    targetRow: {
      subTitle: string
    }
  }[]
}

// Simplified headers generation for CoolApk API
function generateCoolapkHeaders() {
  const timestamp = Math.floor(Date.now() / 1000)
  return {
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 11; M2102K1AC Build/RKQ1.200826.002) (#Build; CoolMarket; 12.4.2; 2112031; 5.0; 0)',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Sdk-Int': '30',
    'X-Sdk-Locale': 'zh-CN',
    'X-App-Id': 'com.coolapk.market',
    'X-App-Token': generateToken(),
    'X-App-Version': '12.4.2',
    'X-App-Code': '2112031',
    'X-Api-Version': '12',
    'Accept': 'application/json',
    'Content-Type': 'application/json; charset=utf-8'
  }
}

// Simple token generation (simplified version)
function generateToken(): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
  return `${timestamp}${deviceId}`.substr(0, 32)
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://api.coolapk.com/v6/page/dataList?url=%2Ffeed%2FstatList%3FcacheExpires%3D300%26statType%3Dday%26sortField%3Ddetailnum%26title%3D%E4%BB%8A%E6%97%A5%E7%83%AD%E9%97%A8&title=%E4%BB%8A%E6%97%A5%E7%83%AD%E9%97%A8&subTitle=&page=1"
  
  try {
    const res: CoolapkResponse = await myFetch(url, {
      headers: generateCoolapkHeaders()
    })
    
    if (!res?.data?.length) {
      throw new Error('Invalid response format or no data')
    }
    
    return res.data
      .filter(item => item.id) // Filter valid items
      .map(item => {
        const title = item.editor_title || load(item.message).text().split("\n")[0] || item.message.substring(0, 50)
        // The full post text is already in the payload; use it as a teaser
        // when it adds something beyond the (often derived) title.
        const body = item.message ? load(item.message).text().replace(/\s+/g, " ").trim() : ""
        return {
          id: item.id,
          title,
          url: `https://www.coolapk.com${item.url}`,
          description: body && body !== title.trim() ? body : undefined,
          extra: {
            info: item.targetRow?.subTitle
          }
        }
      })
  } catch (error) {
    console.error('Failed to fetch CoolApk trending:', error)
    throw error
  }
})