import { describe, expect, it } from 'vitest'
import { compareOids, isNoSuchNameEnd, isStrictlyIncreasing, SNMP_NO_SUCH_NAME_STATUS } from './oid'

describe('compareOids', () => {
  it('returns 0 for identical OIDs', () => {
    expect(compareOids('1.3.6.1.2.1', '1.3.6.1.2.1')).toBe(0)
  })

  it('compares segments numerically, not lexically', () => {
    // Arrange: 2 < 10 numerically, but "10" < "2" lexically.
    // Act / Assert
    expect(compareOids('1.3.6.1.2.1.2', '1.3.6.1.2.1.10')).toBeLessThan(0)
    expect(compareOids('1.3.6.1.2.1.10', '1.3.6.1.2.1.2')).toBeGreaterThan(0)
  })

  it('treats a prefix OID as smaller than its descendant', () => {
    expect(compareOids('1.3.6.1', '1.3.6.1.1')).toBeLessThan(0)
    expect(compareOids('1.3.6.1.1', '1.3.6.1')).toBeGreaterThan(0)
  })

  it('normalizes leading and trailing dots before comparing', () => {
    expect(compareOids('.1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.1.0')).toBe(0)
    expect(compareOids('1.3.6.1.', '1.3.6.1')).toBe(0)
  })
})

describe('isStrictlyIncreasing', () => {
  it('allows the first OID (null previous)', () => {
    expect(isStrictlyIncreasing(null, '1.3.6.1.2.1.1.1.0')).toBe(true)
  })

  it('returns true when the next OID is greater', () => {
    expect(isStrictlyIncreasing('1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.2.0')).toBe(true)
  })

  it('returns false when the next OID equals the previous (loop guard)', () => {
    expect(isStrictlyIncreasing('1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.1.0')).toBe(false)
  })

  it('returns false when the next OID is smaller (non-increasing agent)', () => {
    expect(isStrictlyIncreasing('1.3.6.1.2.1.1.2.0', '1.3.6.1.2.1.1.1.0')).toBe(false)
  })
})

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
