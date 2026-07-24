import { Context } from "telegraf"
import type { SourceID } from "../shared/types"
import { sourceManager } from "../shared/sourceManager"
import { sources, getSourceDisplayName, getAllSourceIds, INTERNATIONAL_SOURCES } from "../shared/sources"
import { formatNewsForTelegram, logger } from "../utils/index"

export class CommandHandlers {
  /**
   * Handle /start command
   */
  async handleStart(ctx: Context) {
    const welcomeMessage = `
🗞️ **Welcome to NewsNow Bot!**

I can help you get the latest trending news from various sources in real-time.

**Available Commands:**
• \`/help\` - Show this help message
• \`/sources\` - List all available news sources
• \`/latest <source>\` - Get latest news from a specific source
• \`/world\` - World-news digest (BBC, DW, ARD, ZDF)
• \`/all\` - Latest headlines from all sources
• \`/stats\` - Show cache statistics
• \`/track <number> [label]\` - Track a DHL parcel
• \`/untrack <number>\` - Stop tracking a parcel
• \`/parcels\` - List your tracked parcels

**Quick Examples:**
• \`douyin\` - Get Douyin trending topics
• \`weibo\` - Get Weibo hot searches  
• \`github\` - Get GitHub trending repositories

**Supported Sources:**
Currently supporting ${sourceManager.getAvailableSources().length} news sources including Douyin, Weibo, GitHub, and more!

Just type a source name to get started! 🚀
    `.trim()

    try {
      await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Failed to send start message:', error)
      await ctx.reply('Welcome to NewsNow Bot! Type /help for available commands.')
    }
  }

