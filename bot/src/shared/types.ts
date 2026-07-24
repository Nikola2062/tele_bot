// Core types adapted from newsnow for Telegram bot
export type Color = "primary" | "blue" | "red" | "green" | "yellow" | "orange" | "purple" | "pink" | "indigo" | "gray" | "slate"

export interface NewsItem {
  id: string | number // unique
  title: string
  url: string
  mobileUrl?: string
  /** Short summary/snippet (e.g. RSS <description>), cleaned of HTML. */
  description?: string
  pubDate?: number | string
  extra?: {
    hover?: string
    date?: number | string
    info?: false | string
    diff?: number
    icon?: false | string | {
      url: string
      scale: number
    }
  }
}

export interface SourceResponse {
  status: "success" | "cache" | "error"
  id: SourceID
  updatedTime: number | string
  items: NewsItem[]
  error?: string
}

export interface Source {
  name: string
  /**
   * 刷新的间隔时间 (milliseconds)
   */
  interval: number
  color: Color

  /**
   * Subtitle 小标题
   */
  title?: string
  desc?: string
  /**
   * Default normal timeline
   */
  type?: "hottest" | "realtime"
  home?: string
  /**
   * @default false
   */
  disable?: boolean
}

// Define available source IDs based on newsnow sources
export type SourceID = 
  | "douyin"
  | "weibo" 
  | "zhihu"
  | "v2ex"
  | "github"
  | "hackernews"
  | "ithome"
  | "hupu"
  | "tieba"
  | "toutiao"
  | "thepaper"
  | "coolapk"
  | "wallstreetcn"
  | "36kr"
  | "baidu"
  | "bilibili"
  | "fastbull"
  | "gelonghui"
  | "jin10"
  | "juejin"
  | "producthunt"
  | "solidot"
  | "xueqiu"
  | "zaobao"
  | "cankaoxiaoxi"
  | "sputniknewscn"
  | "mktnews"
  | "smzdm"
  | "sspai"
  | "chongbuluo"
  | "ifeng"
  | "kaopu"
  | "kuaishou"
  | "linuxdo"
  | "nowcoder"
  | "pcbeta"
  // International broadcasters (RSS)
  | "bbcworld"
  | "bbczh"
  | "dw"
  | "dwde"
  | "dwzh"
  | "tagesschau"
  | "zdf"

export interface CacheInfo {
  id: SourceID
  items: NewsItem[]
  updated: number
}

export interface CacheRow {
  id: SourceID
  data: string
  updated: number
}

export type SourceGetter = () => Promise<NewsItem[]>

// Telegram specific types
export interface BotCommand {
  command: string
  description: string
}

export interface UserMessage {
  userId: number
  username?: string
  firstName?: string
  lastName?: string
  messageId: number
  text: string
  timestamp: number
}

export interface BotResponse {
  text: string
  parseMode?: "HTML" | "Markdown" | "MarkdownV2"
  replyMarkup?: any
  disablePreview?: boolean
}