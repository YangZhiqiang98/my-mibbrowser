import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { MibParser, buildMibTree, resolveOidToName } from '../mib/parser'
import type { MibParseResult, MibNode, MibModule } from '../mib/types'
import { snmpGet, snmpGetNext, snmpGetBulk, snmpSet, snmpWalk, snmpBulkWalk } from '../snmp/client'
import type { SnmpConfig, SnmpResult, SnmpSetValue, SnmpVarbind } from '../snmp/types'
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'

const mibParser = new MibParser()

// In-memory MIB tree state - persists across loads for incremental building
let mibNodes: MibNode[] = []
let accumulatedModules: MibModule[] = []

// Track which directory each module came from, for dedup on reload
let directoryModuleMap: Map<string, string[]> = new Map()

const CACHE_VERSION = 3 // Bump when cache format or parsing logic changes
const CACHE_DIR_CONFIG_FILE = 'cache-dir-config.json'

interface MibCache {
  version?: number
  timestamp: number
  modules: MibModule[]
  nodes: MibNode[]
  /** Original directory path that was loaded to produce this cache */
  sourceDir?: string
}

interface CacheDirConfig {
  cacheDir: string
}

/**
 * Get the path for the cache directory configuration file.
 */
function getCacheDirConfigPath(): string {
  return join(app.getPath('userData'), CACHE_DIR_CONFIG_FILE)
}

/**
 * Get the configured cache directory path.
 * Returns the user-configured directory, or falls back to userData.
 */
function getCacheDir(): string {
  try {
    const configPath = getCacheDirConfigPath()
    if (existsSync(configPath)) {
      const config: CacheDirConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (config.cacheDir && existsSync(config.cacheDir)) {
        return config.cacheDir
      }
    }
  } catch {
    // Fall through to default
  }
  return app.getPath('userData')
}

/**
 * Sanitize a directory name for use as a cache file name component.
 * Includes a short hash of the full path to avoid collisions when
 * different directories share the same base name (e.g., C:\MIBs vs D:\MIBs).
 */
function sanitizeDirName(dirPath: string): string {
  const name = basename(dirPath).replace(/[^a-zA-Z0-9_-]/g, '_')
  const hash = createHash('md5').update(dirPath).digest('hex').slice(0, 8)
  return `${name}_${hash}`
}

/**
 * Get the cache file path for a specific MIB directory.
 */
function getDirectoryCachePath(dirPath: string): string {
  const dirName = sanitizeDirName(dirPath)
  return join(getCacheDir(), `mib-cache-${dirName}.json`)
}

/**
 * Save current MIB tree state as a cache file for a specific directory.
 */
function saveCacheForDirectory(dirPath: string): void {
  try {
    const cacheDir = getCacheDir()
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }
    const cachePath = getDirectoryCachePath(dirPath)
    const modulesForDir = directoryModuleMap.get(dirPath) ?? []
    const modules = accumulatedModules.filter(m => modulesForDir.includes(m.name))
    const cache: MibCache = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      modules,
      nodes: [], // Tree is rebuilt from modules on load; no need to persist nodes
      sourceDir: dirPath
    }
    writeFileSync(cachePath, JSON.stringify(cache), 'utf-8')
  } catch {
    // Silent fail - cache is optional
  }
}

/**
 * Load all cache files from the configured cache directory and merge them.
 * Called on app startup to restore previously parsed MIB data.
 */
