import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  MibParser,
  buildMibTree,
  createOidNameResolver,
  resolveOidToNameWithResolver
} from '../mib/parser'
import type { MibOidNameResolver } from '../mib/parser'
import type { MibParseResult, MibNode, MibModule } from '../mib/types'
import { attachTreeToLoadedResult, createMibTreeCache } from '../mib/treeCache'
import { snmpGet, snmpGetNext, snmpGetBulk, snmpSet, snmpWalk, snmpBulkWalk, cancelCurrentSnmpOperation } from '../snmp/client'
import type { SnmpConfig, SnmpResult, SnmpSetValue, SnmpVarbind, SnmpWalkRequestOptions } from '../snmp/types'
import type { WalkOptions } from '../snmp/client'
import { getTrapReceiverStatus, startTrapReceiver, stopTrapReceiver } from '../snmp/trapReceiver'
import type { TrapNotificationEvent, TrapReceiverConfig, TrapReceiverStatus } from '../../shared/trapTypes'
import { debugLog, isDebugModeEnabled, setDebugMode } from '../debugLogger'
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'

const mibParser = new MibParser()

// In-memory MIB tree state - persists across loads for incremental building
let mibNodes: MibNode[] = []
let mibOidNameResolver: MibOidNameResolver = createOidNameResolver(mibNodes)
let accumulatedModules: MibModule[] = []

// Track which directory each module came from, for dedup on reload.
// The value is the actual MibModule reference so we can precisely remove
// just the modules that belonged to a directory on reload, even when
// different directories happen to contain modules with the same name.
let directoryModuleMap: Map<string, MibModule[]> = new Map()

const CACHE_VERSION = 5 // Bump when cache format or parsing logic changes
const CACHE_DIR_CONFIG_FILE = 'cache-dir-config.json'
const APP_SETTINGS_FILE = 'app-settings.json'

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

interface AppSettings {
  lastHost?: string
  lastSnmpConfig?: Partial<SnmpConfig>
}

function setMibNodes(nodes: MibNode[]): void {
  mibNodes = nodes
  mibOidNameResolver = createOidNameResolver(nodes)
}

const mibTreeCache = createMibTreeCache(buildMibTree, setMibNodes)

function markMibTreeDirty(): void {
  mibTreeCache.invalidate()
}

function getCurrentMibTree(): MibNode[] {
  return mibTreeCache.getTree(accumulatedModules)
}

function refreshMibTree(): MibNode[] {
  markMibTreeDirty()
  return getCurrentMibTree()
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
    const modules = directoryModuleMap.get(dirPath) ?? []
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
 *
 * Each cache file represents the modules loaded from one source directory
 * (or file-load / drag-and-drop key). Dedup is scoped by `${sourceDir}::${name}`
 * so two distinct source dirs that happen to share a module name do not wipe
 * each other's data. This fixes the regression where many cache files ended up
 * with a fallback module name (e.g. "IMPORTS") and used to clobber unrelated
 * cached modules.
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

        if (!cache.modules || cache.modules.length === 0) continue

        // sourceDir is the dedup namespace. Fall back to the cache file path
        // so caches missing sourceDir do not collapse together.
        const dirKey = cache.sourceDir ?? filePath

        // Within a single cache file, prefer the last occurrence if the
        // file accidentally contains duplicate module names.
        const modulesByName = new Map<string, MibModule>()
        for (const mod of cache.modules) {
          modulesByName.set(mod.name, mod)
        }

        // Remove any existing modules previously tracked for this source dir
        // (e.g. when the same cache file is loaded twice during a session)
        // and replace them with the fresh cache contents.
        const previousForDir = directoryModuleMap.get(dirKey) ?? []
        if (previousForDir.length > 0) {
          const previousSet = new Set(previousForDir)
          accumulatedModules = accumulatedModules.filter(m => !previousSet.has(m))
        }

        const modulesForDir: MibModule[] = []
        for (const mod of modulesByName.values()) {
          accumulatedModules.push(mod)
          modulesForDir.push(mod)
        }
        directoryModuleMap.set(dirKey, modulesForDir)
      } catch {
        // Corrupt cache file - skip
      }
    }

    if (accumulatedModules.length > 0) {
      refreshMibTree()
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
  ipcMain.handle('snmp:cancel', handleSnmpCancel)

  // Trap / Inform receiver
  ipcMain.handle('trap:start', handleTrapStart)
  ipcMain.handle('trap:stop', handleTrapStop)
  ipcMain.handle('trap:get-status', handleTrapGetStatus)

  // Connection profiles
  ipcMain.handle('profile:save', handleSaveProfile)
  ipcMain.handle('profile:load', handleLoadProfiles)
  ipcMain.handle('profile:delete', handleDeleteProfile)

  // App settings
  ipcMain.handle('settings:get-last-snmp-config', handleGetLastSnmpConfig)
  ipcMain.handle('settings:set-last-snmp-config', handleSetLastSnmpConfig)

  // Debug mode
  ipcMain.handle('debug:get-enabled', handleDebugGetEnabled)
  ipcMain.handle('debug:set-enabled', handleDebugSetEnabled)

  // Export
  ipcMain.handle('export:csv', handleExportCsv)
  ipcMain.handle('export:xml', handleExportXml)
}

