import type { DebugLogEntry, DebugLogLevel } from '../shared/debugLogTypes'

let debugModeEnabled = false
let mainConsoleOutputEnabled = shouldEnableMainConsoleOutput()

const MAX_ARRAY_ITEMS = 20
let debugLogSequence = 0
const debugLogSubscribers = new Set<(entry: DebugLogEntry) => void>()

export function setDebugMode(enabled: boolean): void {
  debugModeEnabled = enabled
}

export function isDebugModeEnabled(): boolean {
  return debugModeEnabled
}

export function subscribeDebugLogs(callback: (entry: DebugLogEntry) => void): () => void {
  debugLogSubscribers.add(callback)
  return () => {
    debugLogSubscribers.delete(callback)
  }
}

export function setMainConsoleDebugOutput(enabled: boolean): void {
  mainConsoleOutputEnabled = enabled
}

export function isMainConsoleDebugOutputEnabled(): boolean {
  return mainConsoleOutputEnabled
}

export function debugLog(scope: string, message: string, context?: unknown): void {
  if (!debugModeEnabled) return
  const payload = context === undefined ? undefined : prepareForDebugLog(context)
  writeDebugToMainConsole(scope, message, payload)
  emitDebugEntry('debug', scope, message, payload)
}

export function debugError(scope: string, message: string, error: unknown, context?: unknown): void {
  if (!debugModeEnabled) return
  const payload = prepareForDebugLog({
    ...(isPlainRecord(context) ? context : { context }),
    error: formatError(error)
  })
  writeErrorToMainConsole(scope, message, payload)
  emitDebugEntry('error', scope, message, payload)
}

export function prepareForDebugLog(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Buffer.isBuffer(value)) {
    return { type: 'Buffer', length: value.length }
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => prepareForDebugLog(item))
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`... ${value.length - MAX_ARRAY_ITEMS} more item(s)`)
    }
    return items
  }

  if (value instanceof Error) {
    return formatError(value)
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = prepareForDebugLog(item)
    }
    return out
  }

  return String(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error)
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }
  return { message: String(error) }
}

function emitDebugEntry(level: DebugLogLevel, scope: string, message: string, payload: unknown): void {
  const entry: DebugLogEntry = {
    id: ++debugLogSequence,
    timestamp: Date.now(),
    level,
    scope,
    message,
    ...(payload === undefined ? {} : { payload })
  }

  for (const subscriber of debugLogSubscribers) {
    try {
      subscriber(entry)
    } catch {
      // Debug subscribers are observational; failures must not affect app behavior.
    }
  }
}

function writeDebugToMainConsole(scope: string, message: string, payload: unknown): void {
  if (!mainConsoleOutputEnabled) return
  if (payload === undefined) {
    console.debug(`[debug:${scope}] ${message}`)
    return
  }
  console.debug(`[debug:${scope}] ${message}`, payload)
}

function writeErrorToMainConsole(scope: string, message: string, payload: unknown): void {
  if (!mainConsoleOutputEnabled) return
  console.error(`[debug:${scope}] ${message}`, payload)
}

function shouldEnableMainConsoleOutput(): boolean {
  return process.env['ELECTRON_RENDERER_URL'] !== undefined || process.env['NODE_ENV'] === 'development'
}
