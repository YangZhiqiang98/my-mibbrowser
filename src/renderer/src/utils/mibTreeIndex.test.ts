import { describe, expect, it } from 'vitest'
import type { MibTreeNodeData } from '../types'
import { buildMibTreeIndex } from './mibTreeIndex'

function makeNode(
  id: string,
  name: string,
  oid: string,
  children: MibTreeNodeData[] = []
): MibTreeNodeData {
  return {
    id,
    name,
    oid,
    kind: children.length > 0 ? 'group' : 'scalar',
    access: 'read-only',
    syntax: '',
    module: 'TEST-MIB',
    children
  }
}

const sysDescr = makeNode('SNMPv2-MIB::sysDescr', 'sysDescr', '1.3.6.1.2.1.1.1')
const sysObjectId = makeNode('SNMPv2-MIB::sysObjectID', 'sysObjectID', '1.3.6.1.2.1.1.2')
const system = makeNode('SNMPv2-MIB::system', 'system', '1.3.6.1.2.1.1', [
  sysDescr,
  sysObjectId
])

const ifDescr = makeNode('IF-MIB::ifDescr', 'ifDescr', '1.3.6.1.2.1.2.2.1.2')
const ifAdminStatus = makeNode('IF-MIB::ifAdminStatus', 'ifAdminStatus', '1.3.6.1.2.1.2.2.1.7')
const ifEntry = makeNode('IF-MIB::ifEntry', 'ifEntry', '1.3.6.1.2.1.2.2.1', [
  ifDescr,
  ifAdminStatus
])
const ifTable = makeNode('IF-MIB::ifTable', 'ifTable', '1.3.6.1.2.1.2.2', [ifEntry])

const tree = [system, ifTable]

describe('buildMibTreeIndex', () => {
  it('indexes nodes by id and tracks valid node ids', () => {
    const index = buildMibTreeIndex(tree)

    expect(index.nodeById.get(sysDescr.id)).toBe(sysDescr)
    expect(index.nodeById.get(ifTable.id)).toBe(ifTable)
    expect(index.nodeById.get('missing')).toBeUndefined()
    expect(index.validNodeIds.has(sysObjectId.id)).toBe(true)
    expect(index.validNodeIds.has('missing')).toBe(false)
  })

  it('indexes each node parent id', () => {
    const index = buildMibTreeIndex(tree)

    expect(index.parentById.get(sysDescr.id)).toBe(system.id)
    expect(index.parentById.get(ifEntry.id)).toBe(ifTable.id)
    expect(index.parentById.has(system.id)).toBe(false)
  })

  it('returns ancestor ids from root to parent', () => {
    const index = buildMibTreeIndex(tree)

    expect(index.getAncestorIds(ifAdminStatus.id)).toEqual([ifTable.id, ifEntry.id])
    expect(index.getAncestorIds(system.id)).toEqual([])
    expect(index.getAncestorIds('missing')).toEqual([])
  })

  it('returns subtree keys in display order', () => {
    const index = buildMibTreeIndex(tree)

    expect(index.getSubtreeKeys(ifTable.id)).toEqual([
      ifTable.id,
      ifEntry.id,
      ifDescr.id,
      ifAdminStatus.id
    ])
    expect(index.getSubtreeKeys('missing')).toEqual([])
  })

  it('searches names and OIDs while collecting ancestors', () => {
    const index = buildMibTreeIndex(tree)

    expect(index.search('descr')).toEqual({
      matchIds: [sysDescr.id, ifDescr.id],
      ancestorIds: [system.id, ifTable.id, ifEntry.id]
    })

    expect(index.search('1.3.6.1.2.1.2.2.1.7')).toEqual({
      matchIds: [ifAdminStatus.id],
      ancestorIds: [ifTable.id, ifEntry.id]
    })
  })

  it('normalizes empty and case-insensitive search queries', () => {
    const index = buildMibTreeIndex(tree)

    expect(index.search('  IFADMINSTATUS  ').matchIds).toEqual([ifAdminStatus.id])
    expect(index.search('   ')).toEqual({ matchIds: [], ancestorIds: [] })
  })
})