function summarizeParseResult(result: MibParseResult): Record<string, unknown> {
  return {
    modules: result.modules.map((module) => module.name),
    moduleCount: result.modules.length,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    dependencyWarningCount: result.dependencyWarnings?.length ?? 0,
    errors: result.errors.map((error) => error.message),
    warnings: result.warnings,
    dependencyWarnings: result.dependencyWarnings?.map((warning) => ({
      module: warning.module,
      missingModule: warning.missingModule,
      symbols: warning.symbols
    })) ?? []
  }
}

/**
 * Open file dialog to select MIB files and parse them.
 * Merges with previously loaded MIB modules for incremental building.
 */
async function handleOpenMibFiles(): Promise<MibParseResult> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { modules: [], errors: [{ line: 0, column: 0, message: 'No active window', severity: 'error' }], warnings: [], dependencyWarnings: [] }
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
    return { modules: [], errors: [], warnings: [], dependencyWarnings: [] }
  }

  debugLog('mib', 'open files start', { fileCount: result.filePaths.length, files: result.filePaths })
  const parseResult = mibParser.parseFiles(result.filePaths)

  // "Files" load replaces the prior file-key bucket; other source directories
  // are preserved. Reference-based filtering avoids name collisions wiping
  // unrelated modules from other source dirs.
  const fileKey = '__file_load__'
  const previousForKey = directoryModuleMap.get(fileKey) ?? []
  let modulesChanged = false
  if (previousForKey.length > 0) {
    const previousSet = new Set(previousForKey)
    accumulatedModules = accumulatedModules.filter(m => !previousSet.has(m))
    modulesChanged = true
  }
  if (parseResult.modules.length > 0) {
    accumulatedModules = [...accumulatedModules, ...parseResult.modules]
    modulesChanged = true
  }
  directoryModuleMap.set(fileKey, [...parseResult.modules])

  const tree = modulesChanged ? refreshMibTree() : getCurrentMibTree()

  // Track loaded file modules for caching
  if (parseResult.modules.length > 0) {
    saveCacheForDirectory(fileKey)
  }

  debugLog('mib', 'open files finish', summarizeParseResult(parseResult))
  return attachTreeToLoadedResult(parseResult, tree)
}

/**
 * Open directory dialog to select MIB directory.
 * Merges with previously loaded MIB modules for incremental building.
 */
