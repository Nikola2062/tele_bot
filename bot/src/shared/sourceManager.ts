import type { SourceID, SourceResponse, NewsItem } from "./types"
import { sources } from "./sources"
import { getCache } from "../database/cache"
import { sourceGetters, isSourceImplemented } from "../sources"
import { logger } from "../utils/index"

export class SourceManager {
  private readonly DEFAULT_TTL = 30 * 60 * 1000 // 30 minutes
  
  /**
   * Get news from a specific source with caching logic
   */
  async getSourceNews(sourceId: SourceID, forceRefresh: boolean = false): Promise<SourceResponse> {
    // Validate source
    if (!sources[sourceId]) {
      return {
        status: "error",
        id: sourceId,
        updatedTime: Date.now(),
        items: [],
        error: `Source '${sourceId}' not found`
      }
    }

    if (!isSourceImplemented(sourceId)) {
      return {
        status: "error", 
        id: sourceId,
        updatedTime: Date.now(),
        items: [],
        error: `Source '${sourceId}' not implemented yet`
      }
    }

    const source = sources[sourceId]
    const now = Date.now()
    
    // Try to get from cache first
    let cachedData
    try {
      const cache = getCache()
      cachedData = await cache.get(sourceId)
    } catch (error) {
      logger.warn(`Cache retrieval failed for ${sourceId}:`, error)
    }

    // Check if we should use cached data
    if (cachedData && !forceRefresh) {
      const timeSinceUpdate = now - cachedData.updated
      
      // Use cache if within source's specific interval
      if (timeSinceUpdate < source.interval) {
        return {
          status: "success",
          id: sourceId,
          updatedTime: now,
          items: cachedData.items
        }
      }
      
      // Use cache if within TTL and no force refresh
      if (timeSinceUpdate < this.DEFAULT_TTL) {
        return {
          status: "cache",
          id: sourceId,
          updatedTime: cachedData.updated,
          items: cachedData.items
        }
      }
    }

    // Fetch fresh data
    try {
      const getter = sourceGetters[sourceId]
      if (!getter) {
        throw new Error(`No getter found for source ${sourceId}`)
      }

      logger.info(`Fetching fresh data for ${sourceId}`)
      const items = await getter()
      const limitedItems = items.slice(0, 30) // Limit to 30 items

      // Cache the new data
      try {
        const cache = getCache()
        await cache.set(sourceId, limitedItems)
      } catch (error) {
        logger.warn(`Failed to cache data for ${sourceId}:`, error)
      }

      logger.success(`Fetched ${sourceId} latest`)
      return {
        status: "success",
        id: sourceId,
        updatedTime: now,
        items: limitedItems
      }
      
    } catch (error) {
      logger.error(`Failed to fetch ${sourceId}:`, error)
      
      // Fallback to cached data if available
      if (cachedData) {
        logger.info(`Using fallback cache for ${sourceId}`)
        return {
          status: "cache",
          id: sourceId,
          updatedTime: cachedData.updated,
          items: cachedData.items
        }
      }
      
      // No cache available, return error
      return {
        status: "error",
        id: sourceId,
        updatedTime: now,
        items: [],
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Get multiple sources at once
   */
  async getMultipleSources(sourceIds: SourceID[], forceRefresh: boolean = false): Promise<SourceResponse[]> {
    const promises = sourceIds.map(id => this.getSourceNews(id, forceRefresh))
    return Promise.all(promises)
  }

  /**
   * Get all implemented sources
   */
  getAvailableSources(): SourceID[] {
    return Object.keys(sources).filter(id => 
      isSourceImplemented(id as SourceID)
    ) as SourceID[]
  }

  /**
   * Check if a source is valid and implemented
   */
  isValidSource(sourceId: string): sourceId is SourceID {
    return sourceId in sources && isSourceImplemented(sourceId as SourceID)
  }

  /**
   * Get source display name
   */
  getSourceDisplayName(sourceId: SourceID): string {
    const source = sources[sourceId]
    if (!source) return sourceId
    return source.title ? `${source.name} - ${source.title}` : source.name
  }

  /**
   * Clear cache for a specific source
   */
  async clearSourceCache(sourceId: SourceID): Promise<void> {
    try {
      const cache = getCache()
      await cache.delete(sourceId)
      logger.success(`Cleared cache for ${sourceId}`)
    } catch (error) {
      logger.error(`Failed to clear cache for ${sourceId}:`, error)
      throw error
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const cache = getCache()
      return await cache.getCacheStats()
    } catch (error) {
      logger.error('Failed to get cache stats:', error)
      return { count: 0, oldestEntry: 0, newestEntry: 0 }
    }
  }
}

// Global source manager instance
export const sourceManager = new SourceManager()