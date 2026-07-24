import { $fetch } from "ofetch"
import { logger } from "../utils/index"

/**
 * Optional LLM clustering layer for the news digest.
 *
 * Opt-in: active only when OPENROUTER_API_KEY is set. It sends the run's
 * headlines to an OpenRouter model and asks it to group items that report the
 * SAME real-world event (across sources and languages) into clusters, each
 * with a one-sentence summary in the items' own language. The digest then
 * surfaces the multi-source clusters as a "Top stories" section, deduplicating
 * the same story appearing under several sources.
 *
 * Fail-safe: any problem (no key, network error, timeout, unparseable reply)
 * returns null, and the caller renders the ordinary grouped digest instead.
 */

export interface DigestEntry {
  source: string
  lang: string
  title: string
  teaser?: string
  url: string
}

export interface Cluster {
  members: number[] // indices into the entries array passed to clusterStories
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const DEFAULT_MODEL = "poolside/laguna-s-2.1:free"
const TIMEOUT_MS = 60_000
const MAX_ATTEMPTS = 3 // free-tier 429s are often transient; retry a couple of times

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Clustering is opt-in on the presence of an OpenRouter key. */
export function clusteringEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

// The LLM is used ONLY to GROUP items (its strength: fuzzy same-event matching
// across languages). It is NOT asked to write summaries — small models drift to
// English and mistranslate names, so the digest displays a real source headline
// (in its original language) as each cluster's title instead.
const SYSTEM_PROMPT =
  "You are a multilingual news editor. You receive a numbered list of headlines from " +
  "many sources, in German, English and Chinese.\n\n" +
  "Merge ONLY items that report the SAME specific event — the same incident, people or " +
  "announcement. Matching works across languages (a Chinese, German and English headline " +
  "about the same event belong together). Do NOT group items that merely share a general " +
  'topic: "Chinese tech news" or "social issues" is WRONG — if they are different events, ' +
  "keep them in SEPARATE clusters. An item with no true match is its own single-item cluster.\n\n" +
  "Order clusters so those spanning the most sources come first.\n\n" +
  'OUTPUT: ONLY compact JSON: {"clusters":[{"members":[0,3,7]}]}. ' +
  "Every index appears in exactly one cluster. No prose, no code fences."

export async function clusterStories(entries: DigestEntry[]): Promise<Cluster[] | null> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return null
  if (entries.length === 0) return null
  const model = process.env.DIGEST_LLM_MODEL || DEFAULT_MODEL

  const list = entries
    .map((e, i) => {
      const teaser = e.teaser ? ` — ${e.teaser.slice(0, 160)}` : ""
      return `${i}\t[${e.source}] ${e.title}${teaser}`
    })
    .join("\n")

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp: any = await $fetch(OPENROUTER_URL, {
        method: "POST",
        timeout: TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "telegram-hub-digest",
        },
        body: {
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Headlines:\n${list}` },
          ],
        },
      })

      const content = resp?.choices?.[0]?.message?.content
      if (typeof content !== "string" || !content.trim()) {
        logger.warn("digest cluster: empty LLM response; falling back")
        return null
      }
      const clusters = parseClusters(content, entries.length)
      if (!clusters) {
        logger.warn("digest cluster: unparseable LLM response; falling back")
        return null
      }
      logger.info(`digest cluster: ${clusters.length} clusters via ${model}`)
      return clusters
    } catch (error) {
      const status = (error as any)?.status ?? (error as any)?.response?.status
      const msg = error instanceof Error ? error.message : String(error)
      // Retry transient rate limits with a short backoff; anything else falls back.
      if (status === 429 && attempt < MAX_ATTEMPTS) {
        const waitMs = attempt * 4000
        logger.warn(`digest cluster: 429 rate-limited, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs / 1000}s`)
        await sleep(waitMs)
        continue
      }
      logger.warn(`digest cluster: LLM call failed; falling back (${msg})`)
      return null
    }
  }
  return null
}

/** Parse and validate the model's JSON, dropping any invalid/duplicate indices. */
function parseClusters(raw: string, n: number): Cluster[] | null {
  let s = raw.trim()
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim()
  }
  const first = s.indexOf("{")
  const last = s.lastIndexOf("}")
  if (first < 0 || last <= first) return null

  let obj: any
  try {
    obj = JSON.parse(s.slice(first, last + 1))
  } catch {
    return null
  }
  if (!Array.isArray(obj?.clusters)) return null

  const seen = new Set<number>()
  const clusters: Cluster[] = []
  for (const c of obj.clusters) {
    const members: number[] = (Array.isArray(c?.members) ? c.members : [])
      .map((x: any) => Number(x))
      .filter((x: number) => Number.isInteger(x) && x >= 0 && x < n && !seen.has(x))
    members.forEach(x => seen.add(x))
    if (members.length > 0) clusters.push({ members })
  }
  return clusters.length > 0 ? clusters : null
}