async function handleOpenMibDirectory(): Promise<MibParseResult> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { modules: [], errors: [{ line: 0, column: 0, message: 'No active window', severity: 'error' }], warnings: [], dependencyWarnings: [] }
  }

  const result = await dialog.showOpenDialog(window, {
    title: 'Select MIB Directory',
    properties: ['openDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { modules: [], errors: [], warnings: [], dependencyWarnings: [] }
  }

  const dirPath = result.filePaths[0]
  debugLog('mib', 'open directory start', { dirPath })
  const parseResult = mibParser.parseDirectory(dirPath)

  // Remove only the modules that this directory contributed previously
  // (tracked by reference, not by name) so other directories' modules with
  // the same name are not collateral damage.
  const previousForDir = directoryModuleMap.get(dirPath) ?? []
  let modulesChanged = false
  if (previousForDir.length > 0) {
    const previousSet = new Set(previousForDir)
    accumulatedModules = accumulatedModules.filter(m => !previousSet.has(m))
    modulesChanged = true
  }
  if (parseResult.modules.length > 0) {
    accumulatedModules = [...accumulatedModules, ...parseResult.modules]
    modulesChanged = true
  }

  // Update directory-module mapping with the fresh module references
  directoryModuleMap.set(dirPath, [...parseResult.modules])

  const tree = modulesChanged ? refreshMibTree() : getCurrentMibTree()

  // Save per-directory cache
  saveCacheForDirectory(dirPath)

  debugLog('mib', 'open directory finish', summarizeParseResult(parseResult))
  return attachTreeToLoadedResult(parseResult, tree)
}

/**
 * Load MIB content from text strings (used for drag-and-drop from renderer).
 * The renderer reads file content via FileReader and sends it here.
 */
function handleLoadMibContent(
  _event: IpcMainInvokeEvent,
  contents: Array<{ name: string; content: string }>
): MibParseResult {
  debugLog('mib', 'load content start', {
    fileCount: contents.length,
    files: contents.map((content) => ({ name: content.name, bytes: content.content.length }))
  })
  const parseResult = mibParser.parseFileContents(contents)

  // Drag-and-drop is tracked under a single bucket. Replace prior modules from
  // that bucket using reference identity to avoid removing modules contributed
  // by other source directories.
  const fileKey = '__dnd_load__'
  const previousForKey = directoryModuleMap.get(fileKey) ?? []
  const newNames = new Set(parseResult.modules.map(m => m.name))
  // From the previous DnD bucket, drop any modules that share a name with the
  // freshly dropped content (they are being re-loaded). Keep the rest so the
  // user can build a DnD set incrementally.
  const survivingPrevious = previousForKey.filter(m => !newNames.has(m.name))
  const previousSet = new Set(previousForKey)
  const modulesChanged = parseResult.modules.length > 0
  if (modulesChanged) {
    accumulatedModules = accumulatedModules.filter(m => !previousSet.has(m))
    accumulatedModules = [...accumulatedModules, ...survivingPrevious, ...parseResult.modules]

    directoryModuleMap.set(fileKey, [...survivingPrevious, ...parseResult.modules])
  }

  const tree = modulesChanged ? refreshMibTree() : getCurrentMibTree()

  if (parseResult.modules.length > 0) {
    saveCacheForDirectory(fileKey)
  }

  debugLog('mib', 'load content finish', summarizeParseResult(parseResult))
  return attachTreeToLoadedResult(parseResult, tree)
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
  return getCurrentMibTree()
}

/**
 * Search MIB nodes by name or OID
 */
function handleSearchMib(_event: IpcMainInvokeEvent, query: string): MibNode[] {
  if (!query || query.trim().length === 0) return []

  const lowerQuery = query.toLowerCase()
  return getCurrentMibTree().filter(node =>
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
    name: resolveOidToNameWithResolver(vb.oid, mibOidNameResolver)
  }))
}

function finalizeWalkResult(result: SnmpResult, options?: SnmpWalkRequestOptions): SnmpResult {
  if (!result.success) return result
  if (!options?.omitFinalVarbinds) {
    return {
      ...result,
      varbinds: resolveVarbindNames(result.varbinds)
    }
  }

  return {
    ...result,
    varbinds: [],
    streamed: true
  }
}

/**
 * Execute SNMP GET
 */
