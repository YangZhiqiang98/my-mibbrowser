import { describe, expect, it } from 'vitest'
import { buildCsv, buildXml, escapeXml, sanitizeXmlTagName } from './exporters'

describe('buildCsv', () => {
  it('prepends a UTF-8 BOM', () => {
    // Arrange
    const data = [{ oid: '1.3.6.1', value: 'test' }]

    // Act
    const csv = buildCsv(data)

    // Assert
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('neutralizes formula injection with a leading quote', () => {
    // Arrange
    const data = [{ value: '=1+1' }]

    // Act
    const csv = buildCsv(data)

    // Assert
    expect(csv).toContain("'=1+1")
  })

  it('neutralizes +, -, and @ prefixed cells', () => {
    const csv = buildCsv([{ a: '+2', b: '-3', c: '@x' }])
    expect(csv).toContain("'+2")
    expect(csv).toContain("'-3")
    expect(csv).toContain("'@x")
  })

  it('quotes and escapes cells containing separators or quotes', () => {
    const csv = buildCsv([{ value: 'a,b"c' }])
    expect(csv).toContain('"a,b""c"')
  })

  it('returns an empty string for empty input', () => {
    expect(buildCsv([])).toBe('')
  })
})

describe('sanitizeXmlTagName', () => {
  it('replaces spaces and brackets with underscores', () => {
    expect(sanitizeXmlTagName('SNMP Value [hex]')).toBe('SNMP_Value__hex_')
  })

  it('prefixes names that start with a digit', () => {
    expect(sanitizeXmlTagName('1column')).toBe('_1column')
  })

  it('keeps already-valid names unchanged', () => {
    expect(sanitizeXmlTagName('oid')).toBe('oid')
  })
})

describe('buildXml', () => {
  it('uses sanitized tag names instead of raw headers', () => {
    // Arrange
    const data = [{ 'SNMP Value': 'x' }]

    // Act
    const xml = buildXml(data)

    // Assert
    expect(xml).toContain('<SNMP_Value>x</SNMP_Value>')
    expect(xml).not.toContain('<SNMP Value>')
  })

  it('escapes XML special characters in values', () => {
    const xml = buildXml([{ value: 'a < b & c' }])
    expect(xml).toContain('a &lt; b &amp; c')
  })

  it('returns an empty string for empty input', () => {
    expect(buildXml([])).toBe('')
  })
})

describe('escapeXml', () => {
  it('escapes all five XML entities', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;')
  })
})
