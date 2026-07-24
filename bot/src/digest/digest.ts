import type { Telegram } from "telegraf"
import type { NewsItem, SourceID } from "../shared/types"
import { sourceManager } from "../shared/sourceManager"
import { getSourceDisplayName } from "../shared/sources"
import { logger } from "../utils/index"
import { berlinNow } from "./time"
import { filterUnseen, markSeen } from "./state"
import { clusteringEnabled, clusterStories, type Cluster, type DigestEntry } from "./cluster"

/**
 * Builds and delivers the daily news digest — the push counterpart to the
 * papers digest. Covers every implemented source, organised into categories
 * (World broadcasters, Tech & Dev, China trending), one fixed set for every
 * subscriber.
 *
 * Design goals, aligned with the QA criteria:
 *  - Informative: real headlines + RSS teaser under each, grouped by source.
 *  - Original language: titles/summaries are delivered verbatim (DE / EN / ZH),
 *    never translated or transliterated. A flag marks each source's language.
 *  - Complete: full titles (no truncation) with clickable links; long digests
 *    are split across several messages rather than cut off.
 *
 * Delivery uses HTML parse_mode so arbitrary multilingual titles — which may
 * contain Markdown-significant characters like []() _ * — render intact.
 */

interface DigestGroup {
  /** Banner shown above the first source of the group. */
  banner: string
  sources: SourceID[]
}

/**
 * Digest layout: category banner → ordered sources within it.
 *
 * Grouped by how informative each source is (see the source getters + the
 * enrichment work in sources/*.ts):
 *  - "World" and "In depth": every item carries a prose summary/excerpt.
 *  - "Trending & headlines": title-only or heat/points tag — these sources
 *    expose no per-item summary cheaply (verified: 微博/虎扑/澎湃/掘金 have none
 *    in-list), so they are aligned together at the end.
 */
const DIGEST_GROUPS: DigestGroup[] = [
  { banner: "🌍 World · with summaries", sources: ["tagesschau", "zdf", "dwde", "bbcworld", "dw", "bbczh", "dwzh"] },
  { banner: "📖 In depth · with summaries", sources: ["github", "zhihu", "baidu", "ithome", "v2ex", "coolapk"] },
  { banner: "🔥 Trending & headlines", sources: ["hackernews", "producthunt", "toutiao", "douyin", "bilibili", "weibo", "thepaper", "juejin", "hupu"] },
]

/** All sources in the digest, flattened in display order. */
export const DIGEST_SOURCES: SourceID[] = DIGEST_GROUPS.flatMap(g => g.sources)

/** Language flag per source, shown next to the source name. */
const SOURCE_LANG: Partial<Record<SourceID, string>> = {
  tagesschau: "🇩🇪 DE", zdf: "🇩🇪 DE", dwde: "🇩🇪 DE",
  bbcworld: "🇬🇧 EN", dw: "🇬🇧 EN", hackernews: "🇬🇧 EN", github: "🇬🇧 EN", producthunt: "🇬🇧 EN",
  bbczh: "🇨🇳 ZH", dwzh: "🇨🇳 ZH", weibo: "🇨🇳 ZH", zhihu: "🇨🇳 ZH", douyin: "🇨🇳 ZH",
  baidu: "🇨🇳 ZH", toutiao: "🇨🇳 ZH", thepaper: "🇨🇳 ZH", bilibili: "🇨🇳 ZH", hupu: "🇨🇳 ZH",
  coolapk: "🇨🇳 ZH", v2ex: "🇨🇳 ZH", juejin: "🇨🇳 ZH", ithome: "🇨🇳 ZH",
}

/** How many headlines per source in one digest. */
const PER_SOURCE = 5
/** Telegram hard limit is 4096; leave headroom for headers/footers. */
const MAX_MESSAGE = 3800

interface SourceBlock {
  id: SourceID
  name: string
  lang: string
  items: NewsItem[]
  /** Category banner, set only on the first rendered source of each group. */
  banner?: string
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Trim a summary to `max` chars on a word boundary, adding an ellipsis. */
function snippet(text: string, max = 220): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…"
}

/**
 * The one-line teaser under a headline. RSS sources carry a <description>;
 * several trending sources instead stash a real excerpt/description in
 * extra.hover (知乎 excerpt, 百度 desc, GitHub repo description). Both are the
 * source's own prose. Dropped when empty or identical to the title.
 */
function itemProse(item: NewsItem): string | undefined {
  const hover = typeof item.extra?.hover === "string" ? item.extra.hover : ""
  const text = (item.description || hover).trim()
  if (!text || text.toLowerCase() === item.title.trim().toLowerCase()) return undefined
  return text
}

/**
 * A compact context tag appended to the headline (🔥 heat, ⭐ stars, ▲ points,
 * △ votes) — the source's own popularity metric, when it has no prose.
 */
function itemTag(item: NewsItem): string | undefined {
  const info = item.extra?.info
  return typeof info === "string" && info.trim() ? info.trim() : undefined
}

