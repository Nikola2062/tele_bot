import { Telegraf, Context } from "telegraf"
import { commandHandlers } from "./handlers/commands"
import { parcelHandlers } from "./handlers/parcels"
import { initializeCache } from "./database/cache"
import { logger, getEnvVar } from "./utils/index"
import path from "node:path"
import process from "node:process"

export class NewsBot {
  private bot: Telegraf
  private botToken: string
  private botUsername: string

  constructor() {
    this.botToken = getEnvVar('TELEGRAM_BOT_TOKEN')
    // Optional: only used for log output. Derived from getMe() during initialize().
    this.botUsername = getEnvVar('BOT_USERNAME', '')

    this.bot = new Telegraf(this.botToken)
    this.setupHandlers()
    this.setupMiddleware()
  }

  private setupMiddleware() {
    // Logging middleware
    this.bot.use(async (ctx: Context, next: () => Promise<void>) => {
      const start = Date.now()
      const user = ctx.from
      const message = ctx.message
      
      let messageText = ''
      if (message && 'text' in message) {
        messageText = message.text
      }
      
      logger.info(`Received message from ${user?.username || user?.first_name || 'unknown'}: "${messageText}"`)
      
      try {
        await next()
        const duration = Date.now() - start
        logger.info(`Processed in ${duration}ms`)
      } catch (error) {
        logger.error('Error processing message:', error)
        await ctx.reply('❌ Sorry, something went wrong. Please try again.')
      }
    })

    // Error handling
    this.bot.catch((err: unknown, ctx: Context) => {
      logger.error('Bot error:', err)
      if (ctx) {
        ctx.reply('❌ An error occurred. Please try again later.')
      }
    })
  }

  private setupHandlers() {
    // Command handlers
    this.bot.start(commandHandlers.handleStart.bind(commandHandlers))
    this.bot.help(commandHandlers.handleHelp.bind(commandHandlers))
    this.bot.command('sources', commandHandlers.handleSources.bind(commandHandlers))
    this.bot.command('latest', commandHandlers.handleLatest.bind(commandHandlers))
    this.bot.command('all', commandHandlers.handleAll.bind(commandHandlers))
    this.bot.command('stats', commandHandlers.handleStats.bind(commandHandlers))

    // Parcel tracking commands (shared registry consumed by the DHL worker)
    this.bot.command('track', parcelHandlers.handleTrack.bind(parcelHandlers))
    this.bot.command('untrack', parcelHandlers.handleUntrack.bind(parcelHandlers))
    this.bot.command('parcels', parcelHandlers.handleParcels.bind(parcelHandlers))

    // Handle direct source name input
    this.bot.on('text', commandHandlers.handleSourceName.bind(commandHandlers))
  }

  async initialize() {
    logger.info('Initializing NewsNow Telegram Bot...')
    
    // Initialize cache
    const dataDir = getEnvVar('DATA_DIR', './data')
    const dbPath = getEnvVar('DATABASE_PATH', path.join(dataDir, 'cache.db'))
    const absoluteDbPath = path.resolve(dbPath)
    
    try {
      initializeCache(absoluteDbPath)
      logger.success(`Cache initialized at: ${absoluteDbPath}`)
    } catch (error) {
      logger.error('Failed to initialize cache:', error)
      throw error
    }

    // Set bot commands
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot and see welcome message' },
        { command: 'help', description: 'Show help information' },
        { command: 'sources', description: 'List all available news sources' },
        { command: 'latest', description: 'Get latest news from a source (e.g., /latest douyin)' },
        { command: 'all', description: 'Get latest headlines from all sources' },
        { command: 'stats', description: 'Show cache statistics' },
        { command: 'track', description: 'Track a DHL parcel (e.g., /track 00340434161094015902 shoes)' },
        { command: 'untrack', description: 'Stop tracking a parcel' },
        { command: 'parcels', description: 'List your tracked parcels' }
      ])
      logger.success('Bot commands set successfully')
    } catch (error) {
      logger.warn('Failed to set bot commands:', error)
    }

    // Get bot info
    try {
      const botInfo = await this.bot.telegram.getMe()
      this.botUsername = this.botUsername || botInfo.username
      logger.success(`Bot initialized: @${botInfo.username} (${botInfo.first_name})`)
    } catch (error) {
      logger.error('Failed to get bot info:', error)
      throw error
    }
  }

  async start() {
    try {
      await this.initialize()
      
      logger.info('Starting bot...')
      await this.bot.launch()
      
      logger.success(`🤖 NewsNow Bot (@${this.botUsername}) is running!`)
      logger.info('Press Ctrl+C to stop the bot')
      
      // Graceful shutdown
      process.once('SIGINT', () => this.stop('SIGINT'))
      process.once('SIGTERM', () => this.stop('SIGTERM'))
      
    } catch (error) {
      logger.error('Failed to start bot:', error)
      process.exit(1)
    }
  }

  async stop(signal?: string) {
    logger.info(`Stopping bot... (${signal || 'manual'})`)
    
    try {
      this.bot.stop(signal)
      logger.success('Bot stopped successfully')
    } catch (error) {
      logger.error('Error stopping bot:', error)
    }
    
    // Close cache
    try {
      const { closeCache } = await import('./database/cache')
      closeCache()
    } catch (error) {
      logger.error('Error closing cache:', error)
    }
    
    process.exit(0)
  }

  // Get bot instance for advanced usage
  getBot() {
    return this.bot
  }
}

// Export bot factory function instead of instance
export function createNewsBot() {
  return new NewsBot()
}