export function loadMibCache(): void {
  const cacheDir = getCacheDir()
  if (!existsSync(cacheDir)) return

  try {
    const files = readdirSync(cacheDir)
    const cacheFiles = files.filter(f => f.startsWith('mib-cache-') && f.endsWith('.json'))

    for (const file of cacheFiles) {
      const filePath = join(cacheDir, file)
      try {
        const raw = readFileSync(filePath, 'utf-8')
        const cache: MibCache = JSON.parse(raw)

        if (cache.version !== CACHE_VERSION) {
          try { unlinkSync(filePath) } catch { /* ignore */ }
          continue
        }

        if (cache.modules && cache.modules.length > 0) {
          // Merge modules, replacing duplicates by name
          const existingNames = new Set(accumulatedModules.map(m => m.name))
          for (const mod of cache.modules) {
            if (!existingNames.has(mod.name)) {
              accumulatedModules.push(mod)
            }
          }
          // Restore directory-module mapping so directory reload dedup works
          if (cache.sourceDir) {
            const existing = directoryModuleMap.get(cache.sourceDir) ?? []
            const newNames = cache.modules.map(m => m.name)
            const merged = [...new Set([...existing, ...newNames])]
            directoryModuleMap.set(cache.sourceDir, merged)
          }
        }
      } catch {
        // Corrupt cache file - skip
      }
    }

    if (accumulatedModules.length > 0) {
      mibNodes = buildMibTree(accumulatedModules)
    }
  } catch {
    // Directory read error - ignore
  }
}

/**
 * Register all IPC handlers for main process
 */
export function registerIpcHandlers(): void {
  // MIB file operations
  ipcMain.handle('mib:open-files', handleOpenMibFiles)
  ipcMain.handle('mib:open-directory', handleOpenMibDirectory)
  ipcMain.handle('mib:get-tree', handleGetMibTree)
  ipcMain.handle('mib:search', handleSearchMib)
  ipcMain.handle('mib:load-content', handleLoadMibContent)

  // Cache directory operations
  ipcMain.handle('mib:select-cache-dir', handleSelectCacheDir)
  ipcMain.handle('mib:get-cache-dir', handleGetCacheDir)

  // SNMP operations
  ipcMain.handle('snmp:get', handleSnmpGet)
  ipcMain.handle('snmp:get-next', handleSnmpGetNext)
  ipcMain.handle('snmp:get-bulk', handleSnmpGetBulk)
  ipcMain.handle('snmp:set', handleSnmpSet)
  ipcMain.handle('snmp:walk', handleSnmpWalk)
  ipcMain.handle('snmp:bulk-walk', handleSnmpBulkWalk)

  // Connection profiles
  ipcMain.handle('profile:save', handleSaveProfile)
  ipcMain.handle('profile:load', handleLoadProfiles)
  ipcMain.handle('profile:delete', handleDeleteProfile)

  // Export
  ipcMain.handle('export:csv', handleExportCsv)
  ipcMain.handle('export:xml', handleExportXml)
}

/**
 * Open file dialog to select MIB files and parse them.
 * Merges with previously loaded MIB modules for incremental building.
 */
