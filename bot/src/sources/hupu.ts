import type { NewsItem } from "../shared/types"
import { defineSource, myFetch } from "../utils/index"

export default defineSource(async (): Promise<NewsItem[]> => {
  try {
    const html = await myFetch(`https://bbs.hupu.com/topic-daily-hot`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    }) as string
    
    // Regular expression to match the hot list items
    const regex = /<li class="bbs-sl-web-post-body">[\s\S]*?<a href="(\/[^"]+?\.html)"[^>]*?class="p-title"[^>]*>([^<]+)<\/a>/g
    
    const result: NewsItem[] = []
    let match
    
    while ((match = regex.exec(html)) !== null) {
      const [, path, title] = match
      
      // Build complete URL
      const url = `https://bbs.hupu.com${path}`
      
      result.push({
        id: path,
        title: title.trim(),
        url,
        mobileUrl: url
      })
    }
    
    return result
  } catch (error) {
    console.error('Failed to fetch 虎扑:', error)
    throw error
  }
})