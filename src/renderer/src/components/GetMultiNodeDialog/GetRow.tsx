import React, { useMemo } from 'react'
import { Input, Select, Button, Tooltip, Space } from 'antd'
import {
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ApiOutlined
} from '@ant-design/icons'
import type { GetRowDraft, GetRowError, GetRowPatch } from './types'
import { buildFullOid } from '../SetMultiNodeDialog/rowUtils'

/**
 * Trim the enum / range list off a MIB syntax string so the secondary
 * label under the node name stays compact. Same rule used by SetRow.
 *   "INTEGER { up(1), down(2) }" -> "INTEGER"
 *   "OCTET STRING (SIZE (0..255))" -> "OCTET STRING"
 */
function cleanSyntax(syntax: string): string {
  return (syntax || '').split(/[{(]/)[0].trim()
}

interface GetRowProps {
  index: number
  total: number
  row: GetRowDraft
  rowError?: GetRowError
  disabled: boolean
  onPatch: (patch: GetRowPatch) => void
  onRemove: () => void
  onMove: (direction: 'up' | 'down') => void
  onFetchInstances: () => void
  instanceFetching: boolean
}

/**
 * One row in the multi-node GET dialog. Compared with `SetRow` this is
 * intentionally pared down: there's no "类型" column, no "目标值" column,
 * and no "获取当前值" button — GET is the value-fetch operation itself, so a
 * second button to do the same thing would be redundant.
 */
export function GetRow(props: GetRowProps): React.ReactElement {
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
    instanceFetching
  } = props

  const fullOid = useMemo(() => buildFullOid(row.node.oid, row.instance), [row.node.oid, row.instance])
  const fullOidError = rowError?.field === 'fullOid'

  const instanceControl = row.instanceOptions && row.instanceOptions.length > 0
    ? (
      <Select
        value={row.instance}
        onChange={(v) => onPatch({ instance: v })}
        options={row.instanceOptions.map((s) => ({ label: s, value: s }))}
        style={{ width: 220 }}
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
        style={{ width: 220 }}
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