async function handleOpenMibFiles(): Promise<MibParseResult> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { modules: [], errors: [{ line: 0, column: 0, message: 'No active window', severity: 'error' }], warnings: [] }
  }

  const result = await dialog.showOpenDialog(window, {
    title: 'Select MIB Files',
    filters: [
      { name: 'MIB Files', extensions: ['my', 'mib', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { modules: [], errors: [], warnings: [] }
  }

  const parseResult = mibParser.parseFiles(result.filePaths)
  // Merge modules, replacing duplicates by name
  const newNames = new Set(parseResult.modules.map(m => m.name))
  accumulatedModules = [
    ...accumulatedModules.filter(m => !newNames.has(m.name)),
    ...parseResult.modules
  ]
  mibNodes = buildMibTree(accumulatedModules)

  return parseResult
}

/**
 * Open directory dialog to select MIB directory.
 * Merges with previously loaded MIB modules for incremental building.
 */
async function handleOpenMibDirectory(): Promise<MibParseResult> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { modules: [], errors: [{ line: 0, column: 0, message: 'No active window', severity: 'error' }], warnings: [] }
  }

  const result = await dialog.showOpenDialog(window, {
    title: 'Select MIB Directory',
    properties: ['openDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { modules: [], errors: [], warnings: [] }
  }

  const dirPath = result.filePaths[0]
  const parseResult = mibParser.parseDirectory(dirPath)

  // Deduplicate: remove old modules from this directory, then add new ones
  const oldModuleNames = directoryModuleMap.get(dirPath) ?? []
  const newModuleNames = parseResult.modules.map(m => m.name)
  accumulatedModules = accumulatedModules.filter(m => !oldModuleNames.includes(m.name))
  accumulatedModules = [...accumulatedModules, ...parseResult.modules]

  // Update directory-module mapping
  directoryModuleMap.set(dirPath, newModuleNames)

  mibNodes = buildMibTree(accumulatedModules)

  // Save per-directory cache
  saveCacheForDirectory(dirPath)

  return parseResult
}

/**
 * Load MIB content from text strings (used for drag-and-drop from renderer).
 * The renderer reads file content via FileReader and sends it here.
 */
function handleLoadMibContent(
  _event: IpcMainInvokeEvent,
  contents: Array<{ name: string; content: string }>
): MibParseResult {
  const parseResult = mibParser.parseFileContents(contents)
  // Merge modules, replacing duplicates by name
  const newNames = new Set(parseResult.modules.map(m => m.name))
  accumulatedModules = [
    ...accumulatedModules.filter(m => !newNames.has(m.name)),
    ...parseResult.modules
  ]
  mibNodes = buildMibTree(accumulatedModules)

  return parseResult
}

/**
 * Select a custom cache directory via folder picker.
 * Persists the selection and loads any existing cache files from that directory.
 */
async function handleSelectCacheDir(): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) return null

  const result = await dialog.showOpenDialog(window, {
    title: 'Select Cache Directory',
    properties: ['openDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const cacheDir = result.filePaths[0]
  try {
    const configPath = getCacheDirConfigPath()
    const config: CacheDirConfig = { cacheDir }
    writeFileSync(configPath, JSON.stringify(config), 'utf-8')
  } catch {
    // Silent fail
  }

  // Load cache files from the newly selected directory
  loadMibCache()

  return cacheDir
}

/**
 * Get the currently configured cache directory path.
 */
function handleGetCacheDir(): string {
  return getCacheDir()
}

/**
 * Get the current MIB tree
 */
function handleGetMibTree(): MibNode[] {
  return mibNodes
}

/**
 * Search MIB nodes by name or OID
 */
function handleSearchMib(_event: IpcMainInvokeEvent, query: string): MibNode[] {
  if (!query || query.trim().length === 0) return []

  const lowerQuery = query.toLowerCase()
  return mibNodes.filter(node =>
    node.name.toLowerCase().includes(lowerQuery) ||
    node.oidString.includes(lowerQuery)
  ).slice(0, 100) // Limit results
}

/**
 * Resolve OID names in SNMP varbinds using the current MIB tree
 */
function resolveVarbindNames(varbinds: SnmpVarbind[]): SnmpVarbind[] {
  return varbinds.map(vb => ({
    ...vb,
    name: resolveOidToName(vb.oid, mibNodes)
  }))
}

/**
 * Execute SNMP GET
 */
async function handleSnmpGet(_event: IpcMainInvokeEvent, config: SnmpConfig, oids: string[]): Promise<SnmpResult> {
  const result = await snmpGet(config, oids)
  if (result.success) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }
  return result
}

/**
 * Execute SNMP GETNEXT
 */
async function handleSnmpGetNext(_event: IpcMainInvokeEvent, config: SnmpConfig, oids: string[]): Promise<SnmpResult> {
  const result = await snmpGetNext(config, oids)
  if (result.success) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }
  return result
}

/**
 * Execute SNMP GETBULK
 */
async function handleSnmpGetBulk(
  _event: IpcMainInvokeEvent, config: SnmpConfig, oids: string[],
  maxRepetitions?: number, nonRepeaters?: number
): Promise<SnmpResult> {
  const result = await snmpGetBulk(config, oids, maxRepetitions, nonRepeaters)
  if (result.success) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }
  return result
}

/**
 * Execute SNMP SET
 */
async function handleSnmpSet(_event: IpcMainInvokeEvent, config: SnmpConfig, values: SnmpSetValue[]): Promise<SnmpResult> {
  const result = await snmpSet(config, values)
  if (result.success) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }
  return result
}

/**
 * Execute SNMP WALK
 */