  /**
   * Handle /help command
   */
  async handleHelp(ctx: Context) {
    const helpMessage = `
📚 **NewsNow Bot Help**

**Commands:**
• \`/start\` - Show welcome message
• \`/help\` - Show this help
• \`/sources\` - List all available sources
• \`/latest <source>\` - Get news from specific source
• \`/world\` - World-news digest (BBC, DW, ARD, ZDF)
• \`/all\` - Latest headlines from all sources
• \`/stats\` - Show cache statistics

**Parcel Tracking (DHL):**
• \`/track <number> [label]\` - Track a parcel (updates arrive in this chat)
• \`/untrack <number>\` - Stop tracking a parcel
• \`/parcels\` - List your tracked parcels

**Quick Usage:**
Just type any source name directly:
• \`douyin\` → Douyin trending
• \`weibo\` → Weibo hot searches
• \`github\` → GitHub trending repos
• \`zhihu\` → Zhihu trending questions

**Examples:**
• \`/all\`
• \`/latest douyin\`
• \`weibo\`
• \`github\`

Type \`/sources\` to see all available sources!
    `.trim()

    try {
      await ctx.reply(helpMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Failed to send help message:', error)
      await ctx.reply('Help: Use /sources to see available sources, then type a source name to get news.')
    }
  }

  /**
   * Handle /sources command
   */
  async handleSources(ctx: Context) {
    const availableSources = sourceManager.getAvailableSources()
    
    if (availableSources.length === 0) {
      await ctx.reply('❌ No sources are currently available.')
      return
    }

    // Group sources by type/category for better display
    const sourcesByCategory: Record<string, string[]> = {
      'International (World)': ['tagesschau', 'zdf', 'dwde', 'bbcworld', 'dw', 'bbczh', 'dwzh'],
      'Chinese Social': ['douyin', 'weibo', 'zhihu', 'hupu', 'tieba'],
      'Tech & Dev': ['github', 'hackernews', 'ithome', 'v2ex', 'juejin'],
      'News & Media': ['thepaper', 'toutiao', 'zaobao', 'cankaoxiaoxi'],
      'Others': []
    }

    // Categorize available sources
    const categorized = { ...sourcesByCategory }
    const uncategorized: string[] = []

    availableSources.forEach(sourceId => {
      let categorized_flag = false
      for (const [category, sourceList] of Object.entries(sourcesByCategory)) {
        if (sourceList.includes(sourceId)) {
          categorized_flag = true
          break
        }
      }
      if (!categorized_flag) {
        uncategorized.push(sourceId)
      }
    })

    categorized['Others'] = uncategorized

    let message = '📰 **Available News Sources:**\n\n'

    // Build message by category
    for (const [category, sourceList] of Object.entries(categorized)) {
      const categoryAvailable = sourceList.filter(id => availableSources.includes(id as SourceID))
      
      if (categoryAvailable.length > 0) {
        message += `**${category}:**\n`
        categoryAvailable.forEach(sourceId => {
          const displayName = getSourceDisplayName(sourceId as SourceID)
          message += `• \`${sourceId}\` - ${displayName}\n`
        })
        message += '\n'
      }
    }

    message += `Total: **${availableSources.length} sources** available\n\n`
    message += '💡 **Usage:** Just type any source name (e.g., `douyin`) to get the latest news!'

    try {
      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Failed to send sources list:', error)
      // Fallback to simple text
      const simpleMessage = `Available sources: ${availableSources.join(', ')}\n\nUsage: Type any source name to get news.`
      await ctx.reply(simpleMessage)
    }
  }

  /**
   * Handle /latest <source> command
   */
  async handleLatest(ctx: Context) {
    const message = ctx.message
    if (!message || !('text' in message)) {
      await ctx.reply('❌ Please provide a source name. Example: `/latest douyin`')
      return
    }

    const args = message.text.split(' ')
    if (args.length < 2) {
      await ctx.reply('❌ Please specify a source. Example: `/latest douyin`')
      return
    }

    const sourceId = args[1].toLowerCase().trim()
    if (sourceId === 'all') {
      await this.handleAll(ctx)
      return
    }
    await this.fetchAndSendNews(ctx, sourceId, true)
  }


  /**
   * Handle /all — latest headlines from every implemented source.
   */
  async handleAll(ctx: Context) {
    const availableSources = sourceManager.getAvailableSources()
    if (availableSources.length === 0) {
      await ctx.reply('No sources are currently available.')
      return
    }

    await ctx.reply(`Fetching latest from ${availableSources.length} sources…`)
    await ctx.sendChatAction('typing')

    let ok = 0
    let failed = 0

    for (const sourceId of availableSources) {
      try {
        await ctx.sendChatAction('typing')
        const response = await sourceManager.getSourceNews(sourceId, true)
        const sourceName = getSourceDisplayName(sourceId)

        if (response.status === 'error') {
          failed++
          await ctx.reply(`**${sourceName}** — failed: ${response.error || 'unknown'}`, { parse_mode: 'Markdown' })
          continue
        }

        ok++
        const formatted = formatNewsForTelegram(response.items, sourceName, 5)
        // Telegram hard limit 4096; truncate defensively
        const msg = formatted.length > 4000 ? formatted.slice(0, 3990) + '\n\n…' : formatted
        await ctx.reply(msg, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true }
        })
      } catch (error) {
        failed++
        logger.error(`Error in /all for ${sourceId}:`, error)
        await ctx.reply(`**${sourceId}** — error fetching.`, { parse_mode: 'Markdown' })
      }
    }

