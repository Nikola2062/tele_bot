#!/usr/bin/env node

import dotenv from 'dotenv'
import { sourceManager } from '../src/shared/sourceManager'
import { initializeCache, closeCache } from '../src/database/cache'
import { logger } from '../src/utils/index'
import path from 'node:path'

// Load environment variables
dotenv.config()

async function testNewSources() {
  logger.info('🧪 Testing New Source Implementations...')
  
  try {
    // Initialize cache for testing
    const dbPath = path.resolve('./test-new-sources-cache.db')
    initializeCache(dbPath)
    logger.success('Test cache initialized')

    // List of newly implemented sources
    const newSources = [
      'zhihu',
      'hackernews', 
      'v2ex',
      'ithome',
      'thepaper',
      'baidu',
      'juejin',
      'bilibili',
      'coolapk',
      'hupu',
      'producthunt',
      'toutiao'
    ]

    logger.info(`Testing ${newSources.length} newly implemented sources...`)

    const testResults = []
    
    for (const sourceId of newSources) {
      logger.info(`Testing source: ${sourceId}`)
      
      try {
        const response = await sourceManager.getSourceNews(sourceId as any, true)
        
        if (response.status === 'success') {
          logger.success(`✅ ${sourceId}: ${response.items.length} items`)
          testResults.push({
            source: sourceId,
            status: 'success',
            itemCount: response.items.length,
            sampleTitle: response.items[0]?.title || 'No items',
            sampleUrl: response.items[0]?.url || 'No URL'
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

    // Print detailed results
    logger.info('\n📊 Detailed Test Results:')
    logger.info('='.repeat(80))
    
    const successful = testResults.filter(r => r.status === 'success')
    const failed = testResults.filter(r => r.status !== 'success')
    
    logger.success(`✅ Successfully working: ${successful.length}/${testResults.length}`)
    successful.forEach(result => {
      logger.info(`  📰 ${result.source}:`)
      logger.info(`     Items: ${result.itemCount}`)
      logger.info(`     Sample: "${result.sampleTitle}"`)
      logger.info(`     URL: ${result.sampleUrl}`)
      logger.info('')
    })
    
    if (failed.length > 0) {
      logger.error(`❌ Failed sources: ${failed.length}/${testResults.length}`)
      failed.forEach(result => {
        logger.error(`  💥 ${result.source}: ${result.error}`)
      })
    }

    // Summary
    logger.info('\n🎯 Summary:')
    logger.info(`Total sources tested: ${testResults.length}`)
    logger.info(`Working sources: ${successful.length}`)
    logger.info(`Failed sources: ${failed.length}`)
    logger.info(`Success rate: ${Math.round((successful.length / testResults.length) * 100)}%`)

    if (successful.length > 0) {
      logger.info('\n🎉 Bot is ready with these working sources:')
      logger.info(successful.map(r => r.source).join(', '))
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
  testNewSources().catch(console.error)
}

export { testNewSources }