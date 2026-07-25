import fs from "node:fs"
import path from "node:path"

/**
 * Append-only run log for the news digest, so every scheduled run leaves a
 * timestamped trace on disk (independent of stdout). Mirrors the papers
 * worker's logs/run.log.
 *
 * Location: $DIGEST_LOG_FILE, else <DATA_DIR>/digest.log (default ./data).
 * When the hub runs it, DATA_DIR is pinned to the shared data dir, so the
 * trace lands at <hub>/data/digest.log.
 *
 * Logging never throws — a failed write must not break a digest run.
 */

function logFilePath(): string {
  const explicit = process.env.DIGEST_LOG_FILE
  if (explicit) return explicit
  const dataDir = process.env.DATA_DIR || "./data"
  return path.join(dataDir, "digest.log")
}

/** "2026-07-25 11:00:03 CEST" in Europe/Berlin. */
function stamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZoneName: "short",
  }).formatToParts(new Date())
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? ""
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")} ${g("timeZoneName")}`
}

export function digestLog(message: string): void {
  const line = `${stamp()}  ${message}\n`
  try {
    const fp = logFilePath()
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.appendFileSync(fp, line)
  } catch {
    // Never let logging break a run.
  }
}
