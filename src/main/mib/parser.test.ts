import { describe, expect, it } from 'vitest'
import type { MibNode } from './types'
import {
  buildMibTree,
  createOidNameResolver,
  MibParser,
  parseOidDef,
  resolveOidToName,
  resolveOidToNameWithResolver,
  resolveParent
} from './parser'

const baseMib = `
BASE-MIB DEFINITIONS ::= BEGIN

baseRoot OBJECT IDENTIFIER ::= { enterprises 99999 }

BaseStatus ::= TEXTUAL-CONVENTION
    DISPLAY-HINT "d"
    STATUS current
    DESCRIPTION "Base status convention"
    SYNTAX INTEGER {
        up(1),
        down(2)
    }

baseTable OBJECT-TYPE
    SYNTAX SEQUENCE OF BaseEntry
    MAX-ACCESS not-accessible
    STATUS current
    DESCRIPTION "Base table"
    ::= { baseRoot 1 }

baseEntry OBJECT-TYPE
    SYNTAX BaseEntry
    MAX-ACCESS not-accessible
    STATUS current
    DESCRIPTION "Base entry"
    INDEX { baseIndex }
    ::= { baseTable 1 }

baseIndex OBJECT-TYPE
    SYNTAX INTEGER
    MAX-ACCESS not-accessible
    STATUS current
    DESCRIPTION "Base index"
    ::= { baseEntry 1 }

baseStatus OBJECT-TYPE
    SYNTAX BaseStatus
    MAX-ACCESS read-write
    STATUS current
    DESCRIPTION "Status value"
    ::= { baseEntry 2 }

baseFlags OBJECT-TYPE
    SYNTAX BITS {
        enabled(0),
        alarmed(1)
    }
    MAX-ACCESS read-only
    STATUS current
    DESCRIPTION "Flags"
    ::= { baseEntry 3 }

END
`

const childMib = `
CHILD-MIB DEFINITIONS ::= BEGIN

IMPORTS
    baseRoot, BaseStatus
        FROM BASE-MIB;

childValue OBJECT-TYPE
    SYNTAX BaseStatus
    MAX-ACCESS read-only
    STATUS current
    DESCRIPTION "Child value"
    ::= { baseRoot 2 }

END
`

