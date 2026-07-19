import { $fetch } from "ofetch"
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

// RSS utilities
export async function rss2json(url: string) {
  // Simplified RSS to JSON conversion
  try {
    const response = await myFetch(url)
    // This would need a proper RSS parser implementation
    // For now, return empty to maintain interface
    return { items: [] }
  } catch (error) {
    consola.error('RSS parsing failed:', error)
    return { items: [] }
  }
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