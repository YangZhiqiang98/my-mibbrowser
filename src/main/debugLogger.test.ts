import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  debugError,
  debugLog,
  isMainConsoleDebugOutputEnabled,
  isDebugModeEnabled,
  prepareForDebugLog,
  setDebugMode,
  setMainConsoleDebugOutput,
  subscribeDebugLogs
} from './debugLogger'

describe('debugLogger', () => {
  afterEach(() => {
    setDebugMode(false)
    setMainConsoleDebugOutput(false)
    vi.restoreAllMocks()
  })

  it('does not print debug logs when disabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    setDebugMode(false)
    debugLog('test', 'hidden', { oid: '1.3.6.1' })

    expect(isDebugModeEnabled()).toBe(false)
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('does not print main console logs by default when enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    setDebugMode(true)
    debugLog('test', 'visible', { oid: '1.3.6.1' })

    expect(isMainConsoleDebugOutputEnabled()).toBe(false)
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('prints main console logs when main console output is enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    setDebugMode(true)
    setMainConsoleDebugOutput(true)
    debugLog('test', 'visible', { oid: '1.3.6.1' })

    expect(debugSpy).toHaveBeenCalledWith('[debug:test] visible', { oid: '1.3.6.1' })
  })

  it('emits structured debug entries to subscribers only when enabled', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const subscriber = vi.fn()
    const unsubscribe = subscribeDebugLogs(subscriber)

    debugLog('test', 'hidden', { oid: '1.3.6.1' })
    expect(subscriber).not.toHaveBeenCalled()

    setDebugMode(true)
    debugLog('test', 'visible', { oid: '1.3.6.1' })

    expect(debugSpy).not.toHaveBeenCalled()
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(subscriber.mock.calls[0][0]).toMatchObject({
      level: 'debug',
      scope: 'test',
      message: 'visible',
      payload: { oid: '1.3.6.1' }
    })

    unsubscribe()
    debugLog('test', 'after unsubscribe')
    expect(subscriber).toHaveBeenCalledTimes(1)
  })

  it('emits structured debug errors to subscribers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const subscriber = vi.fn()
    const unsubscribe = subscribeDebugLogs(subscriber)

    setDebugMode(true)
    debugError('test', 'visible error', new Error('boom'), { community: 'public' })

    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(subscriber.mock.calls[0][0]).toMatchObject({
      level: 'error',
      scope: 'test',
      message: 'visible error',
      payload: {
        community: 'public',
        error: { name: 'Error', message: 'boom' }
      }
    })

    unsubscribe()
  })

  it('preserves SNMP request fields for explicit debug diagnostics', () => {
    expect(prepareForDebugLog({
      host: '192.0.2.1',
      community: 'public',
      username: 'operator',
      authPassword: 'auth',
      privPassword: 'priv',
      values: [{ oid: '1.3.6.1', value: 'secret-write' }]
    })).toEqual({
      host: '192.0.2.1',
      community: 'public',
      username: 'operator',
      authPassword: 'auth',
      privPassword: 'priv',
      values: [{ oid: '1.3.6.1', value: 'secret-write' }]
    })
  })

  it('summarizes buffers and truncates large arrays', () => {
    const prepared = prepareForDebugLog({
      buffer: Buffer.from([1, 2, 3]),
      values: Array.from({ length: 22 }, (_, index) => index)
    })

    expect(prepared).toEqual({
      buffer: { type: 'Buffer', length: 3 },
      values: [
        0, 1, 2, 3, 4,
        5, 6, 7, 8, 9,
        10, 11, 12, 13, 14,
        15, 16, 17, 18, 19,
        '... 2 more item(s)'
      ]
    })
  })

  it('prints debug errors only when enabled', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    debugError('test', 'hidden', new Error('boom'))
    expect(errorSpy).not.toHaveBeenCalled()

    setDebugMode(true)
    setMainConsoleDebugOutput(true)
    debugError('test', 'visible', new Error('boom'), { community: 'public' })

    expect(errorSpy).toHaveBeenCalled()
    expect(errorSpy.mock.calls[0][0]).toBe('[debug:test] visible')
    expect(errorSpy.mock.calls[0][1]).toMatchObject({
      community: 'public',
      error: { name: 'Error', message: 'boom' }
    })
  })
})
