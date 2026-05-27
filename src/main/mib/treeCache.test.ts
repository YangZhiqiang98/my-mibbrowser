import { describe, expect, it, vi } from 'vitest'
import type { MibModule, MibNode, MibParseResult } from './types'
import { attachTreeToLoadedResult, createMibTreeCache } from './treeCache'

function makeNode(name: string, oidString: string): MibNode {
  return {
    id: `TEST::${name}`,
    name,
    oid: oidString.split('.').map(Number),
    oidString,
    syntax: 'OBJECT IDENTIFIER',
    access: 'not-accessible',
    status: 'current',
    description: '',
    kind: 'group',
    module: 'TEST',
    parentId: null,
    children: [],
    isTable: false,
    indexColumns: [],
    oidDef: ''
  }
}

function makeModule(name: string): MibModule {
  return {
    name,
    description: '',
    lastUpdated: '',
    organization: '',
    contactInfo: '',
    rootOid: '',
    nodes: [makeNode(`${name}Root`, '1.3.6.1.4.1.99999')],
    imports: {},
    textualConventions: {},
    dependencyWarnings: []
  }
}

function makeResult(modules: MibModule[]): MibParseResult {
  return {
    modules,
    errors: [],
    warnings: [],
    dependencyWarnings: []
  }
}

describe('MIB tree cache', () => {
  it('rebuilds only after invalidation and reuses the cached tree otherwise', () => {
    let buildCount = 0
    const buildTree = vi.fn(() => [makeNode(`built${++buildCount}`, '1.3.6.1.4.1.99999')])
    const onTreeUpdated = vi.fn()
    const cache = createMibTreeCache(buildTree, onTreeUpdated)
    const modules = [makeModule('TEST-MIB')]

    expect(cache.getTree(modules)).toEqual([])
    expect(buildTree).not.toHaveBeenCalled()

    cache.invalidate()
    const firstTree = cache.getTree(modules)
    const secondTree = cache.getTree(modules)

    expect(firstTree).toBe(secondTree)
    expect(buildTree).toHaveBeenCalledTimes(1)
    expect(onTreeUpdated).toHaveBeenCalledWith(firstTree)

    cache.invalidate()
    const thirdTree = cache.getTree(modules)

    expect(thirdTree).not.toBe(firstTree)
    expect(buildTree).toHaveBeenCalledTimes(2)
    expect(onTreeUpdated).toHaveBeenLastCalledWith(thirdTree)
  })

  it('does not rebuild after an explicit tree snapshot is set', () => {
    const buildTree = vi.fn(() => [makeNode('rebuilt', '1.3')])
    const cache = createMibTreeCache(buildTree)
    const snapshot = [makeNode('snapshot', '1.3.6')]

    cache.invalidate()
    cache.setTree(snapshot)

    expect(cache.getTree([makeModule('TEST-MIB')])).toBe(snapshot)
    expect(buildTree).not.toHaveBeenCalled()
  })

  it('attaches a current tree snapshot only to load results with parsed modules', () => {
    const modules = [makeModule('TEST-MIB')]
    const tree = [makeNode('snapshot', '1.3.6')]
    const loadedResult = makeResult(modules)
    const emptyResult = makeResult([])

    expect(attachTreeToLoadedResult(loadedResult, tree)).toEqual({
      ...loadedResult,
      tree
    })
    expect(attachTreeToLoadedResult(emptyResult, tree)).toBe(emptyResult)
  })
})
