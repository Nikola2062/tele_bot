import Database from "better-sqlite3"
import type { NewsItem, SourceID, CacheInfo, CacheRow } from "@shared/types"
import { logger } from "@utils/index"
import path from "path"
import fs from "fs"

export class Cache {
  private db: Database.Database
  
  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    this.db = new Database(dbPath)
    this.init()
  }

  private init() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cache (
          id TEXT PRIMARY KEY,
          updated INTEGER,
          data TEXT
        );
      `)
      logger.success("Initialized cache table")
    } catch (error) {
      logger.error("Failed to initialize cache table:", error)
      throw error
    }
  }

  async set(key: SourceID, value: NewsItem[]): Promise<void> {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (id, data, updated) 
      VALUES (?, ?, ?)
    `)
    
    try {
      stmt.run(key, JSON.stringify(value), now)
      logger.success(`Set ${key} cache`)
    } catch (error) {
      logger.error(`Failed to set cache for ${key}:`, error)
      throw error
    }
  }

  async get(key: SourceID): Promise<CacheInfo | undefined> {
    const stmt = this.db.prepare(`
      SELECT id, data, updated FROM cache WHERE id = ?
    `)
    
    try {
      const row = stmt.get(key) as CacheRow | undefined
      
      if (row) {
        logger.success(`Get ${key} cache`)
        return {
          id: row.id,
          updated: row.updated,
          items: JSON.parse(row.data)
        }
      }
      
      return undefined
    } catch (error) {
      logger.error(`Failed to get cache for ${key}:`, error)
      return undefined
    }
  }

  async getMultiple(keys: SourceID[]): Promise<CacheInfo[]> {
    if (keys.length === 0) return []
    
    const placeholders = keys.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT id, data, updated FROM cache 
      WHERE id IN (${placeholders})
    `)
    
    try {
      const rows = stmt.all(...keys) as CacheRow[]
      
      if (rows.length > 0) {
        logger.success(`Get multiple cache entries: ${rows.length}`)
        return rows.map(row => ({
          id: row.id,
          updated: row.updated,
          items: JSON.parse(row.data) as NewsItem[]
        }))
      }
      
      return []
    } catch (error) {
      logger.error('Failed to get multiple cache entries:', error)
      return []
    }
  }

  async delete(key: SourceID): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM cache WHERE id = ?`)
    
    try {
      stmt.run(key)
      logger.success(`Deleted ${key} cache`)
    } catch (error) {
      logger.error(`Failed to delete cache for ${key}:`, error)
      throw error
    }
  }

  async clear(): Promise<void> {
    try {
      this.db.exec('DELETE FROM cache')
      logger.success('Cleared all cache')
    } catch (error) {
      logger.error('Failed to clear cache:', error)
      throw error
    }
  }

  async getCacheStats(): Promise<{ count: number, oldestEntry: number, newestEntry: number }> {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM cache')
      const statsStmt = this.db.prepare('SELECT MIN(updated) as oldest, MAX(updated) as newest FROM cache')
      
      const countResult = countStmt.get() as { count: number }
      const statsResult = statsStmt.get() as { oldest: number, newest: number }
      
      return {
        count: countResult.count,
        oldestEntry: statsResult.oldest || 0,
        newestEntry: statsResult.newest || 0
      }
    } catch (error) {
      logger.error('Failed to get cache stats:', error)
      return { count: 0, oldestEntry: 0, newestEntry: 0 }
    }
  }

  close(): void {
    try {
      this.db.close()
      logger.info('Cache database closed')
    } catch (error) {
      logger.error('Failed to close cache database:', error)
    }
  }
}

// Global cache instance
let cacheInstance: Cache | null = null

export function initializeCache(dbPath: string): Cache {
  if (cacheInstance) {
    return cacheInstance
  }
  
  cacheInstance = new Cache(dbPath)
  return cacheInstance
}

export function getCache(): Cache {
  if (!cacheInstance) {
    throw new Error('Cache not initialized. Call initializeCache() first.')
  }
  return cacheInstance
}

export function closeCache(): void {
  if (cacheInstance) {
    cacheInstance.close()
    cacheInstance = null
  }
}