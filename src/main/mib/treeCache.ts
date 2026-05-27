import type { MibModule, MibNode, MibParseResult } from './types'

export interface MibTreeCache {
  invalidate: () => void
  getTree: (modules: MibModule[]) => MibNode[]
  setTree: (nodes: MibNode[]) => void
}

export function createMibTreeCache(
  buildTree: (modules: MibModule[]) => MibNode[],
  onTreeUpdated?: (nodes: MibNode[]) => void
): MibTreeCache {
  let nodes: MibNode[] = []
  let isDirty = false

  const setTree = (nextNodes: MibNode[]): void => {
    nodes = nextNodes
    isDirty = false
    onTreeUpdated?.(nodes)
  }

  return {
    invalidate: () => {
      isDirty = true
    },
    getTree: (modules) => {
      if (isDirty) {
        setTree(buildTree(modules))
      }
      return nodes
    },
    setTree
  }
}

export function attachTreeToLoadedResult(result: MibParseResult, tree: MibNode[]): MibParseResult {
  if (result.modules.length === 0) return result

  return {
    ...result,
    tree
  }
}
