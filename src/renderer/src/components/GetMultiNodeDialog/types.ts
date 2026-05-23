import type { MibTreeNodeData } from '../../types'

/**
 * One editable row inside the multi-node GET dialog.
 *
 * Mirrors `SetRowDraft` but trimmed to the fields GET actually needs:
 *  - GET has no target value or type (those are SET concerns)
 *  - GET has no `currentValue` state machine — the result of the GET goes
 *    straight to the main result panel via `buildResultSession`, not into
 *    a per-row display
 *
 * `rowId` is a frontend-only uuid (independent of `node.id`) so the same
 * MIB node can appear twice with different instances.
 *
 * `instance` is the suffix appended to `node.oid`. Empty string is allowed
 * and `buildFullOid` (reused from SetMultiNodeDialog/rowUtils) normalizes
 * it to `.0` for scalar GETs.
 *
 * `instanceOptions` carries the result of a prior "fetch instances" walk:
 *  - `null`: never walked, render Instance as a free-form Input.
 *  - `[]`: walked but the device returned nothing — same Input, hint via
 *    toast at fetch time.
 *  - non-empty: walked successfully, render Instance as a `Select` with
 *    these suffixes (still allow free-form typing via `showSearch`).
 */
export interface GetRowDraft {
  rowId: string
  node: MibTreeNodeData
  instance: string
  instanceOptions: string[] | null
}

/**
 * Patch shape accepted by `useGetRows().patch(rowId, patch)`. Mirrors a
 * subset of `GetRowDraft` so callers can update one field at a time without
 * having to spread the whole row.
 */
export type GetRowPatch = Partial<Pick<GetRowDraft, 'instance' | 'instanceOptions'>>

/**
 * Validation failure for a single row. `null` from `validateGetRow` means OK.
 * GET only validates the composed full OID — there is no target value /
 * type to check (unlike SET).
 */
export interface GetRowError {
  rowId: string
  field: 'fullOid'
  message: string
}
