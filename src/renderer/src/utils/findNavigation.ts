/**
 * Pure helpers for the MIB tree find bar. Kept free of React/DOM so the
 * navigation and expand-merge math stay unit-testable in isolation.
 */

/**
 * Advance a 0-based match index by `dir` (+1 next / -1 previous) with
 * wrap-around. `total <= 0` (no matches) collapses to 0.
 */
export function stepIndex(current: number, total: number, dir: 1 | -1): number {
  if (total <= 0) return 0
  return (current + dir + total) % total
}

/**
 * Union `prev` with `ancestors` without duplicates. Returns the SAME `prev`
 * array reference when `ancestors` adds nothing new — this is the perf
 * invariant that lets navigation grow `expandedKeys` by only the current
 * match's path instead of every match's path.
 */
export function mergeExpandedKeys(prev: string[], ancestors: readonly string[]): string[] {
  if (ancestors.length === 0) return prev
  const set = new Set(prev)
  let added = false
  for (const ancestor of ancestors) {
    if (!set.has(ancestor)) {
      set.add(ancestor)
      added = true
    }
  }
  return added ? Array.from(set) : prev
}
