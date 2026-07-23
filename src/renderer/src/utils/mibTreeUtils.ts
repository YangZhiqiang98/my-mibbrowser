import type { MibTreeNodeData } from '../types'
import type { MibNamedValue } from '../../../main/mib/types'

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
  enumValues?: MibNamedValue[]
  bits?: MibNamedValue[]
  textualConvention?: string
  displayHint?: string
  parentId: string | null
  children: string[]
}

/**
 * Build tree structure from flat MIB node list (returned from main process IPC).
 * Resolves OIDs by walking the parent chain for nodes with empty oidString.
 */
export function buildTreeFromNodes(nodes: RawMibNode[]): MibTreeNodeData[] {
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

      // No reliable OID source: leave this node's OID empty. Fabricating an OID
      // from the child index (`${parentOid}.${childIndex + 1}`) produced wrong
      // OIDs whenever the child position did not match the numeric suffix,
      // causing SNMP operations to target the wrong object. An empty OID is
      // correctly treated as "not operable" downstream.
    }
  }

  // Deduplicate children arrays (immutable: create new node copies)
  const dedupedNodes = nodes.map(node => ({
    ...node,
    children: [...new Set(node.children)]
  }))
  const dedupedMap = new Map(dedupedNodes.map(n => [n.id, n]))

  // Build tree structure - deduplicate roots by ID
  const rootSet = new Set<string>()
  const roots = dedupedNodes.filter(n => {
    if (n.parentId && dedupedMap.has(n.parentId)) return false
    if (rootSet.has(n.id)) return false
    rootSet.add(n.id)
    return true
  })

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
      enumValues: node.enumValues,
      bits: node.bits,
      textualConvention: node.textualConvention,
      displayHint: node.displayHint,
      children: node.children
        .map(cid => dedupedMap.get(cid))
        .filter((n): n is RawMibNode => !!n)
        .map(buildNode)
    }
  }

  return roots.map(buildNode)
}