/**
 * Recurring non-news slots that broadcasters keep in their feeds every day
 * (livestreams, the "Schlagzeilen" ticker index, headline-list landing pages).
 * They carry no story and would otherwise burn a headline slot each morning.
 */
function isPlaceholder(item: NewsItem): boolean {
  const url = String(item.url || "")
  const title = item.title.trim()
  if (/\/livestreams?\//i.test(url) || /livestream-/i.test(url)) return true
  if (/\/newsticker\/schlagzeilen/i.test(url)) return true
  if (/^(livestream|liveblog)\b/i.test(title)) return true
  if (/^schlagzeilen$/i.test(title)) return true
  return false
}

/**
 * Fetch every digest source (via the cache-aware source manager) and return
 * the unseen-for-this-chat headlines, capped at PER_SOURCE per source.
 */
async function buildBlocks(chatId: number): Promise<{ blocks: SourceBlock[]; failed: number }> {
  const blocks: SourceBlock[] = []
  let failed = 0

  for (const group of DIGEST_GROUPS) {
    let bannerPending: string | undefined = group.banner
    for (const id of group.sources) {
      if (!sourceManager.isValidSource(id)) continue
      try {
        const response = await sourceManager.getSourceNews(id)
        if (response.status === "error") {
          failed++
          logger.warn(`digest: source ${id} failed: ${response.error}`)
          continue
        }
        const usable = response.items.filter(item => !isPlaceholder(item))
        const fresh = filterUnseen(chatId, usable).slice(0, PER_SOURCE)
        if (fresh.length > 0) {
          blocks.push({
            id,
            name: getSourceDisplayName(id),
            lang: SOURCE_LANG[id] ?? "",
            items: fresh,
            banner: bannerPending, // attaches to the first non-empty source of the group
          })
          bannerPending = undefined
        }
      } catch (error) {
        failed++
        logger.error(`digest: error fetching ${id}:`, error)
      }
    }
  }

  return { blocks, failed }
}

/** One source block → its HTML section (banner, source name, numbered items). */
function blockToSection(block: SourceBlock): string {
  const lang = block.lang ? ` · ${block.lang}` : ""
  const lines: string[] = []
  // Category banner sits above the first source of each group and travels
  // with that section, so it never orphans at the foot of a message.
  if (block.banner) lines.push(`<b>${escapeHtml(block.banner)}</b>\n`)
  lines.push(`<b>${escapeHtml(block.name)}</b>${lang}`)
  block.items.forEach((item, i) => {
    const url = item.mobileUrl || item.url
    const title = escapeHtml(item.title)
    const tag = itemTag(item)
    const tagSuffix = tag ? ` <i>· ${escapeHtml(tag)}</i>` : ""
    lines.push(`${i + 1}. <a href="${escapeHtml(url)}">${title}</a>${tagSuffix}`)
    // A one-line teaser under the headline, when the source provides one,
    // so the digest carries substance beyond the title alone.
    const prose = itemProse(item)
    if (prose) lines.push(`<i>${escapeHtml(snippet(prose))}</i>`)
  })
  return lines.join("\n")
}

/**
 * Greedily pack sections into messages under MAX_MESSAGE chars, prefixing each
 * with `headerFor(page, totalPages)`. Every message repeats a compact header
 * with a (page/total) marker, so a reader landing on message 2 still has context.
 */
function packPages(sections: string[], headerFor: (page: number, totalPages: number) => string): string[] {
  const HEADER_BUDGET = 140
  const pages: string[][] = []
  let page: string[] = []
  let len = 0
  for (const section of sections) {
    const add = section.length + 2
    if (page.length > 0 && len + add > MAX_MESSAGE - HEADER_BUDGET) {
      pages.push(page)
      page = []
      len = 0
    }
    page.push(section)
    len += add
  }
  if (page.length > 0) pages.push(page)

  const totalPages = pages.length
  return pages.map((sectionsOnPage, i) =>
    [headerFor(i + 1, totalPages), ...sectionsOnPage].join("\n\n")
  )
}

function digestHeader(date: string, sources: number, headlines: number, page: number, totalPages: number, note?: string): string {
  const suffix = totalPages > 1 ? ` (${page}/${totalPages})` : ""
  const noteSuffix = note ? ` · ${note}` : ""
  return (
    `🗞️ <b>News Digest</b> · ${date}${suffix}\n` +
    `${sources} sources · ${headlines} new headlines${noteSuffix}`
  )
}

/**
 * Render blocks into one or more HTML messages (the default, no-LLM layout).
 */
export function renderMessages(blocks: SourceBlock[], meta: { date: string; total: number }): string[] {
  const sections = blocks.map(blockToSection)
  return packPages(sections, (p, t) => digestHeader(meta.date, blocks.length, meta.total, p, t))
}

/**
 * Render the LLM-clustered layout: a "Top stories" section of the multi-source
 * clusters (each a one-line summary + links to every source that carried it),
 * followed by the ordinary grouped digest with those items removed so nothing
 * is shown twice. Falls back to renderMessages if there are no shared stories.
 */
export function renderClustered(
  blocks: SourceBlock[],
  entries: DigestEntry[],
  itemIndex: Map<NewsItem, number>,
  clusters: Cluster[],
  meta: { date: string; total: number }
): string[] {
  const MAX_TOP = 15
  // Distinct sources in a cluster (source name → first item from that source).
  const distinctSources = (c: Cluster): Map<string, DigestEntry> => {
    const bySource = new Map<string, DigestEntry>()
    for (const m of c.members) {
      const e = entries[m]
      if (e && !bySource.has(e.source)) bySource.set(e.source, e)
    }
    return bySource
  }
  // "Top stories" = clusters spanning ≥2 DISTINCT sources, ranked by that.
  const shared = clusters
    .map(c => ({ cluster: c, sources: distinctSources(c) }))
    .filter(x => x.sources.size >= 2)
    .sort((a, b) => b.sources.size - a.sources.size || b.cluster.members.length - a.cluster.members.length)
    .slice(0, MAX_TOP)
  if (shared.length === 0) {
    return renderMessages(blocks, meta)
  }

  const suppressed = new Set<number>(shared.flatMap(x => x.cluster.members))

  const topLines: string[] = ["<b>📌 Top stories · shared across sources</b>"]
  shared.forEach(({ cluster, sources }, i) => {
    const links = [...sources.values()]
      .map(e => `<a href="${escapeHtml(e.url)}">${escapeHtml(e.source)}</a>`)
      .join(" · ")
    // Headline = a real source title in its ORIGINAL language (the longest one,
    // as the most descriptive), never an LLM-written/translated summary.
    const headline = cluster.members
      .map(m => entries[m]?.title ?? "")
      .reduce((best, t) => (t.length > best.length ? t : best), "")
    const summary = escapeHtml(snippet(headline, 260))
    // Distinct sources is the headline number; note item count when we merged
    // several headlines from the same outlets.
    const label = cluster.members.length > sources.size
      ? `${sources.size} sources · ${cluster.members.length} items`
      : `${sources.size} sources`
    topLines.push(`${i + 1}. ${summary} <i>· ${label}</i>`)
    topLines.push(`🔗 ${links}`)
  })
  const topSection = topLines.join("\n")

  // Drop the surfaced items from the per-source blocks (no duplication),
  // then reattach each group's banner to its first surviving block.
  const filtered: SourceBlock[] = []
  let lastBanner: string | undefined
  for (const block of blocks) {
    if (block.banner) lastBanner = block.banner
    const items = block.items.filter(it => !suppressed.has(itemIndex.get(it) ?? -1))
    if (items.length === 0) continue
    filtered.push({ ...block, items, banner: lastBanner })
    lastBanner = undefined
  }

  const sections = [topSection, ...filtered.map(blockToSection)]
  return packPages(sections, (p, t) =>
    digestHeader(meta.date, blocks.length, meta.total, p, t, `clustered · ${shared.length} shared`)
  )
}

/**
 * Build and send this chat's digest.
 *
 * @returns the number of new headlines delivered (0 = nothing new).
 */
export async function sendDigest(
  telegram: Telegram,
  chatId: number,
  opts: { notifyEmpty?: boolean } = {}
): Promise<number> {
  const { blocks, failed } = await buildBlocks(chatId)
  const total = blocks.reduce((n, b) => n + b.items.length, 0)

  if (total === 0) {
    logger.info(`digest: no new headlines for chat ${chatId}`)
    if (opts.notifyEmpty) {
      await telegram.sendMessage(chatId, "🗞️ No new headlines since your last digest.")
    }
    return 0
  }

  const { date } = berlinNow()
  const meta = { date, total }

  // Opt-in LLM clustering: if it succeeds, use the clustered layout; on any
  // failure clusterStories() returns null and we render the plain digest.
  let messages: string[]
  if (clusteringEnabled()) {
    const flat = blocks.flatMap(b => b.items.map(item => ({ block: b, item })))
    const itemIndex = new Map<NewsItem, number>(flat.map((f, i) => [f.item, i]))
    const entries: DigestEntry[] = flat.map(({ block, item }) => ({
      source: block.name,
      lang: block.lang,
      title: item.title,
      teaser: itemProse(item),
      url: item.mobileUrl || item.url,
    }))
    const clusters: Cluster[] | null = await clusterStories(entries)
    messages = clusters
      ? renderClustered(blocks, entries, itemIndex, clusters, meta)
      : renderMessages(blocks, meta)
  } else {
    messages = renderMessages(blocks, meta)
  }

  for (const message of messages) {
    await telegram.sendMessage(chatId, message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    })
  }

  // Mark delivered only after a successful send, so a failed push retries
  // the same headlines next time (mirrors the papers "mark after send" rule).
  const delivered = blocks.flatMap(b => b.items)
  markSeen(chatId, delivered)

  if (failed > 0) {
    logger.warn(`digest: delivered ${total} headlines to ${chatId}; ${failed} source(s) failed`)
  } else {
    logger.success(`digest: delivered ${total} headlines to ${chatId}`)
  }
  return total
}
