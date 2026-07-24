import type { NewsItem } from "@shared/types"
import { defineSource, myFetch, proxyPicture } from "@utils/index"

interface WeiboResponse {
  ok: number
  data: {
    cards: Array<{
      card_group: Array<{
        card_type: number
        desc?: string
        desc_extr?: string | number
        scheme: string
        icon?: string
        actionlog?: {
          ext: string
        }
      }>
    }>
  }
}

export default defineSource(async (): Promise<NewsItem[]> => {
  const url = "https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot"
  
  try {
    const res: WeiboResponse = await myFetch(url, {
      headers: {
        'Referer': 'https://m.weibo.cn/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      }
    })
    
    if (!res?.data?.cards?.[0]?.card_group) {
      throw new Error('Invalid response format')
    }
    
    return res.data.cards[0].card_group
      .filter((item, index) => {
        // Skip first item and filter out ads and empty descriptions
        return index !== 0 && 
               item.desc && 
               !item.actionlog?.ext?.includes("ads_word")
      })
      .map((item) => ({
        id: item.desc!,
        title: item.desc!,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${item.desc}#`)}`,
        mobileUrl: item.scheme,
        extra: {
          // desc_extr is a heat value / status tag (热 / 新 / 沸 / a number) —
          // the only extra signal a hot-search keyword row carries.
          info: item.desc_extr != null && `${item.desc_extr}`.trim()
            ? `🔥 ${item.desc_extr}`
            : undefined,
          icon: item.icon ? {
            url: proxyPicture(item.icon),
            scale: 1.5
          } : undefined
        }
      }))
  } catch (error) {
    console.error('Failed to fetch Weibo trending:', error)
    throw error
  }
})