import { $fetch } from "ofetch"
import { XMLParser } from "fast-xml-parser"
import type { NewsItem } from "../shared/types"
import { consola } from "consola"
import process from "node:process"

// Enhanced fetch function similar to newsnow's myFetch
export async function myFetch(url: string, options: any = {}) {
  try {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    const fetchOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      },
      timeout: 10000 // 10 second timeout
    }

    const response = await $fetch(url, fetchOptions)
    return response
  } catch (error) {
    consola.error(`Failed to fetch ${url}:`, error)
    throw error
  }
}

// Source definition utility
export function defineSource(source: () => Promise<NewsItem[]>) {
  return source
}

// RSS utilities ---------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
})

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Decode HTML entities left over after XML parsing. Some feeds (e.g. ZDF)
 * double-encode, so a title arrives as "T&#252;rkei" — decode numeric
 * (&#252; / &#xF6;) and the common named entities to real characters.
 */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
    "&hellip;": "…", "&laquo;": "«", "&raquo;": "»", "&szlig;": "ß",
  }
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-zA-Z]+;/g, m => named[m] ?? m)
}

/** Extract plain text from a node that may be a string, number, CDATA object or attribute-bearing object. */
function nodeText(node: any): string {
  if (node == null) return ""
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (typeof node === "object") return node["#text"] ?? node["@_href"] ?? ""
  return String(node)
}

/** Resolve a link from RSS 2.0 (<link>text), RDF (<link>text) or Atom (<link href=…>) shapes. */
function nodeLink(link: any): string {
  if (Array.isArray(link)) {
    const alternate = link.find(l => l?.["@_rel"] === "alternate") ?? link.find(l => l?.["@_href"])
    return alternate?.["@_href"] ?? nodeText(link[0])
  }
  if (link && typeof link === "object") return link["@_href"] ?? link["#text"] ?? ""
  return nodeText(link)
}

/**
 * Fetch and parse an RSS 2.0 / RDF (RSS 1.0) / Atom feed into NewsItem[].
 * Shared by all broadcaster sources (BBC, DW, ARD/Tagesschau, ZDF).
 */
export async function fetchRSS(url: string, options: any = {}): Promise<NewsItem[]> {
  const raw = await myFetch(url, { ...options, responseType: "text" })
  const xml = typeof raw === "string" ? raw : String(raw)
  const parsed = xmlParser.parse(xml)

  let rawItems: any[] = []
  if (parsed?.rss?.channel) rawItems = asArray(parsed.rss.channel.item)      // RSS 2.0
  else if (parsed?.["rdf:RDF"]) rawItems = asArray(parsed["rdf:RDF"].item)   // RDF / RSS 1.0 (DW)
  else if (parsed?.feed) rawItems = asArray(parsed.feed.entry)               // Atom
  else if (parsed?.channel) rawItems = asArray(parsed.channel.item)

  const items: NewsItem[] = []
  const seen = new Set<string>()

  for (const it of rawItems) {
    const title = decodeEntities(nodeText(it.title)).replace(/\s+/g, " ").trim()
    const url = nodeLink(it.link) || nodeText(it.guid) || nodeText(it.id)
    if (!title || !url || seen.has(url)) continue
    seen.add(url)

    const item: NewsItem = {
      id: nodeText(it.guid) || nodeText(it.id) || url,
      title,
      url,
    }

    // RSS <description> / Atom <summary> — a 1-2 sentence teaser. Strip any
    // HTML markup and decode entities, then drop it if it is empty or merely
    // repeats the title.
    const rawSummary = nodeText(it.description || it.summary || it["content:encoded"])
    if (rawSummary) {
      const summary = decodeEntities(rawSummary.replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
      if (summary && summary.toLowerCase() !== title.toLowerCase()) {
        item.description = summary
      }
    }

    const dateStr = nodeText(it.pubDate || it["dc:date"] || it.published || it.updated || it.date)
    if (dateStr) {
      const t = new Date(dateStr).getTime()
      if (!Number.isNaN(t)) item.pubDate = t
    }

    items.push(item)
  }

  return items
}

// Date parsing utilities
export function parseRelativeDate(dateStr: string, timezone: string = "Asia/Shanghai"): Date {
  const now = new Date()
  
  // Handle Chinese relative date formats
  if (dateStr.includes('分钟前')) {
    const minutes = parseInt(dateStr.match(/(\d+)分钟前/)?.[1] || '0')
    return new Date(now.getTime() - minutes * 60 * 1000)
  }
  
  if (dateStr.includes('小时前')) {
    const hours = parseInt(dateStr.match(/(\d+)小时前/)?.[1] || '0')
    return new Date(now.getTime() - hours * 60 * 60 * 1000)
  }
  
  if (dateStr.includes('天前')) {
    const days = parseInt(dateStr.match(/(\d+)天前/)?.[1] || '0')
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  }
  
  // Try to parse as regular date
  return new Date(dateStr)
}

// Proxy picture URL if needed
export function proxyPicture(url: string): string {
  // For telegram bot, we might want to proxy images through our own server
  // For now, return original URL
  return url
}

// Sanitize text for Telegram
export function sanitizeForTelegram(text: string): string {
  // Remove HTML tags and escape special characters
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace HTML entities
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

// Format news items for Telegram display
export function formatNewsForTelegram(items: NewsItem[], sourceName: string, limit: number = 10): string {
  if (!items || items.length === 0) {
    return `No news available from ${sourceName} right now.`
  }

  let message = `**Latest from ${sourceName}**\n\n`

  items.slice(0, limit).forEach((item, index) => {
    const title = sanitizeForTelegram(item.title)
    const url = item.mobileUrl || item.url

    let extraInfo = ''
    if (item.extra?.info) {
      extraInfo = ` - ${item.extra.info}`
    }

    message += `${index + 1}. [${title}](${url})${extraInfo}\n\n`
  })

  return message
}

/** Compact terminal dump used by `python latest_news.py` / `npm run latest`. */
export function formatNewsForTerminal(items: NewsItem[], sourceName: string, sourceId: string, limit: number = 8): string {
  const width = 56
  const bar = "=".repeat(width)
  const lines: string[] = [
    bar,
    `  ${sourceName}  (${sourceId})`,
    bar,
  ]

  if (!items || items.length === 0) {
    lines.push("  (no items)")
    lines.push("")
    return lines.join("\n")
  }

  items.slice(0, limit).forEach((item, index) => {
    const title = sanitizeForTelegram(item.title).replace(/\s+/g, " ")
    const url = item.mobileUrl || item.url || ""
    const info = item.extra?.info ? `  - ${item.extra.info}` : ""
    lines.push(`  ${String(index + 1).padStart(2)}. ${title}${info}`)
    if (url) lines.push(`      ${url}`)
  })
  lines.push("")
  return lines.join("\n")
}

// Logger setup
export const logger = consola.create({
  level: process.env.LOG_LEVEL === 'debug' ? 4
    : process.env.LOG_LEVEL === 'silent' ? -999
    : 3
})

// Environment utilities
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name]
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is required`)
  }
  return value || defaultValue || ''
}

// Time constants
export const Time = {
  Realtime: 2 * 60 * 1000,      // 2 minutes
  Fast: 5 * 60 * 1000,          // 5 minutes  
  Default: 10 * 60 * 1000,      // 10 minutes
  Common: 30 * 60 * 1000,       // 30 minutes
  Slow: 60 * 60 * 1000,         // 1 hour
}