    await ctx.reply(`Done: ${ok} ok, ${failed} failed / ${availableSources.length} sources.`)
  }

  /**
   * Handle /world — a curated digest from international broadcasters
   * (ARD/Tagesschau, ZDF, DW, BBC) instead of the trending/hot-search lists.
   */
  async handleWorld(ctx: Context) {
    const worldSources = INTERNATIONAL_SOURCES.filter(id => sourceManager.isValidSource(id))
    if (worldSources.length === 0) {
      await ctx.reply('No international sources are currently available.')
      return
    }

    await ctx.reply(`🌍 Fetching world news from ${worldSources.length} broadcasters…`)
    await ctx.sendChatAction('typing')

    let ok = 0
    let failed = 0

    for (const sourceId of worldSources) {
      try {
        await ctx.sendChatAction('typing')
        const response = await sourceManager.getSourceNews(sourceId)
        const sourceName = getSourceDisplayName(sourceId)

        if (response.status === 'error') {
          failed++
          await ctx.reply(`**${sourceName}** — failed: ${response.error || 'unknown'}`, { parse_mode: 'Markdown' })
          continue
        }

        ok++
        const formatted = formatNewsForTelegram(response.items, sourceName, 5)
        const msg = formatted.length > 4000 ? formatted.slice(0, 3990) + '\n\n…' : formatted
        await ctx.reply(msg, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true }
        })
      } catch (error) {
        failed++
        logger.error(`Error in /world for ${sourceId}:`, error)
        await ctx.reply(`**${sourceId}** — error fetching.`, { parse_mode: 'Markdown' })
      }
    }

    await ctx.reply(`Done: ${ok} ok, ${failed} failed / ${worldSources.length} broadcasters.`)
  }

  /**
   * Handle /stats command
   */
  async handleStats(ctx: Context) {
    try {
      const stats = await sourceManager.getCacheStats()
      const availableSources = sourceManager.getAvailableSources()
      
      const statsMessage = `
📊 **Cache Statistics**

• **Total cached sources:** ${stats.count}
• **Available sources:** ${availableSources.length}
• **Oldest cache entry:** ${stats.oldestEntry ? new Date(stats.oldestEntry).toLocaleString() : 'N/A'}
• **Newest cache entry:** ${stats.newestEntry ? new Date(stats.newestEntry).toLocaleString() : 'N/A'}

**Implemented sources:**
${availableSources.map(id => `• ${id}`).join('\n')}
      `.trim()

      await ctx.reply(statsMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logger.error('Failed to get stats:', error)
      await ctx.reply('❌ Failed to retrieve statistics.')
    }
  }

  /**
   * Handle direct source name input (e.g., user types "douyin")
   */
  async handleSourceName(ctx: Context) {
    const message = ctx.message
    if (!message || !('text' in message)) return

    const sourceId = message.text.toLowerCase().trim()
    
    // Check if it's a valid source
    if (!sourceManager.isValidSource(sourceId)) {
      // Don't respond to invalid sources to avoid spam
      return
    }

    await this.fetchAndSendNews(ctx, sourceId, false)
  }

  /**
   * Common method to fetch and send news
   */
  private async fetchAndSendNews(ctx: Context, sourceId: string, forceRefresh: boolean = false) {
    if (!sourceManager.isValidSource(sourceId)) {
      await ctx.reply(`❌ Source '${sourceId}' is not available. Use /sources to see available sources.`)
      return
    }

    // Send "typing" indicator
    await ctx.sendChatAction('typing')

    try {
      logger.info(`Fetching news for ${sourceId} (force: ${forceRefresh})`)
      const response = await sourceManager.getSourceNews(sourceId, forceRefresh)

      if (response.status === 'error') {
        await ctx.reply(`❌ Failed to get news from ${sourceId}: ${response.error}`)
        return
      }

      const sourceName = getSourceDisplayName(sourceId)
      const formattedMessage = formatNewsForTelegram(response.items, sourceName)
      
      // Add status indicator
      const statusIcon = response.status === 'cache' ? '💾' : '🔄'
      const statusText = response.status === 'cache' ? 'cached' : 'fresh'
      const finalMessage = `${formattedMessage}\n\n${statusIcon} Data: ${statusText} (${new Date(response.updatedTime).toLocaleTimeString()})`

      await ctx.reply(finalMessage, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
      })

    } catch (error) {
      logger.error(`Error fetching news for ${sourceId}:`, error)
      await ctx.reply(`❌ Sorry, I couldn't fetch news from ${sourceId} right now. Please try again later.`)
    }
  }
}

export const commandHandlers = new CommandHandlers()