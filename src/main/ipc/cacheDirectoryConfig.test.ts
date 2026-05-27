import { describe, expect, it } from 'vitest'
import { resolve } from 'path'
import {
  cacheDirectoryId,
  dedupeCacheDirectories,
  findLastEnabledIndex,
  normalizeCacheDirectoryConfig,
  toCacheDirectorySources
} from './cacheDirectoryConfig'

describe('cacheDirectoryConfig', () => {
  it('normalizes legacy single-directory config', () => {
    const defaultPath = resolve('default-cache')
    const legacyPath = resolve('legacy-cache')

    expect(normalizeCacheDirectoryConfig({ cacheDir: legacyPath }, defaultPath)).toEqual([
      { path: legacyPath, enabled: true }
    ])
  })

  it('falls back to the default cache directory when config is missing or invalid', () => {
    const defaultPath = resolve('default-cache')

    expect(normalizeCacheDirectoryConfig({}, defaultPath)).toEqual([
      { path: defaultPath, enabled: true }
    ])
    expect(normalizeCacheDirectoryConfig({ cacheDirs: [{ path: '', enabled: true }] }, defaultPath)).toEqual([])
  })

  it('deduplicates directories by normalized path and preserves first occurrence', () => {
    const pathA = resolve('cache-a')
    const pathB = resolve('cache-b')

    expect(dedupeCacheDirectories([
      { path: pathA, enabled: true },
      { path: pathB, enabled: false },
      { path: pathA, enabled: false }
    ])).toEqual([
      { path: pathA, enabled: true },
      { path: pathB, enabled: false }
    ])
  })

  it('marks the last enabled directory as primary', () => {
    const defaultPath = resolve('cache-default')
    const firstPath = resolve('cache-first')
    const secondPath = resolve('cache-second')
    const missingPath = resolve('cache-missing')

    const sources = toCacheDirectorySources(
      [
        { path: defaultPath, enabled: true },
        { path: firstPath, enabled: false },
        { path: secondPath, enabled: true },
        { path: missingPath, enabled: false }
      ],
      defaultPath,
      (pathValue) => pathValue !== missingPath
    )

    expect(sources).toMatchObject([
      { path: defaultPath, enabled: true, exists: true, isDefault: true, isPrimary: false },
      { path: firstPath, enabled: false, exists: true, isDefault: false, isPrimary: false },
      { path: secondPath, enabled: true, exists: true, isDefault: false, isPrimary: true },
      { path: missingPath, enabled: false, exists: false, isDefault: false, isPrimary: false }
    ])
  })

  it('finds no primary index when every directory is disabled', () => {
    expect(findLastEnabledIndex([
      { path: resolve('cache-a'), enabled: false },
      { path: resolve('cache-b'), enabled: false }
    ])).toBe(-1)
  })

  it('generates stable ids from normalized paths', () => {
    expect(cacheDirectoryId(resolve('cache-a'))).toBe(cacheDirectoryId(resolve('cache-a')))
    expect(cacheDirectoryId(resolve('cache-a'))).not.toBe(cacheDirectoryId(resolve('cache-b')))
  })
})
