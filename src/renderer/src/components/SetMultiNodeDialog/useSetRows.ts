import { useCallback, useState } from 'react'
import type { MibTreeNodeData } from '../../types'
import type { SetRowDraft, SetRowPatch } from './types'
import { makeRowFromNode } from './rowUtils'

export interface UseSetRowsApi {
  rows: SetRowDraft[]
  append: (node: MibTreeNodeData) => SetRowDraft
  remove: (rowId: string) => void
  patch: (rowId: string, patch: SetRowPatch) => void
  move: (rowId: string, direction: 'up' | 'down') => void
  reset: () => void
}

/**
 * Row collection state for SetMultiNodeDialog. All mutations return new
 * arrays so React + Zustand stay happy; callers can rely on referential
 * inequality to detect changes.
 */
export function useSetRows(initial: SetRowDraft[] = []): UseSetRowsApi {
  const [rows, setRows] = useState<SetRowDraft[]>(initial)

  const append = useCallback((node: MibTreeNodeData): SetRowDraft => {
    const row = makeRowFromNode(node)
    setRows((prev) => [...prev, row])
    return row
  }, [])

  const remove = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  }, [])

  const patch = useCallback((rowId: string, p: SetRowPatch) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...p } : r)))
  }, [])

  const move = useCallback((rowId: string, direction: 'up' | 'down') => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.rowId === rowId)
      if (idx < 0) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      const [moved] = next.splice(idx, 1)
      next.splice(target, 0, moved)
      return next
    })
  }, [])

  const reset = useCallback(() => setRows([]), [])

  return { rows, append, remove, patch, move, reset }
}