async function handleSnmpGet(_event: IpcMainInvokeEvent, config: SnmpConfig, oids: string[]): Promise<SnmpResult> {
  debugLog('ipc', 'snmp:get invoke', { config, oids })
  const result = await snmpGet(config, oids)
  debugLog('ipc', 'snmp:get result', { success: result.success, error: result.error, varbindCount: result.varbinds.length })
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
  debugLog('ipc', 'snmp:get-next invoke', { config, oids })
  const result = await snmpGetNext(config, oids)
  debugLog('ipc', 'snmp:get-next result', { success: result.success, error: result.error, varbindCount: result.varbinds.length })
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
  debugLog('ipc', 'snmp:get-bulk invoke', { config, oids, maxRepetitions, nonRepeaters })
  const result = await snmpGetBulk(config, oids, maxRepetitions, nonRepeaters)
  debugLog('ipc', 'snmp:get-bulk result', { success: result.success, error: result.error, varbindCount: result.varbinds.length })
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
  debugLog('ipc', 'snmp:set invoke', { config, values })
  const result = await snmpSet(config, values)
  debugLog('ipc', 'snmp:set result', { success: result.success, error: result.error, varbindCount: result.varbinds.length })
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
async function handleSnmpWalk(
  event: IpcMainInvokeEvent,
  config: SnmpConfig,
  oid: string,
  options?: SnmpWalkRequestOptions
): Promise<SnmpResult> {
  debugLog('ipc', 'snmp:walk invoke', { config, oid, options })
  const walkOptions: WalkOptions = {
    onProgress: (batch) => {
      event.sender.send('snmp:walk-progress', resolveVarbindNames(batch))
    }
  }
  const result = await snmpWalk(config, oid, walkOptions)
  debugLog('ipc', 'snmp:walk result', { success: result.success, error: result.error, varbindCount: result.varbinds.length })
  return finalizeWalkResult(result, options)
}

/**
 * Execute SNMP BULK WALK
 */
async function handleSnmpBulkWalk(
  event: IpcMainInvokeEvent,
  config: SnmpConfig,
  oid: string,
  maxRepetitions?: number,
  options?: SnmpWalkRequestOptions
): Promise<SnmpResult> {
  debugLog('ipc', 'snmp:bulk-walk invoke', { config, oid, maxRepetitions, options })
  const walkOptions: WalkOptions = {
    onProgress: (batch) => {
      event.sender.send('snmp:walk-progress', resolveVarbindNames(batch))
    }
  }
  const result = await snmpBulkWalk(config, oid, maxRepetitions, walkOptions)
  debugLog('ipc', 'snmp:bulk-walk result', { success: result.success, error: result.error, varbindCount: result.varbinds.length })
  return finalizeWalkResult(result, options)
}

/**
 * Cancel the currently in-flight SNMP operation. Idempotent: returns false
 * if nothing is running. See `cancelCurrentSnmpOperation` for the close()
 * mechanics.
 */
function handleSnmpCancel(_event: IpcMainInvokeEvent): boolean {
  const cancelled = cancelCurrentSnmpOperation()
  debugLog('ipc', 'snmp:cancel result', { cancelled })
  return cancelled
}

function handleTrapStart(_event: IpcMainInvokeEvent, config: TrapReceiverConfig): TrapReceiverStatus {
  debugLog('ipc', 'trap:start invoke', {
    port: config.port,
    transport: config.transport,
    disableAuthorization: config.disableAuthorization,
    includeAuthentication: config.includeAuthentication,
    communityConfigured: !!config.community.trim(),
    v3Enabled: config.v3.enabled,
    v3UserConfigured: !!config.v3.username.trim()
  })
  return startTrapReceiver(config, {
    resolveName: (oid) => resolveOidToNameWithResolver(oid, mibOidNameResolver),
    onEvent: broadcastTrapEvent,
    onStatus: broadcastTrapStatus
  })
}

function handleTrapStop(): TrapReceiverStatus {
  debugLog('ipc', 'trap:stop invoke')
  const status = stopTrapReceiver()
  broadcastTrapStatus(status)
  return status
}

function handleTrapGetStatus(): TrapReceiverStatus {
  return getTrapReceiverStatus()
}

function broadcastTrapEvent(event: TrapNotificationEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send('trap:event', event)
  }
}

function broadcastTrapStatus(status: TrapReceiverStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send('trap:status', status)
  }
}

function handleDebugGetEnabled(): boolean {
  return isDebugModeEnabled()
}

function handleDebugSetEnabled(_event: IpcMainInvokeEvent, enabled: boolean): boolean {
  if (!enabled) {
    debugLog('debug', 'debug mode disabled')
    setDebugMode(false)
    return isDebugModeEnabled()
  }
  setDebugMode(enabled)
  debugLog('debug', 'debug mode enabled')
  return isDebugModeEnabled()
}

/**
 * Get profiles file path
 */
function getProfilesPath(): string {
  return join(app.getPath('userData'), 'connection-profiles.json')
}

function getAppSettingsPath(): string {
  return join(app.getPath('userData'), APP_SETTINGS_FILE)
}

function readAppSettings(): AppSettings {
  const settingsPath = getAppSettingsPath()
  if (!existsSync(settingsPath)) return {}

  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as AppSettings
  } catch {
    return {}
  }
}

function writeAppSettings(settings: AppSettings): boolean {
  try {
    writeFileSync(getAppSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

function handleGetLastSnmpConfig(): Partial<SnmpConfig> | null {
  const settings = readAppSettings()
  if (settings.lastSnmpConfig) return settings.lastSnmpConfig

  const host = settings.lastHost?.trim()
  return host ? { host } : null
}

function handleSetLastSnmpConfig(_event: IpcMainInvokeEvent, config: SnmpConfig): Partial<SnmpConfig> | null {
  const settings = readAppSettings()
  const lastSnmpConfig: SnmpConfig = {
    ...config,
    host: config.host.trim()
  }
  if (!lastSnmpConfig.host) {
    delete settings.lastSnmpConfig
    delete settings.lastHost
    writeAppSettings(settings)
    return null
  }

  settings.lastSnmpConfig = lastSnmpConfig
  delete settings.lastHost
  return writeAppSettings(settings) ? lastSnmpConfig : null
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
