#!/usr/bin/env node

import dotenv from 'dotenv'
import { createNewsBot } from './bot'
import { logger } from './utils/index'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from the project root
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Main function
async function main() {
  try {
    // Check required environment variables
    const required = ['TELEGRAM_BOT_TOKEN']
    const missing = required.filter(key => !process.env[key])
    
    if (missing.length > 0) {
      logger.error(`Missing required environment variables: ${missing.join(', ')}`)
      logger.info('Please check your .env file. See .env.example for reference.')
      process.exit(1)
    }

    // Create and start the bot
    const newsBot = createNewsBot()
    await newsBot.start()
    
  } catch (error) {
    logger.error('Failed to start application:', error)
    process.exit(1)
  }
}

// Run the application
main().catch((error) => {
  logger.error('Application crashed:', error)
  process.exit(1)
})