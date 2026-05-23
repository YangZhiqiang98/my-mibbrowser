import React, { useMemo } from 'react'
import { Input, Select, Button, Tooltip, Space } from 'antd'
import {
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ImportOutlined,
  ApiOutlined
} from '@ant-design/icons'
import type { SetRowDraft, SetRowError, SetRowPatch } from './types'
import { buildFullOid } from './rowUtils'

const TYPE_OPTIONS = [
  { label: 'OCTET STRING', value: 'OCTET STRING' },
  { label: 'INTEGER', value: 'INTEGER' },
  { label: 'OBJECT IDENTIFIER', value: 'OBJECT IDENTIFIER' },
  { label: 'IpAddress', value: 'IpAddress' },
  { label: 'Counter32', value: 'Counter32' },
  { label: 'Gauge32', value: 'Gauge32' },
  { label: 'TimeTicks', value: 'TimeTicks' }
]

/**
 * Trim the enum / range list off a MIB syntax string so the secondary
 * label under the node name stays compact. Examples:
 *   "INTEGER { up(1), down(2) }" -> "INTEGER"
 *   "OCTET STRING (SIZE (0..255))" -> "OCTET STRING"
 *   "INTEGER {"                  -> "INTEGER"  (handles truncated parser output)
 */
function cleanSyntax(syntax: string): string {
  return (syntax || '').split(/[{(]/)[0].trim()
}

interface SetRowProps {
  index: number
  total: number
  row: SetRowDraft
  rowError?: SetRowError
  disabled: boolean
  onPatch: (patch: SetRowPatch) => void
  onRemove: () => void
  onMove: (direction: 'up' | 'down') => void
  onFetchInstances: () => void
  /**
   * GET the current value for this row.
   *  - `instanceOverride`: query with this suffix instead of the row's
   *    current state (used by Instance Select onChange).
   *  - `applyToTarget`: also write the result into `targetValue` so the
   *    user has a one-click "edit from current" flow.
   */
  onFetchCurrentValue: (opts?: { instanceOverride?: string; applyToTarget?: boolean }) => void
  instanceFetching: boolean
}

export function SetRow(props: SetRowProps): React.ReactElement {
  const {
    index,
    total,
    row,
    rowError,
    disabled,
    onPatch,
    onRemove,
    onMove,
    onFetchInstances,
    onFetchCurrentValue,
    instanceFetching
  } = props

  const fullOid = useMemo(() => buildFullOid(row.node.oid, row.instance), [row.node.oid, row.instance])
  const fullOidError = rowError?.field === 'fullOid'
  const targetError = rowError?.field === 'targetValue'
  const currentLoading = row.currentValue.state === 'loading'
  const currentErrorMsg = row.currentValue.state === 'err' ? row.currentValue.error : undefined

  const instanceControl = row.instanceOptions && row.instanceOptions.length > 0
    ? (
      <Select
        value={row.instance}
        onChange={(v) => {
          // When picking from the discovered list, immediately GET the
          // current value for the new instance AND auto-fill the target —
          // the user almost always wants to edit from current.
          onPatch({ instance: v })
          onFetchCurrentValue({ instanceOverride: v, applyToTarget: true })
        }}
        options={row.instanceOptions.map((s) => ({ label: s, value: s }))}
        style={{ width: 180 }}
        size="small"
        showSearch
        allowClear
        placeholder="instance"
        status={fullOidError ? 'error' : undefined}
        disabled={disabled}
      />
    )
    : (
      <Input
        value={row.instance}
        onChange={(e) => onPatch({ instance: e.target.value })}
        placeholder=".0"
        size="small"
        style={{ width: 180 }}
        status={fullOidError ? 'error' : undefined}
        disabled={disabled}
      />
    )

  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
      <td style={{ padding: '6px 4px', textAlign: 'center', width: 36, color: '#999' }}>
        {index + 1}
      </td>
      <td style={{ padding: '6px 4px', minWidth: 160 }}>
        <Tooltip title={fullOid} placement="topLeft">
          <div style={{ fontSize: 13, fontWeight: 500 }}>{row.node.name}</div>
        </Tooltip>
        <div style={{ fontSize: 11, color: '#999' }}>{cleanSyntax(row.node.syntax) || '—'}</div>
      </td>
      <td style={{ padding: '6px 4px' }}>
        <Space size={4}>
          {instanceControl}
          <Tooltip title="获取实例（对该 OID 做 WALK 后下拉选择）">
            <Button
              size="small"
              icon={<ApiOutlined />}
              onClick={onFetchInstances}
              loading={instanceFetching}
              disabled={disabled}
            />
          </Tooltip>
        </Space>
      </td>
      <td style={{ padding: '6px 4px', width: 140 }}>
        <Select
          value={row.type}
          onChange={(v) => onPatch({ type: v })}
          options={TYPE_OPTIONS}
          style={{ width: '100%' }}
          size="small"
          disabled={disabled}
        />
      </td>
      <td style={{ padding: '6px 4px', width: 240 }}>
        <Space size={4} style={{ width: '100%' }}>
          <Input
            value={row.targetValue}
            onChange={(e) => onPatch({ targetValue: e.target.value })}
            placeholder="目标值"
            size="small"
            status={targetError || currentErrorMsg ? 'error' : undefined}
            disabled={disabled}
          />
          <Tooltip title={currentErrorMsg ? `上次获取失败：${currentErrorMsg}` : '获取当前值并填入目标值'}>
            <Button
              size="small"
              icon={<ImportOutlined />}
              loading={currentLoading}
              onClick={() => onFetchCurrentValue({ applyToTarget: true })}
              disabled={disabled}
            />
          </Tooltip>
        </Space>
      </td>
      <td style={{ padding: '6px 4px', width: 120, textAlign: 'right' }}>
        <Space size={2}>
          <Tooltip title="上移">
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              onClick={() => onMove('up')}
              disabled={disabled || index === 0}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={() => onMove('down')}
              disabled={disabled || index === total - 1}
            />
          </Tooltip>
          <Tooltip title="删除行">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={onRemove}
              disabled={disabled}
            />
          </Tooltip>
        </Space>
      </td>
    </tr>
  )
}
