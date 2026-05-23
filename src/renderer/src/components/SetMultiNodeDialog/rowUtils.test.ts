import { describe, expect, it } from 'vitest'
import type { MibTreeNodeData } from '../../types'
import {
  buildFullOid,
  guessSetTypeFromSyntax,
  makeRowFromNode,
  stripBaseOid,
  validateRow
} from './rowUtils'

function makeNode(overrides: Partial<MibTreeNodeData> = {}): MibTreeNodeData {
  return {
    id: 'if-admin-status',
    name: 'ifAdminStatus',
    oid: '1.3.6.1.2.1.2.2.1.7',
    kind: 'column',
    access: 'read-write',
    syntax: 'INTEGER { up(1), down(2) }',
    module: 'IF-MIB',
    children: [],
    ...overrides
  }
}

describe('SetMultiNodeDialog row utilities', () => {
  it('builds full OIDs with normalized dots and scalar default', () => {
    expect(buildFullOid('1.3.6.1.2.1.1.1', '')).toBe('1.3.6.1.2.1.1.1.0')
    expect(buildFullOid('1.3.6.1.2.1.1.1', '.0')).toBe('1.3.6.1.2.1.1.1.0')
    expect(buildFullOid('.1.3.6.1', '.10.0.0.1')).toBe('1.3.6.1.10.0.0.1')
  })

  it('strips only segment-boundary base OID prefixes', () => {
    expect(stripBaseOid('1.3.6.1.2.1.2.2.1.7.10', '1.3.6.1.2.1.2.2.1.7')).toBe('10')
    expect(stripBaseOid('.1.3.6.1.2.1.2.2.1.7.10', '.1.3.6.1.2.1.2.2.1.7')).toBe('10')
    expect(stripBaseOid('1.3.6.1.2.1.21.1', '1.3.6.1.2.1.2')).toBe('1.3.6.1.2.1.21.1')
  })

  it('validates target value, type, and composed OID', () => {
    const row = makeRowFromNode(makeNode())

    expect(validateRow({ ...row, targetValue: '1' })).toBeNull()
    expect(validateRow({ ...row, targetValue: '' })?.field).toBe('targetValue')
    expect(validateRow({ ...row, targetValue: '1', type: '' })?.field).toBe('type')
    expect(validateRow({ ...row, targetValue: '1', node: makeNode({ oid: '1.3.bad' }) })?.field).toBe('fullOid')
  })

  it('guesses SNMP SET type from MIB syntax', () => {
    expect(guessSetTypeFromSyntax('INTEGER { up(1) }')).toBe('INTEGER')
    expect(guessSetTypeFromSyntax('OBJECT IDENTIFIER')).toBe('OBJECT IDENTIFIER')
    expect(guessSetTypeFromSyntax('IpAddress')).toBe('IpAddress')
    expect(guessSetTypeFromSyntax('DisplayString')).toBe('OCTET STRING')
  })
})
