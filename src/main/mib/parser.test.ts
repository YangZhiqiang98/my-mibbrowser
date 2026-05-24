import { describe, expect, it } from 'vitest'
import { buildMibTree, MibParser } from './parser'

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
