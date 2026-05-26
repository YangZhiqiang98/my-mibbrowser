import { describe, it, expect } from 'vitest'
import { buildResultSession } from './resultColumns'
import type { MibTreeNodeData } from '../types'
import type { SnmpResult } from '../../../main/snmp/types'

const mockMibTree: MibTreeNodeData[] = [
  {
    id: '1',
    name: 'sysDescr',
    oid: '1.3.6.1.2.1.1.1',
    kind: 'scalar',
    access: 'read-only',
    syntax: 'DisplayString',
    module: 'SNMPv2-MIB',
    children: []
  },
  {
    id: '2',
    name: 'sysUpTime',
    oid: '1.3.6.1.2.1.1.3',
    kind: 'scalar',
    access: 'read-only',
    syntax: 'TimeTicks',
    module: 'SNMPv2-MIB',
    children: []
  },
  {
    id: '3',
    name: 'ifDescr',
    oid: '1.3.6.1.2.1.2.2.1.2',
    kind: 'scalar',
    access: 'read-only',
    syntax: 'DisplayString',
    module: 'IF-MIB',
    children: []
  },
  {
    id: '4',
    name: 'ifType',
    oid: '1.3.6.1.2.1.2.2.1.3',
    kind: 'scalar',
    access: 'read-only',
    syntax: 'INTEGER',
    module: 'IF-MIB',
    children: []
  }
]

function makeSnmpResult(varbinds: SnmpResult['varbinds'], options: Partial<SnmpResult> = {}): SnmpResult {
  return {
    success: true,
    varbinds,
    responseTime: 50,
    timestamp: Date.now(),
    ...options
  }
}

describe('buildResultSession', () => {
  it('returns flat varbind list from a GET response', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.1.1.0', value: 'Linux test', type: 'OCTET STRING', isError: false }
    ])

    const session = buildResultSession('GET', '1.3.6.1.2.1.1.1.0', result, mockMibTree)

    expect(session.varbinds).toHaveLength(1)
    expect(session.varbinds[0]).toEqual({
      key: '1.3.6.1.2.1.1.1.0',
      index: 1,
      oid: '1.3.6.1.2.1.1.1.0',
      columnName: 'sysDescr',
      instance: '0',
      type: 'OCTET STRING',
      value: 'Linux test',
      rawType: 'OCTET STRING',
      isError: false,
      errorTag: undefined
    })
  })

  it('returns flat varbind list from a WALK response', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.2.2.1.2.1', value: 'eth0', type: 'OCTET STRING', isError: false },
      { oid: '1.3.6.1.2.1.2.2.1.2.2', value: 'eth1', type: 'OCTET STRING', isError: false },
      { oid: '1.3.6.1.2.1.2.2.1.3.1', value: 6, type: 'INTEGER', isError: false },
      { oid: '1.3.6.1.2.1.2.2.1.3.2', value: 6, type: 'INTEGER', isError: false }
    ])

    const session = buildResultSession('WALK', '1.3.6.1.2.1.2.2.1', result, mockMibTree)

    expect(session.varbinds).toHaveLength(4)
    expect(session.varbinds[0].columnName).toBe('ifDescr')
    expect(session.varbinds[0].instance).toBe('1')
    expect(session.varbinds[1].columnName).toBe('ifDescr')
    expect(session.varbinds[1].instance).toBe('2')
    expect(session.varbinds[2].columnName).toBe('ifType')
    expect(session.varbinds[2].instance).toBe('1')
    expect(session.varbinds[3].columnName).toBe('ifType')
    expect(session.varbinds[3].instance).toBe('2')
  })

  it('preserves sequential 1-based indices', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.1.1.0', value: 'a', type: 'OCTET STRING', isError: false },
      { oid: '1.3.6.1.2.1.1.3.0', value: 123, type: 'TimeTicks', isError: false }
    ])

    const session = buildResultSession('GET', '1.3.6.1.2.1.1', result, mockMibTree)

    expect(session.varbinds.map((v) => v.index)).toEqual([1, 2])
  })

  it('handles error varbinds with isError and errorTag', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.1.1.0', value: null, type: 'noSuchObject', isError: true, error: 'noSuchObject' }
    ])

    const session = buildResultSession('GET', '1.3.6.1.2.1.1.1.0', result, mockMibTree)

    expect(session.varbinds).toHaveLength(1)
    expect(session.varbinds[0].isError).toBe(true)
    expect(session.varbinds[0].errorTag).toBe('noSuchObject')
    expect(session.varbinds[0].value).toBe('')
  })

  it('handles varbinds with no MIB match (fallback resolution)', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.4.1.99999.1.2.3', value: 'test', type: 'OCTET STRING', isError: false }
    ])

    const session = buildResultSession('GET', '1.3.6.1.4.1.99999', result, mockMibTree)

    expect(session.varbinds).toHaveLength(1)
    // Fallback splits at last dot: prefix=1.3.6.1.4.1.99999.1.2, instance=3
    expect(session.varbinds[0].instance).toBe('3')
    expect(session.varbinds[0].columnName).toBeTruthy()
  })

  it('handles single-segment fallback OIDs without losing the label', () => {
    const result = makeSnmpResult([
      { oid: '1', value: 'root', type: 'OCTET STRING', isError: false }
    ])

    const session = buildResultSession('WALK', '1', result, [])

    expect(session.varbinds).toHaveLength(1)
    expect(session.varbinds[0].columnName).toBe('1')
    expect(session.varbinds[0].instance).toBe('')
  })

  it('formats TimeTicks values', () => {
    const ticks = 1 * 8640000 + 2 * 360000 + 3 * 6000 + 4 * 100 + 56
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.1.3.0', value: ticks, type: 'TimeTicks', isError: false }
    ])

    const session = buildResultSession('GET', '1.3.6.1.2.1.1.3.0', result, mockMibTree)

    expect(session.varbinds[0].value).toBe('1d 2h 3m 4.56s')
  })

  it('carries error from failed response', () => {
    const result = makeSnmpResult([], { success: false, error: 'Timeout' })

    const session = buildResultSession('GET', '1.3.6.1.2.1.1.1.0', result, mockMibTree)

    expect(session.error).toBe('Timeout')
    expect(session.varbinds).toHaveLength(0)
  })

  it('filters GETBULK varbinds to rootOid subtree', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.1.1.0', value: 'Linux', type: 'OCTET STRING', isError: false },
      { oid: '1.3.6.1.2.1.99.99.0', value: 'other', type: 'OCTET STRING', isError: false }
    ])

    const session = buildResultSession('GETBULK', '1.3.6.1.2.1.1', result, mockMibTree)

    expect(session.varbinds).toHaveLength(1)
    expect(session.varbinds[0].columnName).toBe('sysDescr')
  })

  it('keeps all varbinds for WALK/BULK_WALK without subtree filtering', () => {
    const result = makeSnmpResult([
      { oid: '1.3.6.1.2.1.1.1.0', value: 'a', type: 'OCTET STRING', isError: false },
      { oid: '1.3.6.1.2.1.99.99.0', value: 'b', type: 'OCTET STRING', isError: false }
    ])

    const session = buildResultSession('WALK', '1.3.6.1.2.1', result, mockMibTree)

    expect(session.varbinds).toHaveLength(2)
  })
})
