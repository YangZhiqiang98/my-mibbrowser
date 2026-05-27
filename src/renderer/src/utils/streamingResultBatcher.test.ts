import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultVarbind } from '../types'
import { createStreamingResultBatcher } from './streamingResultBatcher'

function makeVarbind(index: number): ResultVarbind {
  return {
    key: `1.2.3.${index}`,
    index,
    oid: `1.2.3.${index}`,
    columnName: 'testColumn',
    instance: String(index),
    type: 'INTEGER',
    value: String(index),
    rawType: 'INTEGER',
    isError: false
  }
}

describe('createStreamingResultBatcher', () => {
  let rafCallback: FrameRequestCallback | null
  let requestFrame: ReturnType<typeof vi.fn>
  let cancelFrame: ReturnType<typeof vi.fn>

  beforeEach(() => {
    rafCallback = null
    requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      rafCallback = callback
      return 1
    })
    cancelFrame = vi.fn()

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: requestFrame
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: cancelFrame
    })
  })

  it('coalesces pushed batches until the scheduled frame flushes', () => {
    const appended: ResultVarbind[][] = []
    const batcher = createStreamingResultBatcher((varbinds) => appended.push(varbinds))

    batcher.push([makeVarbind(1)])
    batcher.push([makeVarbind(2), makeVarbind(3)])

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(appended).toEqual([])

    rafCallback?.(0)

    expect(appended).toEqual([[
      makeVarbind(1),
      makeVarbind(2),
      makeVarbind(3)
    ]])
  })

  it('flushes pending rows immediately when requested', () => {
    const appended: ResultVarbind[][] = []
    const batcher = createStreamingResultBatcher((varbinds) => appended.push(varbinds))

    batcher.push([makeVarbind(1)])
    batcher.flush()

    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(appended).toEqual([[makeVarbind(1)]])
  })

  it('drops pending rows on dispose', () => {
    const append = vi.fn()
    const batcher = createStreamingResultBatcher(append)

    batcher.push([makeVarbind(1)])
    batcher.dispose()
    rafCallback?.(0)

    expect(append).not.toHaveBeenCalled()
  })
})
