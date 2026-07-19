#!/usr/bin/env node

import dotenv from 'dotenv'
import { sourceManager } from '../src/shared/sourceManager'
import { initializeCache, closeCache } from '../src/database/cache'
import { logger } from '../src/utils/index'
import path from 'node:path'

// Load environment variables
dotenv.config()

async function testSources() {
  logger.info('🧪 Testing NewsNow Telegram Bot Sources...')
  
  try {
    // Initialize cache for testing
    const dbPath = path.resolve('./test-cache.db')
    initializeCache(dbPath)
    logger.success('Test cache initialized')

    // Get available sources
    const availableSources = sourceManager.getAvailableSources()
    logger.info(`Found ${availableSources.length} available sources: ${availableSources.join(', ')}`)

    // Test each implemented source
    const testResults = []
    
    for (const sourceId of availableSources) {
      logger.info(`Testing source: ${sourceId}`)
      
      try {
        const response = await sourceManager.getSourceNews(sourceId, true)
        
        if (response.status === 'success') {
          logger.success(`✅ ${sourceId}: ${response.items.length} items`)
          testResults.push({
            source: sourceId,
            status: 'success',
            itemCount: response.items.length,
            sampleTitle: response.items[0]?.title || 'No items'
          })
        } else if (response.status === 'error') {
          logger.error(`❌ ${sourceId}: ${response.error}`)
          testResults.push({
            source: sourceId,
            status: 'error',
            error: response.error
          })
        }
      } catch (error) {
        logger.error(`💥 ${sourceId}: Exception - ${error}`)
        testResults.push({
          source: sourceId,
          status: 'exception',
          error: String(error)
        })
      }
    }

    // Print summary
    logger.info('\n📊 Test Summary:')
    logger.info('='.repeat(50))
    
    const successful = testResults.filter(r => r.status === 'success')
    const failed = testResults.filter(r => r.status !== 'success')
    
    logger.success(`✅ Successful: ${successful.length}/${testResults.length}`)
    successful.forEach(result => {
      logger.info(`  ${result.source}: ${result.itemCount} items - "${result.sampleTitle}"`)
    })
    
    if (failed.length > 0) {
      logger.error(`❌ Failed: ${failed.length}/${testResults.length}`)
      failed.forEach(result => {
        logger.error(`  ${result.source}: ${result.error}`)
      })
    }

    // Test cache functionality
    logger.info('\n🗃️ Testing Cache...')
    const stats = await sourceManager.getCacheStats()
    logger.info(`Cache entries: ${stats.count}`)
    
    // Test second fetch (should use cache)
    if (successful.length > 0) {
      const testSource = successful[0].source
      logger.info(`Testing cache with ${testSource}...`)
      
      const cachedResponse = await sourceManager.getSourceNews(testSource, false)
      if (cachedResponse.status === 'cache') {
        logger.success('✅ Cache working correctly')
      } else {
        logger.warn('⚠️ Cache may not be working as expected')
      }
    }

  } catch (error) {
    logger.error('Test failed:', error)
  } finally {
    closeCache()
    logger.info('Test completed')
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testSources().catch(console.error)
}

export { testSources }