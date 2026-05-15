import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { MibParser, buildMibTree, resolveOidToName } from '../mib/parser'
import type { MibParseResult, MibNode, MibModule } from '../mib/types'
import { snmpGet, snmpGetNext, snmpGetBulk, snmpSet, snmpWalk, snmpBulkWalk } from '../snmp/client'
import type { SnmpConfig, SnmpResult, SnmpSetValue, SnmpVarbind } from '../snmp/types'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const mibParser = new MibParser()

// In-memory MIB tree state - persists across loads for incremental building
let mibNodes: MibNode[] = []
let accumulatedModules: MibModule[] = []

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
  accumulatedModules = [...accumulatedModules, ...parseResult.modules]
  const tree = buildMibTree(accumulatedModules)
  mibNodes = tree

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

  const parseResult = mibParser.parseDirectory(result.filePaths[0])
  accumulatedModules = [...accumulatedModules, ...parseResult.modules]
  const tree = buildMibTree(accumulatedModules)
  mibNodes = tree

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
  accumulatedModules = [...accumulatedModules, ...parseResult.modules]
  const tree = buildMibTree(accumulatedModules)
  mibNodes = tree

  return parseResult
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
