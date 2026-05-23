import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MibTreeNodeData } from '../../types'
import { useSetRows } from './useSetRows'

function makeNode(id: string, name = id): MibTreeNodeData {
  return {
    id,
    name,
    oid: `1.3.6.1.2.1.${id.length}`,
    kind: 'column',
    access: 'read-write',
    syntax: 'INTEGER',
    module: 'TEST-MIB',
    children: []
  }
}

describe('useSetRows', () => {
  it('appends, patches, moves, removes, and resets rows immutably', () => {
    const { result } = renderHook(() => useSetRows())

    act(() => {
      result.current.append(makeNode('one'))
      result.current.append(makeNode('two'))
      result.current.append(makeNode('three'))
    })

    const initialRows = result.current.rows
    expect(initialRows.map((row) => row.node.id)).toEqual(['one', 'two', 'three'])

    act(() => {
      result.current.patch(initialRows[1].rowId, { targetValue: '42' })
    })

    const patchedRows = result.current.rows
    expect(patchedRows).not.toBe(initialRows)
    expect(patchedRows[1].targetValue).toBe('42')
    expect(patchedRows[0]).toBe(initialRows[0])

    act(() => {
      result.current.moveTo(patchedRows[2].rowId, patchedRows[0].rowId)
    })

    const movedRows = result.current.rows
    expect(movedRows.map((row) => row.node.id)).toEqual(['three', 'one', 'two'])

    act(() => {
      result.current.remove(movedRows[1].rowId)
    })

    expect(result.current.rows.map((row) => row.node.id)).toEqual(['three', 'two'])

    act(() => {
      result.current.reset()
    })

    expect(result.current.rows).toEqual([])
  })
})
