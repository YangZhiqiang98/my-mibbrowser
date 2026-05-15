import type { MibTreeNodeData } from '../types'

interface RawMibNode {
  id: string
  name: string
  oidString: string
  kind: string
  access: string
  syntax: string
  module: string
  description?: string
  parentId: string | null
  children: string[]
}

/**
 * Build tree structure from flat MIB node list (returned from main process IPC)
 */
export function buildTreeFromNodes(nodes: RawMibNode[]): MibTreeNodeData[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Find root nodes (no parent or parent not in our set)
  const roots = nodes.filter(n => !n.parentId || !nodeMap.has(n.parentId))

  function buildNode(node: RawMibNode): MibTreeNodeData {
    return {
      id: node.id,
      name: node.name,
      oid: node.oidString,
      kind: node.kind,
      access: node.access,
      syntax: node.syntax,
      module: node.module,
      description: node.description,
      children: node.children
        .map(cid => nodeMap.get(cid))
        .filter((n): n is RawMibNode => !!n)
        .map(buildNode)
    }
  }

  return roots.map(buildNode)
}
