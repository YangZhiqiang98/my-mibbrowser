import { describe, it, expect } from 'vitest'
import { buildNameToOidIndex, resolveNameToOid } from './resolveNameToOid'
import type { MibTreeNodeData } from '../types'

const mibTree: MibTreeNodeData[] = [
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
    name: 'ifDescr',
    oid: '.1.3.6.1.2.1.2.2.1.2',
    kind: 'scalar',
    access: 'read-only',
    syntax: 'DisplayString',
    module: 'IF-MIB',
    children: []
  }
]

describe('buildNameToOidIndex', () => {
  it('indexes names case-insensitively and dotless', () => {
    // Arrange / Act
    const index = buildNameToOidIndex(mibTree)

    // Assert
    expect(index.byName.get('sysdescr')).toBe('1.3.6.1.2.1.1.1')
    expect(index.byName.get('ifdescr')).toBe('1.3.6.1.2.1.2.2.1.2')
  })

  it('keeps the first occurrence when a name is duplicated', () => {
    const dup: MibTreeNodeData[] = [
      { ...mibTree[0], id: 'a', oid: '1.1' },
      { ...mibTree[0], id: 'b', oid: '2.2' }
    ]

    const index = buildNameToOidIndex(dup)

    expect(index.byName.get('sysdescr')).toBe('1.1')
  })
})

describe('resolveNameToOid', () => {
  const index = buildNameToOidIndex(mibTree)

  it('passes a numeric OID through unchanged', () => {
    expect(resolveNameToOid('1.3.6.1.2.1.1.1.0', index)).toBe('1.3.6.1.2.1.1.1.0')
  })

  it('strips a leading dot from a numeric OID', () => {
    expect(resolveNameToOid('.1.3.6.1.2.1.1.1.0', index)).toBe('1.3.6.1.2.1.1.1.0')
  })

  it('resolves a bare symbolic name to its base OID', () => {
    expect(resolveNameToOid('sysDescr', index)).toBe('1.3.6.1.2.1.1.1')
  })

  it('resolves a symbolic name with a numeric instance suffix', () => {
    expect(resolveNameToOid('sysDescr.0', index)).toBe('1.3.6.1.2.1.1.1.0')
  })

  it('resolves a multi-segment instance suffix', () => {
    expect(resolveNameToOid('ifDescr.1', index)).toBe('1.3.6.1.2.1.2.2.1.2.1')
  })

  it('resolves a module-qualified name', () => {
    expect(resolveNameToOid('SNMPv2-MIB::sysDescr.0', index)).toBe('1.3.6.1.2.1.1.1.0')
  })

  it('is case-insensitive on the object name', () => {
    expect(resolveNameToOid('SYSDESCR.0', index)).toBe('1.3.6.1.2.1.1.1.0')
  })

  it('returns null for an unknown symbolic name', () => {
    expect(resolveNameToOid('nonExistentObject.0', index)).toBeNull()
  })

  it('returns null for an empty or whitespace token', () => {
    expect(resolveNameToOid('   ', index)).toBeNull()
    expect(resolveNameToOid('', index)).toBeNull()
  })
})
