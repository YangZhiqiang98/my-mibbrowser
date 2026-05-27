import React from 'react'
import type { DataNode } from 'antd/es/tree'
import type { MibTreeNodeData } from '../types'

interface MibTreeDataNodeCacheEntry {
  dataNode: DataNode
  childDataNodes: DataNode[]
  isMatch: boolean
  getNodeIcon: (kind: string) => React.ReactNode
  onNodeDoubleClick: (oid: string) => void
}

export interface MibTreeDataNodeBuildOptions {
  searchMatchIds: ReadonlySet<string>
  getNodeIcon: (kind: string) => React.ReactNode
  onNodeDoubleClick: (oid: string) => void
}

export interface MibTreeDataNodeBuilder {
  build: (tree: readonly MibTreeNodeData[], options: MibTreeDataNodeBuildOptions) => DataNode[]
  clear: () => void
}

const MATCH_TITLE_STYLE: React.CSSProperties = {
  background: '#fff3cd',
  padding: '0 2px',
  borderRadius: 2
}

export function createMibTreeDataNodeBuilder(): MibTreeDataNodeBuilder {
  let nodeCache = new WeakMap<MibTreeNodeData, MibTreeDataNodeCacheEntry>()
  let previousRootDataNodes: DataNode[] = []

  function build(tree: readonly MibTreeNodeData[], options: MibTreeDataNodeBuildOptions): DataNode[] {
    const rootDataNodes = tree.map((node) => buildNode(node, options))
    if (areDataNodeArraysEqual(rootDataNodes, previousRootDataNodes)) {
      return previousRootDataNodes
    }

    previousRootDataNodes = rootDataNodes
    return rootDataNodes
  }

  function buildNode(node: MibTreeNodeData, options: MibTreeDataNodeBuildOptions): DataNode {
    const childDataNodes = node.children.map((child) => buildNode(child, options))
    const isMatch = options.searchMatchIds.has(node.id)
    const cached = nodeCache.get(node)

    if (
      cached &&
      cached.isMatch === isMatch &&
      cached.getNodeIcon === options.getNodeIcon &&
      cached.onNodeDoubleClick === options.onNodeDoubleClick &&
      areDataNodeArraysEqual(cached.childDataNodes, childDataNodes)
    ) {
      return cached.dataNode
    }

    const dataNode: DataNode = {
      key: node.id,
      title: React.createElement(
        'span',
        {
          className: 'mib-node-title',
          'data-node-id': node.id,
          onDoubleClick: () => options.onNodeDoubleClick(node.oid),
          style: isMatch ? MATCH_TITLE_STYLE : undefined
        },
        node.name
      ),
      icon: React.createElement(
        'span',
        { className: `mib-node-icon mib-node-${node.kind}` },
        options.getNodeIcon(node.kind)
      ),
      children: childDataNodes,
      isLeaf: node.children.length === 0
    }

    nodeCache.set(node, {
      dataNode,
      childDataNodes,
      isMatch,
      getNodeIcon: options.getNodeIcon,
      onNodeDoubleClick: options.onNodeDoubleClick
    })

    return dataNode
  }

  return {
    build,
    clear: () => {
      nodeCache = new WeakMap<MibTreeNodeData, MibTreeDataNodeCacheEntry>()
      previousRootDataNodes = []
    }
  }
}

function areDataNodeArraysEqual(left: readonly DataNode[], right: readonly DataNode[]): boolean {
  if (left.length !== right.length) return false
  return left.every((node, index) => node === right[index])
}
