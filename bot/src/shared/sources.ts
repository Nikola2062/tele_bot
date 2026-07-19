import type { Source, SourceID } from "@shared/types"
import { Time } from "@utils/index"

// Source definitions based on newsnow's pre-sources.ts
export const sources: Record<SourceID, Source> = {
  "douyin": {
    name: "抖音",
    interval: Time.Default,
    type: "hottest",
    color: "gray",
    desc: "抖音热搜榜"
  },
  "weibo": {
    name: "微博",
    title: "实时热搜",
    type: "hottest",
    color: "red",
    interval: Time.Realtime
  },
  "zhihu": {
    name: "知乎",
    type: "hottest",
    color: "blue",
    interval: Time.Default
  },
  "v2ex": {
    name: "V2EX",
    color: "slate",
    interval: Time.Default
  },
  "github": {
    name: "GitHub",
    title: "Trending",
    color: "gray",
    interval: Time.Default
  },
  "hackernews": {
    name: "Hacker News",
    color: "orange",
    interval: Time.Default
  },
  "ithome": {
    name: "IT之家",
    color: "red",
    type: "realtime",
    interval: Time.Default
  },
  "hupu": {
    name: "虎扑",
    title: "主干道热帖",
    type: "hottest",
    color: "red",
    interval: Time.Default
  },
  "tieba": {
    name: "百度贴吧",
    title: "热议",
    type: "hottest",
    color: "blue",
    interval: Time.Default
  },
  "toutiao": {
    name: "今日头条",
    type: "hottest",
    color: "red",
    interval: Time.Default
  },
  "thepaper": {
    name: "澎湃新闻",
    interval: Time.Common,
    type: "hottest",
    title: "热榜",
    color: "gray"
  },
  "coolapk": {
    name: "酷安",
    type: "hottest",
    color: "green",
    title: "今日最热",
    interval: Time.Default
  },
  "wallstreetcn": {
    name: "华尔街见闻",
    color: "blue",
    interval: Time.Common
  },
  "36kr": {
    name: "36氪",
    type: "realtime",
    color: "blue",
    interval: Time.Default
  },
  "baidu": {
    name: "百度",
    title: "热搜",
    type: "hottest",
    color: "blue",
    interval: Time.Realtime
  },
  "bilibili": {
    name: "哔哩哔哩",
    title: "热门",
    type: "hottest",
    color: "pink",
    interval: Time.Default
  },
  "fastbull": {
    name: "快讯",
    color: "blue",
    interval: Time.Fast
  },
  "gelonghui": {
    name: "格隆汇",
    color: "blue",
    interval: Time.Default
  },
  "jin10": {
    name: "金十数据",
    color: "yellow",
    interval: Time.Fast
  },
  "juejin": {
    name: "掘金",
    color: "blue",
    interval: Time.Default
  },
  "producthunt": {
    name: "Product Hunt",
    color: "orange",
    interval: Time.Default
  },
  "solidot": {
    name: "Solidot",
    color: "green",
    interval: Time.Default
  },
  "xueqiu": {
    name: "雪球",
    color: "blue",
    interval: Time.Default
  },
  "zaobao": {
    name: "联合早报",
    interval: Time.Common,
    type: "realtime",
    color: "red"
  },
  "cankaoxiaoxi": {
    name: "参考消息",
    color: "red",
    interval: Time.Common
  },
  "sputniknewscn": {
    name: "卫星通讯社",
    color: "orange",
    interval: Time.Default
  },
  "mktnews": {
    name: "MKTNews",
    color: "indigo",
    interval: Time.Realtime
  },
  "smzdm": {
    name: "什么值得买",
    color: "red",
    interval: Time.Default
  },
  "sspai": {
    name: "少数派",
    color: "blue",
    interval: Time.Default
  },
  "chongbuluo": {
    name: "虫部落",
    color: "green",
    interval: Time.Default
  },
  "ifeng": {
    name: "凤凰网",
    color: "red",
    interval: Time.Default
  },
  "kaopu": {
    name: "靠谱新闻",
    color: "blue",
    interval: Time.Default
  },
  "kuaishou": {
    name: "快手",
    color: "yellow",
    interval: Time.Default
  },
  "linuxdo": {
    name: "Linux Do",
    color: "green",
    interval: Time.Default
  },
  "nowcoder": {
    name: "牛客网",
    color: "green",
    interval: Time.Default
  },
  "pcbeta": {
    name: "远景论坛",
    color: "blue",
    interval: Time.Default
  }
}

// Helper function to get source by ID
export function getSource(id: SourceID): Source | undefined {
  return sources[id]
}

// Get all available source IDs
export function getAllSourceIds(): SourceID[] {
  return Object.keys(sources) as SourceID[]
}

// Get source display name
export function getSourceDisplayName(id: SourceID): string {
  const source = sources[id]
  if (!source) return id
  return source.title ? `${source.name} - ${source.title}` : source.name
}