import type { MibTreeNodeData } from '../types'

interface RawMibNode {
  id: string
  name: string
  oid?: number[]
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
 * Build tree structure from flat MIB node list (returned from main process IPC).
 * Resolves OIDs by walking the parent chain for nodes with empty oidString.
 */
export function buildTreeFromNodes(nodes: RawMibNode[]): MibTreeNodeData[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Resolve OIDs for nodes with empty oidString by walking up the parent chain
  const resolvedOids = new Map<string, string>()
  for (const node of nodes) {
    if (node.oidString) {
      resolvedOids.set(node.id, node.oidString)
    }
  }

  // Iteratively resolve OIDs for nodes whose parents have been resolved
  let changed = true
  let iterations = 0
  while (changed && iterations < 20) {
    changed = false
    iterations++
    for (const node of nodes) {
      if (resolvedOids.has(node.id)) continue
      if (!node.parentId) continue

      // If node has its own oid array from the main process, use it directly
      if (node.oid && Array.isArray(node.oid) && node.oid.length > 0) {
        resolvedOids.set(node.id, node.oid.join('.'))
        changed = true
        continue
      }

      const parentOid = resolvedOids.get(node.parentId)
      if (!parentOid) continue

      // Find the child index from the parent's children array
      const parent = nodeMap.get(node.parentId)
      if (!parent) continue

      const childIndex = parent.children.indexOf(node.id)
      if (childIndex >= 0) {
        const fullOid = `${parentOid}.${childIndex}`
        resolvedOids.set(node.id, fullOid)
        changed = true
      }
    }
  }

  // Build tree structure
  const roots = nodes.filter(n => !n.parentId || !nodeMap.has(n.parentId))

  function buildNode(node: RawMibNode): MibTreeNodeData {
    const resolvedOid = resolvedOids.get(node.id) || node.oidString
    return {
      id: node.id,
      name: node.name,
      oid: resolvedOid,
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
