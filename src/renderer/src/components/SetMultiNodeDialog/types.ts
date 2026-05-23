import type { MibTreeNodeData } from '../../types'

/**
 * One editable row inside the GET / SET tool window.
 *
 * `rowId` is a frontend-only uuid (independent of `node.id`) so the same MIB
 * node can appear twice with different instances.
 *
 * `instance` is the suffix appended to `node.oid`. Empty string is allowed
 * and means "use scalar `.0`"; `buildFullOid` in rowUtils handles the
 * normalization (leading `.`, double-dot collapsing).
 *
 * `instanceOptions` carries the result of a prior "fetch instances" walk:
 *  - `null`: never walked, render Instance as a free-form Input.
 *  - `[]`: walked but the device returned nothing — same Input, but show a
 *    hint via toast at fetch time.
 *  - non-empty: walked successfully, render Instance as a `Select` with
 *    these suffixes (still allow free-form typing via `showSearch`).
 *
 * `currentValue` is a small state machine for the "fetch current value"
 * button so each row can show its own loading / ok / err state without
 * affecting siblings.
 */
export interface SetRowDraft {
  rowId: string
  node: MibTreeNodeData
  instance: string
  instanceOptions: string[] | null
  type: string
  targetValue: string
  currentValue: CurrentValueState
}

export type CurrentValueState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; text: string }
  | { state: 'err'; error: string }

/**
 * Validation failure for a single row. `null` from `validateRow` means OK.
 * Multiple fields can fail; consumers render the first one that matters.
 */
export interface SetRowError {
  rowId: string
  field: 'fullOid' | 'targetValue' | 'type'
  message: string
}

/**
 * Patch shape accepted by `useSetRows().patch(rowId, patch)`. Mirrors a
 * subset of `SetRowDraft` so callers can update one field at a time without
 * having to spread the whole row.
 */
export type SetRowPatch = Partial<
  Pick<SetRowDraft, 'instance' | 'instanceOptions' | 'type' | 'targetValue' | 'currentValue'>
>

/**
 * Seed for opening the tool window from a SET action. Right-click SET passes
 * just a node (defaults to instance='0' and empty target). Callers may pass a
 * fully-specified seed so the first row arrives with instance + targetValue
 * pre-filled.
 */
export interface SetSeed {
  node: MibTreeNodeData
  /** Optional override for the first row's instance suffix. Defaults to '0'. */
  instance?: string
  /** Optional override for the first row's target value. Defaults to ''. */
  targetValue?: string
}
