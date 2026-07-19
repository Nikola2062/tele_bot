import { Context } from "telegraf"
import { logger, getEnvVar } from "../utils/index"
import path from "node:path"
import fs from "node:fs"

/**
 * Parcel registry shared with the DHL worker (Telegram_Hub/dhl).
 *
 * The bot WRITES this file, the Python worker READS it each poll cycle and
 * flips `delivered` to true when a parcel arrives. Writes must be atomic
 * (temp file + rename) so the worker never sees a half-written file.
 *
 * Schema:
 * {
 *   "parcels": [
 *     {
 *       "tracking_number": "00340434161094015902",
 *       "chat_id": 123456789,
 *       "label": "shoes" | null,
 *       "added_at": "2026-07-18T10:00:00.000Z",
 *       "delivered": false
 *     }
 *   ]
 * }
 */

export interface ParcelEntry {
  tracking_number: string
  chat_id: number
  label: string | null
  added_at: string
  delivered: boolean
}

interface ParcelRegistry {
  parcels: ParcelEntry[]
}

const TRACKING_NUMBER_RE = /^[A-Za-z0-9]{8,40}$/

export function getParcelsFilePath(): string {
  const dataDir = getEnvVar('DATA_DIR', './data')
  return getEnvVar('PARCELS_FILE', path.join(dataDir, 'parcels.json'))
}

function loadRegistry(filePath: string): ParcelRegistry {
  try {
    if (!fs.existsSync(filePath)) {
      return { parcels: [] }
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    if (data && Array.isArray(data.parcels)) {
      return data as ParcelRegistry
    }
    return { parcels: [] }
  } catch (error) {
    logger.error(`Failed to read parcel registry at ${filePath}:`, error)
    return { parcels: [] }
  }
}

function saveRegistry(filePath: string, registry: ParcelRegistry): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  // Atomic write: the Python DHL worker reads this file concurrently.
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

export class ParcelHandlers {
  /**
   * Handle /track <tracking_number> [label...]
   */
  async handleTrack(ctx: Context) {
    const message = ctx.message
    if (!message || !('text' in message)) return

    const chatId = ctx.chat?.id
    if (!chatId) return

    const args = message.text.split(/\s+/).slice(1)
    if (args.length === 0) {
      await ctx.reply('❌ Usage: /track <tracking_number> [label]\nExample: `/track 00340434161094015902 shoes`', { parse_mode: 'Markdown' })
      return
    }

    const trackingNumber = args[0].trim()
    if (!TRACKING_NUMBER_RE.test(trackingNumber)) {
      await ctx.reply('❌ Invalid tracking number: must be 8-40 letters/digits (no spaces or symbols).')
      return
    }

    const label = args.slice(1).join(' ').trim() || null

    try {
      const filePath = getParcelsFilePath()
      const registry = loadRegistry(filePath)

      const existing = registry.parcels.find(p => p.tracking_number === trackingNumber)
      if (existing) {
        await ctx.reply(`⚠️ Parcel \`${trackingNumber}\` is already being tracked.`, { parse_mode: 'Markdown' })
        return
      }

      registry.parcels.push({
        tracking_number: trackingNumber,
        chat_id: chatId,
        label,
        added_at: new Date().toISOString(),
        delivered: false
      })
      saveRegistry(filePath, registry)

      logger.success(`Parcel ${trackingNumber} added for chat ${chatId}`)
      const labelText = label ? ` (${label})` : ''
      await ctx.reply(
        `📦 Now tracking \`${trackingNumber}\`${labelText}.\n` +
        `You'll get updates here when DHL reports new events.`,
        { parse_mode: 'Markdown' }
      )
    } catch (error) {
      logger.error('Failed to add parcel:', error)
      await ctx.reply('❌ Failed to save the parcel. Please try again.')
    }
  }

  /**
   * Handle /untrack <tracking_number>
   */
  async handleUntrack(ctx: Context) {
    const message = ctx.message
    if (!message || !('text' in message)) return

    const chatId = ctx.chat?.id
    if (!chatId) return

    const args = message.text.split(/\s+/).slice(1)
    if (args.length === 0) {
      await ctx.reply('❌ Usage: /untrack <tracking_number>')
      return
    }

    const trackingNumber = args[0].trim()

    try {
      const filePath = getParcelsFilePath()
      const registry = loadRegistry(filePath)

      // Only allow removing parcels that belong to this chat.
      const index = registry.parcels.findIndex(
        p => p.tracking_number === trackingNumber && p.chat_id === chatId
      )
      if (index === -1) {
        await ctx.reply(`❌ No parcel \`${trackingNumber}\` is tracked for this chat.`, { parse_mode: 'Markdown' })
        return
      }

      registry.parcels.splice(index, 1)
      saveRegistry(filePath, registry)

      logger.success(`Parcel ${trackingNumber} removed for chat ${chatId}`)
      await ctx.reply(`🗑️ Stopped tracking \`${trackingNumber}\`.`, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Failed to remove parcel:', error)
      await ctx.reply('❌ Failed to remove the parcel. Please try again.')
    }
  }

  /**
   * Handle /parcels — list this chat's parcels
   */
  async handleParcels(ctx: Context) {
    const chatId = ctx.chat?.id
    if (!chatId) return

    try {
      const filePath = getParcelsFilePath()
      const registry = loadRegistry(filePath)
      const mine = registry.parcels.filter(p => p.chat_id === chatId)

      if (mine.length === 0) {
        await ctx.reply('📭 No parcels tracked for this chat.\nAdd one with /track <tracking_number> [label]')
        return
      }

      let messageText = '📦 **Your parcels:**\n\n'
      mine.forEach((p, i) => {
        const status = p.delivered ? '✅ delivered' : '🚚 in transit'
        const labelText = p.label ? ` — ${p.label}` : ''
        messageText += `${i + 1}. \`${p.tracking_number}\`${labelText}\n   ${status} (added ${p.added_at.slice(0, 10)})\n\n`
      })

      await ctx.reply(messageText.trim(), { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Failed to list parcels:', error)
      await ctx.reply('❌ Failed to read the parcel list. Please try again.')
    }
  }
}

export const parcelHandlers = new ParcelHandlers()
