import type { ToolWindowMibNode } from '../../../shared/toolWindowTypes'
import type { MibTreeNodeData } from '../types'

export function toSlimToolWindowMibNode(node: MibTreeNodeData): ToolWindowMibNode {
  return {
    id: node.id,
    name: node.name,
    oid: node.oid,
    kind: node.kind,
    access: node.access,
    syntax: node.syntax,
    module: node.module,
    description: node.description,
    enumValues: node.enumValues,
    bits: node.bits,
    textualConvention: node.textualConvention,
    displayHint: node.displayHint,
    children: []
  }
}

export function toToolWindowMibSubtree(node: MibTreeNodeData): ToolWindowMibNode {
  return {
    ...toSlimToolWindowMibNode(node),
    children: node.children.map(toToolWindowMibSubtree)
  }
}

export function buildToolWindowResultMibTree(nodes: readonly MibTreeNodeData[]): MibTreeNodeData[] {
  const seen = new Set<string>()
  const result: MibTreeNodeData[] = []

  for (const node of nodes) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    result.push(toSlimToolWindowMibNode(node))
  }

  return result
}
