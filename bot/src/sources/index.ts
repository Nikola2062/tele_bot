import type { SourceID, SourceGetter } from "../shared/types"

// Import all source implementations
import douyinSource from "./douyin"
import weiboSource from "./weibo" 
import githubSource from "./github"
import zhihuSource from "./zhihu"
import hackernewsSource from "./hackernews"
import v2exSource from "./v2ex"
import ithomeSource from "./ithome"
import thepaperSource from "./thepaper"
import baiduSource from "./baidu"
import juejinSource from "./juejin"
import bilibiliSource from "./bilibili"
import coolapkSource from "./coolapk"
import hupuSource from "./hupu"
import producthuntSource from "./producthunt"
import toutiaoSource from "./toutiao"
import bbcworldSource from "./bbcworld"
import bbczhSource from "./bbczh"
import dwSource from "./dw"
import dwdeSource from "./dwde"
import dwzhSource from "./dwzh"
import tagesschauSource from "./tagesschau"
import zdfSource from "./zdf"

// Source getters registry
export const sourceGetters: Record<SourceID, SourceGetter> = {
  "douyin": douyinSource,
  "weibo": weiboSource,
  "github": githubSource,
  "zhihu": zhihuSource,
  "hackernews": hackernewsSource,
  "v2ex": v2exSource,
  "ithome": ithomeSource,
  "thepaper": thepaperSource,
  "baidu": baiduSource,
  "juejin": juejinSource,
  "bilibili": bilibiliSource,
  "coolapk": coolapkSource,
  "hupu": hupuSource,
  "producthunt": producthuntSource,
  "toutiao": toutiaoSource,
  "bbcworld": bbcworldSource,
  "bbczh": bbczhSource,
  "dw": dwSource,
  "dwde": dwdeSource,
  "dwzh": dwzhSource,
  "tagesschau": tagesschauSource,
  "zdf": zdfSource,
  // Placeholder implementations for other sources
  // These should be implemented based on newsnow's source files
  "tieba": async () => { throw new Error("百度贴吧 source not implemented yet") },
  "wallstreetcn": async () => { throw new Error("华尔街见闻 source not implemented yet") },
  "36kr": async () => { throw new Error("36氪 source not implemented yet") },
  "fastbull": async () => { throw new Error("快讯 source not implemented yet") },
  "gelonghui": async () => { throw new Error("格隆汇 source not implemented yet") },
  "jin10": async () => { throw new Error("金十数据 source not implemented yet") },
  "solidot": async () => { throw new Error("Solidot source not implemented yet") },
  "xueqiu": async () => { throw new Error("雪球 source not implemented yet") },
  "zaobao": async () => { throw new Error("联合早报 source not implemented yet") },
  "cankaoxiaoxi": async () => { throw new Error("参考消息 source not implemented yet") },
  "sputniknewscn": async () => { throw new Error("卫星通讯社 source not implemented yet") },
  "mktnews": async () => { throw new Error("MKTNews source not implemented yet") },
  "smzdm": async () => { throw new Error("什么值得买 source not implemented yet") },
  "sspai": async () => { throw new Error("少数派 source not implemented yet") },
  "chongbuluo": async () => { throw new Error("虫部落 source not implemented yet") },
  "ifeng": async () => { throw new Error("凤凰网 source not implemented yet") },
  "kaopu": async () => { throw new Error("靠谱新闻 source not implemented yet") },
  "kuaishou": async () => { throw new Error("快手 source not implemented yet") },
  "linuxdo": async () => { throw new Error("Linux Do source not implemented yet") },
  "nowcoder": async () => { throw new Error("牛客网 source not implemented yet") },
  "pcbeta": async () => { throw new Error("远景论坛 source not implemented yet") }
}

// Get source getter function
export function getSourceGetter(sourceId: SourceID): SourceGetter | undefined {
  return sourceGetters[sourceId]
}

// Check if source is implemented
export function isSourceImplemented(sourceId: SourceID): boolean {
  const getter = sourceGetters[sourceId]
  if (!getter) return false
  
  // Check if it's a placeholder implementation
  return !getter.toString().includes("not implemented yet")
}

// Get all implemented source IDs
export function getImplementedSources(): SourceID[] {
  return Object.keys(sourceGetters).filter(id => 
    isSourceImplemented(id as SourceID)
  ) as SourceID[]
}

// Execute a source getter with error handling
export async function executeSource(sourceId: SourceID) {
  const getter = sourceGetters[sourceId]
  if (!getter) {
    throw new Error(`Source '${sourceId}' not found`)
  }
  
  try {
    const items = await getter()
    return {
      status: "success" as const,
      id: sourceId,
      updatedTime: Date.now(),
      items: items.slice(0, 30) // Limit to 30 items
    }
  } catch (error) {
    console.error(`Error executing source ${sourceId}:`, error)
    throw error
  }
}