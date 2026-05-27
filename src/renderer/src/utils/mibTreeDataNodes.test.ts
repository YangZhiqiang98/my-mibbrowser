import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DataNode } from 'antd/es/tree'
import type { MibTreeNodeData } from '../types'
import { createMibTreeDataNodeBuilder } from './mibTreeDataNodes'

interface TitleProps {
  className: string
  'data-node-id': string
  onDoubleClick: () => void
  style?: React.CSSProperties
  children?: React.ReactNode
}

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
const sysName = makeNode('SNMPv2-MIB::sysName', 'sysName', '1.3.6.1.2.1.1.5')
const system = makeNode('SNMPv2-MIB::system', 'system', '1.3.6.1.2.1.1', [sysDescr, sysName])

const ifDescr = makeNode('IF-MIB::ifDescr', 'ifDescr', '1.3.6.1.2.1.2.2.1.2')
const ifEntry = makeNode('IF-MIB::ifEntry', 'ifEntry', '1.3.6.1.2.1.2.2.1', [ifDescr])
const ifTable = makeNode('IF-MIB::ifTable', 'ifTable', '1.3.6.1.2.1.2.2', [ifEntry])

const tree = [system, ifTable]
const getNodeIcon = (kind: string): React.ReactNode => React.createElement('span', { className: `icon-${kind}` })

function buildOptions(searchMatchIds: string[] = [], onDoubleClick: (oid: string) => void = vi.fn()) {
  return {
    searchMatchIds: new Set(searchMatchIds),
    getNodeIcon,
    onNodeDoubleClick: onDoubleClick
  }
}

function getChild(dataNode: DataNode, index: number): DataNode {
  const child = dataNode.children?.[index]
  if (!child) throw new Error(`Missing child at index ${index}`)
  return child
}

function getTitle(dataNode: DataNode): React.ReactElement<TitleProps> {
  if (!React.isValidElement<TitleProps>(dataNode.title)) {
    throw new Error('Expected title to be a React element')
  }
  return dataNode.title
}

describe('createMibTreeDataNodeBuilder', () => {
  it('reuses DataNode arrays and objects when tree and highlight state are unchanged', () => {
    const builder = createMibTreeDataNodeBuilder()
    const options = buildOptions()

    const first = builder.build(tree, options)
    const second = builder.build(tree, options)

    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
    expect(getChild(second[0], 0)).toBe(getChild(first[0], 0))
    expect(second[1]).toBe(first[1])
  })

  it('rebuilds a highlighted node and its ancestor path while preserving unrelated branches', () => {
    const builder = createMibTreeDataNodeBuilder()
    const onDoubleClick = vi.fn()
    const options = buildOptions([], onDoubleClick)

    const before = builder.build(tree, options)
    const highlighted = builder.build(tree, buildOptions([sysDescr.id], onDoubleClick))

    expect(highlighted).not.toBe(before)
    expect(highlighted[0]).not.toBe(before[0])
    expect(getChild(highlighted[0], 0)).not.toBe(getChild(before[0], 0))
    expect(getChild(highlighted[0], 1)).toBe(getChild(before[0], 1))
    expect(highlighted[1]).toBe(before[1])
    expect(getTitle(getChild(highlighted[0], 0)).props.style).toEqual({
      background: '#fff3cd',
      padding: '0 2px',
      borderRadius: 2
    })
  })

  it('preserves node title, icon, leaf, children, and double-click OID behavior', () => {
    const onDoubleClick = vi.fn()
    const builder = createMibTreeDataNodeBuilder()

    const dataNodes = builder.build(tree, buildOptions([], onDoubleClick))
    const systemNode = dataNodes[0]
    const sysDescrNode = getChild(systemNode, 0)
    const title = getTitle(sysDescrNode)

    expect(systemNode.key).toBe(system.id)
    expect(systemNode.isLeaf).toBe(false)
    expect(sysDescrNode.key).toBe(sysDescr.id)
    expect(sysDescrNode.isLeaf).toBe(true)
    expect(getTitle(systemNode).props.children).toBe('system')
    expect(title.props.className).toBe('mib-node-title')
    expect(title.props['data-node-id']).toBe(sysDescr.id)
    expect(React.isValidElement(sysDescrNode.icon)).toBe(true)

    title.props.onDoubleClick()
    expect(onDoubleClick).toHaveBeenCalledWith(sysDescr.oid)
  })

  it('clear removes cached nodes and root arrays', () => {
    const builder = createMibTreeDataNodeBuilder()
    const options = buildOptions()

    const before = builder.build(tree, options)
    builder.clear()
    const after = builder.build(tree, options)

    expect(after).not.toBe(before)
    expect(after[0]).not.toBe(before[0])
  })
})
