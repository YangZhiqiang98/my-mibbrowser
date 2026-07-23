import { describe, expect, it } from 'vitest'
import { convertSetValue, prepareSetVarbinds } from './setValues'

describe('convertSetValue', () => {
  it('converts a valid INTEGER string to a number', () => {
    // Arrange
    const type = 'INTEGER'
    const raw = '42'

    // Act
    const result = convertSetValue(type, raw)

    // Assert
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('rejects a non-numeric INTEGER with a friendly error', () => {
    // Arrange / Act
    const result = convertSetValue('INTEGER', 'abc')

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('INTEGER')
  })

  it('accepts negative INTEGER values', () => {
    expect(convertSetValue('INTEGER', '-5')).toEqual({ ok: true, value: -5 })
  })

  it('rejects INTEGER out of 32-bit range', () => {
    const result = convertSetValue('INTEGER', '3000000000')
    expect(result.ok).toBe(false)
  })

  it('rejects negative values for unsigned Gauge32', () => {
    const result = convertSetValue('Gauge32', '-1')
    expect(result.ok).toBe(false)
  })

  it('keeps Counter64 as a decimal string to avoid precision loss', () => {
    const result = convertSetValue('Counter64', '18446744073709551615')
    expect(result).toEqual({ ok: true, value: '18446744073709551615' })
  })

  it('validates a dotted IPv4 IpAddress', () => {
    expect(convertSetValue('IpAddress', '10.0.0.1')).toEqual({ ok: true, value: '10.0.0.1' })
  })

  it('rejects an out-of-range IpAddress octet', () => {
    const result = convertSetValue('IpAddress', '10.0.0.999')
    expect(result.ok).toBe(false)
  })

  it('strips a leading dot from an OBJECT IDENTIFIER', () => {
    expect(convertSetValue('OBJECT IDENTIFIER', '.1.3.6.1')).toEqual({ ok: true, value: '1.3.6.1' })
  })

  it('rejects a non-numeric OBJECT IDENTIFIER', () => {
    const result = convertSetValue('OBJECT IDENTIFIER', 'sysDescr')
    expect(result.ok).toBe(false)
  })

  it('passes OCTET STRING values through unchanged', () => {
    expect(convertSetValue('OCTET STRING', 'hello world')).toEqual({ ok: true, value: 'hello world' })
  })
})

describe('prepareSetVarbinds', () => {
  const typeMap: Record<string, number> = {
    INTEGER: 2,
    'OCTET STRING': 4,
    Gauge32: 66
  }

  it('resolves ASN.1 type names to numeric constants for valid input', () => {
    // Arrange
    const values = [{ oid: '1.3.6.1.2.1.1.5.0', type: 'OCTET STRING', value: 'router1' }]

    // Act
    const result = prepareSetVarbinds(values, typeMap, 4)

    // Assert
    expect(result).toEqual({
      ok: true,
      varbinds: [{ oid: '1.3.6.1.2.1.1.5.0', type: 4, value: 'router1' }]
    })
  })

  it('returns the first conversion error without producing varbinds', () => {
    // Arrange
    const values = [
      { oid: '1.1', type: 'INTEGER', value: '10' },
      { oid: '1.2', type: 'INTEGER', value: 'oops' }
    ]

    // Act
    const result = prepareSetVarbinds(values, typeMap, 4)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('oops')
  })

  it('falls back to the provided type for unknown ASN.1 names', () => {
    const values = [{ oid: '1.1', type: 'Mystery', value: 'data' }]
    const result = prepareSetVarbinds(values, typeMap, 4)
    expect(result).toEqual({ ok: true, varbinds: [{ oid: '1.1', type: 4, value: 'data' }] })
  })
})
