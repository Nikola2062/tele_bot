/**
 * Europe/Berlin clock helpers for the news digest scheduler.
 *
 * Mirrors the papers worker, which schedules in Europe/Berlin
 * (papers/src/main.py: SCHEDULE_TZ). We avoid a timezone dependency by
 * reading the wall-clock in that zone via Intl.
 */

export interface BerlinClock {
  /** "YYYY-MM-DD" in Europe/Berlin — the per-day dedup key. */
  date: string
  /** "HH:MM" (24h, zero-padded) in Europe/Berlin. */
  hm: string
}

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function berlinNow(now: Date = new Date()): BerlinClock {
  const parts = Object.fromEntries(
    FMT.formatToParts(now).map(p => [p.type, p.value])
  ) as Record<string, string>
  // Intl can emit "24" for midnight in some engines; normalize to "00".
  const hour = parts.hour === "24" ? "00" : parts.hour
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hm: `${hour}:${parts.minute}`,
  }
}
