import type { ResultVarbind } from '../types'

export interface StreamingResultBatcher {
  push: (varbinds: ResultVarbind[]) => void
  flush: () => void
  dispose: () => void
}

export function createStreamingResultBatcher(
  appendResultVarbinds: (varbinds: ResultVarbind[]) => void
): StreamingResultBatcher {
  let pending: ResultVarbind[] = []
  let frameId: number | null = null

  const cancelScheduledFlush = (): void => {
    if (frameId === null) return
    window.cancelAnimationFrame(frameId)
    frameId = null
  }

  const flush = (): void => {
    cancelScheduledFlush()
    if (pending.length === 0) return
    const next = pending
    pending = []
    appendResultVarbinds(next)
  }

  const scheduleFlush = (): void => {
    if (frameId !== null) return
    frameId = window.requestAnimationFrame(() => {
      frameId = null
      flush()
    })
  }

  return {
    push: (varbinds) => {
      if (varbinds.length === 0) return
      pending = [...pending, ...varbinds]
      scheduleFlush()
    },
    flush,
    dispose: () => {
      cancelScheduledFlush()
      pending = []
    }
  }
}
