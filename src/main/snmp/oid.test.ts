import { describe, expect, it } from 'vitest'
import { isNoSuchNameEnd, SNMP_NO_SUCH_NAME_STATUS } from './oid'

describe('isNoSuchNameEnd', () => {
  it('detects a net-snmp RequestFailedError with noSuchName status', () => {
    const error = { name: 'RequestFailedError', status: SNMP_NO_SUCH_NAME_STATUS }
    expect(isNoSuchNameEnd(error)).toBe(true)
  })

  it('returns false for a generic error without a noSuchName status', () => {
    expect(isNoSuchNameEnd(new Error('Socket forcibly closed'))).toBe(false)
    expect(isNoSuchNameEnd({ status: 5 })).toBe(false)
  })

  it('returns false for null / non-object errors', () => {
    expect(isNoSuchNameEnd(null)).toBe(false)
    expect(isNoSuchNameEnd('boom')).toBe(false)
  })
})
