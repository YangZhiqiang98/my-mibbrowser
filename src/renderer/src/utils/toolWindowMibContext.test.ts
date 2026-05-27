import { describe, expect, it } from 'vitest'
import type { MibTreeNodeData } from '../types'
import {
  buildToolWindowResultMibTree,
  toSlimToolWindowMibNode,
  toToolWindowMibSubtree
} from './toolWindowMibContext'

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
    kind: children.length > 0 ? 'table' : 'scalar',
    access: 'read-only',
    syntax: '',
    module: 'TEST-MIB',
    children
  }
}

const column = makeNode('col', 'ifDescr', '1.3.6.1.2.1.2.2.1.2')
const entry = makeNode('entry', 'ifEntry', '1.3.6.1.2.1.2.2.1', [column])
const table = makeNode('table', 'ifTable', '1.3.6.1.2.1.2.2', [entry])

describe('toolWindowMibContext', () => {
  it('creates slim tool-window nodes without child subtrees', () => {
    const slim = toSlimToolWindowMibNode(table)

    expect(slim).toMatchObject({
      id: table.id,
      name: table.name,
      oid: table.oid,
      kind: table.kind,
      module: table.module
    })
    expect(slim.children).toEqual([])
  })

  it('preserves subtree children for Table Viewer launch seeds', () => {
    const subtree = toToolWindowMibSubtree(table)

    expect(subtree.children).toHaveLength(1)
    expect(subtree.children[0].id).toBe(entry.id)
    expect(subtree.children[0].children[0].id).toBe(column.id)
  })

  it('builds a deduplicated slim result-resolution tree from GET/SET rows', () => {
    const mibTree = buildToolWindowResultMibTree([column, column, table])

    expect(mibTree.map((node) => node.id)).toEqual([column.id, table.id])
    expect(mibTree[0].children).toEqual([])
    expect(mibTree[1].children).toEqual([])
  })
})
