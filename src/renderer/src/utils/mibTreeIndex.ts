import type { MibTreeNodeData } from '../types'

export interface MibTreeSearchResult {
  matchIds: string[]
  ancestorIds: string[]
}

export interface MibTreeIndex {
  nodeById: ReadonlyMap<string, MibTreeNodeData>
  parentById: ReadonlyMap<string, string>
  validNodeIds: ReadonlySet<string>
  getAncestorIds: (nodeId: string) => string[]
  getSubtreeKeys: (nodeId: string) => string[]
  search: (query: string, caseSensitive?: boolean) => MibTreeSearchResult
}

interface IndexedNode {
  node: MibTreeNodeData
  ancestorIds: string[]
  subtreeKeys: string[]
}

export function buildMibTreeIndex(tree: readonly MibTreeNodeData[]): MibTreeIndex {
  const nodeById = new Map<string, MibTreeNodeData>()
  const parentById = new Map<string, string>()
  const validNodeIds = new Set<string>()
  const indexedById = new Map<string, IndexedNode>()

  function visit(node: MibTreeNodeData, parentId: string | null, ancestorIds: string[]): string[] {
    nodeById.set(node.id, node)
    validNodeIds.add(node.id)
    if (parentId) parentById.set(node.id, parentId)

    const nodeAncestors = [...ancestorIds]
    const subtreeKeys = [node.id]
    indexedById.set(node.id, {
      node,
      ancestorIds: nodeAncestors,
      subtreeKeys
    })

    for (const child of node.children) {
      subtreeKeys.push(...visit(child, node.id, [...nodeAncestors, node.id]))
    }

    return subtreeKeys
  }

  for (const node of tree) {
    visit(node, null, [])
  }

  return {
    nodeById,
    parentById,
    validNodeIds,
    getAncestorIds: (nodeId) => [...(indexedById.get(nodeId)?.ancestorIds ?? [])],
    getSubtreeKeys: (nodeId) => [...(indexedById.get(nodeId)?.subtreeKeys ?? [])],
    search: (query, caseSensitive = false) => searchMibTreeIndex(indexedById, query, caseSensitive)
  }
}

function searchMibTreeIndex(
  indexedById: ReadonlyMap<string, IndexedNode>,
  query: string,
  caseSensitive: boolean
): MibTreeSearchResult {
  const trimmed = query.trim()
  if (!trimmed) {
    return { matchIds: [], ancestorIds: [] }
  }
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase()

  const matchIds: string[] = []
  const ancestorIds = new Set<string>()

  for (const indexedNode of indexedById.values()) {
    const { node } = indexedNode
    const name = caseSensitive ? node.name : node.name.toLowerCase()
    const oid = caseSensitive ? node.oid : node.oid.toLowerCase()
    const isMatch = name.includes(needle) || oid.includes(needle)

    if (isMatch) {
      matchIds.push(node.id)
      for (const ancestorId of indexedNode.ancestorIds) {
        ancestorIds.add(ancestorId)
      }
    }
  }

  return {
    matchIds,
    ancestorIds: [...ancestorIds]
  }
}