async function handleSnmpWalk(_event: IpcMainInvokeEvent, config: SnmpConfig, oid: string): Promise<SnmpResult> {
  const result = await snmpWalk(config, oid)
  if (result.success) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }
  return result
}

/**
 * Execute SNMP BULK WALK
 */
async function handleSnmpBulkWalk(
  _event: IpcMainInvokeEvent, config: SnmpConfig, oid: string, maxRepetitions?: number
): Promise<SnmpResult> {
  const result = await snmpBulkWalk(config, oid, maxRepetitions)
  if (result.success) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }
  return result
}

/**
 * Get profiles file path
 */
function getProfilesPath(): string {
  return join(app.getPath('userData'), 'connection-profiles.json')
}

/**
 * Save a connection profile
 */
function handleSaveProfile(_event: IpcMainInvokeEvent, profile: { id: string; name: string; config: SnmpConfig }): void {
  const profilesPath = getProfilesPath()
  let profiles: Array<{ id: string; name: string; config: SnmpConfig; createdAt: number; lastUsedAt: number }> = []

  if (existsSync(profilesPath)) {
    try {
      profiles = JSON.parse(readFileSync(profilesPath, 'utf-8'))
    } catch {
      profiles = []
    }
  }

  const existing = profiles.findIndex(p => p.id === profile.id)
  const now = Date.now()

  if (existing >= 0) {
    profiles[existing] = { ...profiles[existing], ...profile, lastUsedAt: now }
  } else {
    profiles.push({ ...profile, createdAt: now, lastUsedAt: now })
  }

  writeFileSync(profilesPath, JSON.stringify(profiles, null, 2), 'utf-8')
}

/**
 * Load all connection profiles
 */
function handleLoadProfiles(): Array<{ id: string; name: string; config: SnmpConfig; createdAt: number; lastUsedAt: number }> {
  const profilesPath = getProfilesPath()
  if (!existsSync(profilesPath)) return []

  try {
    return JSON.parse(readFileSync(profilesPath, 'utf-8'))
  } catch {
    return []
  }
}

/**
 * Delete a connection profile
 */
function handleDeleteProfile(_event: IpcMainInvokeEvent, profileId: string): void {
  const profilesPath = getProfilesPath()
  if (!existsSync(profilesPath)) return

  try {
    const profiles: Array<{ id: string }> = JSON.parse(readFileSync(profilesPath, 'utf-8'))
    const filtered = profiles.filter(p => p.id !== profileId)
    writeFileSync(profilesPath, JSON.stringify(filtered, null, 2), 'utf-8')
  } catch {
    // Ignore errors
  }
}

/**
 * Export results to CSV
 */
async function handleExportCsv(
  _event: IpcMainInvokeEvent,
  data: Array<Record<string, unknown>>
): Promise<boolean> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window || data.length === 0) return false

  const result = await dialog.showSaveDialog(window, {
    title: 'Export to CSV',
    defaultPath: 'snmp-results.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  })

  if (result.canceled || !result.filePath) return false

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        const str = String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    )
  ].join('\n')

  writeFileSync(result.filePath, csvContent, 'utf-8')
  return true
}

/**
 * Export results to XML
 */
async function handleExportXml(
  _event: IpcMainInvokeEvent,
  data: Array<Record<string, unknown>>
): Promise<boolean> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window || data.length === 0) return false

  const result = await dialog.showSaveDialog(window, {
    title: 'Export to XML',
    defaultPath: 'snmp-results.xml',
    filters: [{ name: 'XML Files', extensions: ['xml'] }]
  })

  if (result.canceled || !result.filePath) return false

  const headers = Object.keys(data[0])
  const xmlContent = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<snmpResults>',
    ...data.map(row => [
      '  <result>',
      ...headers.map(h => `    <${h}>${escapeXml(String(row[h] ?? ''))}</${h}>`),
      '  </result>'
    ].join('\n')),
    '</snmpResults>'
  ].join('\n')

  writeFileSync(result.filePath, xmlContent, 'utf-8')
  return true
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
