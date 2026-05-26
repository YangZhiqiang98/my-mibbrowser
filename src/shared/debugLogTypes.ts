export type DebugLogLevel = 'debug' | 'error'

export interface DebugLogEntry {
  id: number
  timestamp: number
  level: DebugLogLevel
  scope: string
  message: string
  payload?: unknown
}
