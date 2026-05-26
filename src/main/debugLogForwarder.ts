import type { BrowserWindow } from 'electron'
import { subscribeDebugLogs } from './debugLogger'

export function registerDebugLogForwarder(mainWindow: BrowserWindow): void {
  const unsubscribe = subscribeDebugLogs((entry) => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
    try {
      mainWindow.webContents.send('debug:entry', entry)
    } catch {
      // The renderer can close while a debug event is being forwarded.
    }
  })

  mainWindow.once('closed', unsubscribe)
}
