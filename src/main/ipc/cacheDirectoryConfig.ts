import { createHash } from 'crypto'
import { resolve } from 'path'
import type { CacheDirectorySource } from '../../shared/cacheDirectoryTypes'

export interface StoredCacheDirectory {
  path: string
  enabled: boolean
}

interface LegacyCacheDirectoryConfig {
  cacheDir?: unknown
  cacheDirs?: unknown
}

function normalizePathKey(pathValue: string): string {
  return resolve(pathValue).toLowerCase()
}

export function cacheDirectoryId(pathValue: string): string {
  const hash = createHash('md5').update(normalizePathKey(pathValue)).digest('hex').slice(0, 12)
  return `cache-dir-${hash}`
}

export function normalizeCacheDirectoryConfig(
  rawConfig: unknown,
  defaultPath: string
): StoredCacheDirectory[] {
  const config = rawConfig && typeof rawConfig === 'object'
    ? rawConfig as LegacyCacheDirectoryConfig
    : {}

  const sources: StoredCacheDirectory[] = []

  if (Array.isArray(config.cacheDirs)) {
    for (const item of config.cacheDirs) {
      if (!item || typeof item !== 'object') continue
      const candidate = item as { path?: unknown; enabled?: unknown }
      if (typeof candidate.path !== 'string' || !candidate.path.trim()) continue
      sources.push({
        path: resolve(candidate.path),
        enabled: candidate.enabled !== false
      })
    }
  } else if (typeof config.cacheDir === 'string' && config.cacheDir.trim()) {
    sources.push({
      path: resolve(config.cacheDir),
      enabled: true
    })
  } else {
    sources.push({
      path: resolve(defaultPath),
      enabled: true
    })
  }

  return dedupeCacheDirectories(sources)
}

export function dedupeCacheDirectories(sources: StoredCacheDirectory[]): StoredCacheDirectory[] {
  const seen = new Set<string>()
  const deduped: StoredCacheDirectory[] = []

  for (const source of sources) {
    const key = normalizePathKey(source.path)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({
      path: resolve(source.path),
      enabled: source.enabled
    })
  }

  return deduped
}

export function toCacheDirectorySources(
  sources: StoredCacheDirectory[],
  defaultPath: string,
  exists: (pathValue: string) => boolean
): CacheDirectorySource[] {
  const defaultKey = normalizePathKey(defaultPath)
  const lastEnabledIndex = findLastEnabledIndex(sources)

  return sources.map((source, index) => ({
    id: cacheDirectoryId(source.path),
    path: source.path,
    enabled: source.enabled,
    exists: exists(source.path),
    isDefault: normalizePathKey(source.path) === defaultKey,
    isPrimary: index === lastEnabledIndex
  }))
}

export function findLastEnabledIndex(sources: StoredCacheDirectory[]): number {
  for (let index = sources.length - 1; index >= 0; index -= 1) {
    if (sources[index].enabled) return index
  }
  return -1
}