function makeNode(name: string, oidString: string): MibNode {
  return {
    id: `TEST::${name}`,
    name,
    oid: oidString.split('.').map(Number),
    oidString,
    syntax: 'OBJECT-IDENTITY',
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

describe('MibParser dependency-aware parsing', () => {
  it('parses local dependencies before importers and preserves table metadata', () => {
    const parser = new MibParser()
    const result = parser.parseFileContents([
      { name: 'CHILD-MIB.my', content: childMib },
      { name: 'BASE-MIB.my', content: baseMib }
    ])

    expect(result.errors).toEqual([])
    expect(result.dependencyWarnings).toEqual([])
    expect(result.modules.map((module) => module.name)).toEqual(['BASE-MIB', 'CHILD-MIB'])

    const tree = buildMibTree(result.modules)
    const table = tree.find((node) => node.name === 'baseTable')
    const entry = tree.find((node) => node.name === 'baseEntry')

    expect(table?.kind).toBe('table')
    expect(entry?.kind).toBe('entry')
    expect(entry?.indexColumns).toEqual(['baseIndex'])
    expect(table?.oidString).toBe('1.3.6.1.4.1.99999.1')
  })

  it('reports missing dependency details without dropping parsed modules', () => {
    const parser = new MibParser()
    const result = parser.parseFileContents([
      { name: 'CHILD-MIB.my', content: childMib }
    ])

    expect(result.modules.map((module) => module.name)).toEqual(['CHILD-MIB'])
    expect(result.dependencyWarnings).toHaveLength(1)
    expect(result.dependencyWarnings[0]).toMatchObject({
      module: 'CHILD-MIB',
      sourceFile: 'CHILD-MIB.my',
      missingModule: 'BASE-MIB',
      symbols: ['baseRoot', 'BaseStatus']
    })
    expect(result.warnings[0]).toContain('missing module BASE-MIB')
  })

  it('preserves enum, BITS, textual convention, and display hint metadata', () => {
    const parser = new MibParser()
    const result = parser.parseFileContents([
      { name: 'BASE-MIB.my', content: baseMib }
    ])

    const module = result.modules[0]
    const statusNode = module.nodes.find((node) => node.name === 'baseStatus')
    const flagsNode = module.nodes.find((node) => node.name === 'baseFlags')

    expect(module.textualConventions.BaseStatus).toMatchObject({
      name: 'BaseStatus',
      syntax: 'INTEGER { up(1), down(2) }',
      displayHint: 'd',
      module: 'BASE-MIB'
    })
    expect(statusNode).toMatchObject({
      textualConvention: 'BaseStatus',
      displayHint: 'd',
      enumValues: [
        { name: 'up', value: 1 },
        { name: 'down', value: 2 }
      ]
    })
    expect(flagsNode?.bits).toEqual([
      { name: 'enabled', value: 0 },
      { name: 'alarmed', value: 1 }
    ])
  })
})

describe('OID name resolver', () => {
  it('matches exact OIDs and longest child prefixes with leading-dot normalization', () => {
    const nodes = [
      makeNode('ifTable', '1.3.6.1.2.1.2.2'),
      makeNode('ifEntry', '1.3.6.1.2.1.2.2.1'),
      makeNode('ifDescr', '1.3.6.1.2.1.2.2.1.2')
    ]
    const resolver = createOidNameResolver(nodes)

    expect(resolveOidToNameWithResolver('1.3.6.1.2.1.2.2.1', resolver)).toBe('ifEntry')
    expect(resolveOidToNameWithResolver('.1.3.6.1.2.1.2.2.1.2.7', resolver)).toBe('ifDescr.7')
  })

  it('does not match lexical prefixes across OID segment boundaries', () => {
    const nodes = [
      makeNode('ifDescr', '1.3.6.1.2.1.2.2.1.2')
    ]
    const resolver = createOidNameResolver(nodes)

    expect(resolveOidToNameWithResolver('1.3.6.1.2.1.2.2.1.20.7', resolver)).toBe(
      '1.3.6.1.2.1.2.2.1.20.7'
    )
  })

  it('keeps the compatibility wrapper behavior equivalent to the resolver path', () => {
    const nodes = [
      makeNode('sysDescr', '1.3.6.1.2.1.1.1')
    ]

    expect(resolveOidToName('.1.3.6.1.2.1.1.1.0', nodes)).toBe('sysDescr.0')
  })
})

function makeNodeIn(module: string, name: string, oidString: string): MibNode {
  return {
    ...makeNode(name, oidString || '0'),
    id: `${module}::${name}`,
    module,
    oid: oidString ? oidString.split('.').map(Number) : [],
    oidString
  }
}

function buildIndices(nodes: MibNode[]): {
  byModuleName: Map<string, MibNode>
  byName: Map<string, MibNode[]>
} {
  const byModuleName = new Map<string, MibNode>()
  const byName = new Map<string, MibNode[]>()
  for (const node of nodes) {
    const key = `${node.module}::${node.name}`
    if (!byModuleName.has(key)) byModuleName.set(key, node)
    const list = byName.get(node.name)
    if (list) list.push(node)
    else byName.set(node.name, [node])
  }
  return { byModuleName, byName }
}

describe('parseOidDef', () => {
  it('parses a single child number', () => {
    expect(parseOidDef('system 1')).toEqual({ parentName: 'system', childNumbers: [1] })
  })

  it('parses a large single child number', () => {
    expect(parseOidDef('enterprises 1234')).toEqual({
      parentName: 'enterprises',
      childNumbers: [1234]
    })
  })

  it('parses multiple trailing numbers like { enterprises 1 2 }', () => {
    expect(parseOidDef('{ enterprises 1 2 }')).toEqual({
      parentName: 'enterprises',
      childNumbers: [1, 2]
    })
  })

  it('returns null when there is no trailing number', () => {
    expect(parseOidDef('iso')).toBeNull()
    expect(parseOidDef('')).toBeNull()
  })
})

describe('resolveParent', () => {
  it('prefers a parent defined in the same module', () => {
    // Arrange: two modules each define a `products` node.
    const productsA = makeNodeIn('A-MIB', 'products', '1.3.6.1.4.1.100')
    const productsB = makeNodeIn('B-MIB', 'products', '1.3.6.1.4.1.200')
    const { byModuleName, byName } = buildIndices([productsA, productsB])

    // Act
    const parent = resolveParent('products', 'B-MIB', byModuleName, byName, true)

    // Assert
    expect(parent).toBe(productsB)
  })

  it('falls back to a cross-module match when the same module has none', () => {
    const enterprises = makeNodeIn('RFC', 'enterprises', '1.3.6.1.4.1')
    const { byModuleName, byName } = buildIndices([enterprises])

    const parent = resolveParent('enterprises', 'VENDOR-MIB', byModuleName, byName, true)

    expect(parent).toBe(enterprises)
  })

  it('skips an unresolved same-module parent when a resolved OID is required', () => {
    // Same-module parent exists but has no OID yet; a resolved cross-module one does.
    const unresolvedSameModule = makeNodeIn('VENDOR-MIB', 'base', '')
    const resolvedOther = makeNodeIn('RFC', 'base', '1.3.6.1.4.1.9')
    const { byModuleName, byName } = buildIndices([unresolvedSameModule, resolvedOther])

    const parent = resolveParent('base', 'VENDOR-MIB', byModuleName, byName, true)

    expect(parent).toBe(resolvedOther)
  })
})

describe('buildMibTree parent resolution', () => {
  it('attaches cross-module same-named parents to their own module', () => {
    // Arrange
    const aMib = `
A-MIB DEFINITIONS ::= BEGIN
IMPORTS enterprises FROM SNMPv2-SMI;
products OBJECT IDENTIFIER ::= { enterprises 100 }
aItem OBJECT IDENTIFIER ::= { products 1 }
END
`
    const bMib = `
B-MIB DEFINITIONS ::= BEGIN
IMPORTS enterprises FROM SNMPv2-SMI;
products OBJECT IDENTIFIER ::= { enterprises 200 }
bItem OBJECT IDENTIFIER ::= { products 1 }
END
`
    const parser = new MibParser()
    const result = parser.parseFileContents([
      { name: 'A-MIB.my', content: aMib },
      { name: 'B-MIB.my', content: bMib }
    ])

    // Act
    const tree = buildMibTree(result.modules)
    const flat = new Map(tree.map((n) => [n.id, n]))

    // Assert: each item anchors under its own module's `products`.
    expect(flat.get('A-MIB::aItem')?.oidString).toBe('1.3.6.1.4.1.100.1')
    expect(flat.get('B-MIB::bItem')?.oidString).toBe('1.3.6.1.4.1.200.1')
  })

  it('resolves multi-segment definitions like { enterprises 1 2 }', () => {
    const mMib = `
M-MIB DEFINITIONS ::= BEGIN
IMPORTS enterprises FROM SNMPv2-SMI;
foo OBJECT IDENTIFIER ::= { enterprises 1 2 }
END
`
    const parser = new MibParser()
    const result = parser.parseFileContents([{ name: 'M-MIB.my', content: mMib }])

    const tree = buildMibTree(result.modules)
    const foo = tree.find((n) => n.id === 'M-MIB::foo')

    expect(foo?.oidString).toBe('1.3.6.1.4.1.1.2')
  })
})
