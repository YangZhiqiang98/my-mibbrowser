import React, { useState, useCallback, useEffect } from 'react'
import { Input, Select, Button, InputNumber, Space, message, Tooltip } from 'antd'
import {
  SendOutlined,
  SearchOutlined,
  ClearOutlined,
  RightOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { buildResultSession } from '../utils/resultColumns'
import type { SnmpOperation } from '../../../main/snmp/types'

export function QueryPanel(): React.ReactElement {
  const config = useAppStore((s) => s.snmpConfig)
  const queryOid = useAppStore((s) => s.queryOid)
  const setQueryOid = useAppStore((s) => s.setQueryOid)
  const queryOperation = useAppStore((s) => s.queryOperation)
  const setQueryOperation = useAppStore((s) => s.setQueryOperation)
  const mibTree = useAppStore((s) => s.mibTree)
  const setResult = useAppStore((s) => s.setResult)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)

  const [maxRepetitions, setMaxRepetitions] = useState(10)
  const [setValue, setSetValue] = useState('')
  const [setType, setSetType] = useState('OCTET STRING')
  // PR3 — QueryPanel defaults to collapsed; session-local only (not persisted).
  // Acts as the "I know the OID but don't want to navigate the tree" entrypoint.
  const [collapsed, setCollapsed] = useState(true)

  const isSetOperation = queryOperation === 'SET'
  const isBulkOperation = queryOperation === 'GETBULK' || queryOperation === 'BULK_WALK'

  // GETNEXT was removed from the Operation dropdown — if a prior session
  // persisted the value (or hot-reload caught us with 'GETNEXT' in flight),
  // fall back to 'GET' so the Select doesn't render a value with no matching
  // option. Re-runs are no-ops once the value is anything other than 'GETNEXT'.
  useEffect(() => {
    if (queryOperation === 'GETNEXT') {
      setQueryOperation('GET')
    }
  }, [queryOperation, setQueryOperation])

  const handleSend = useCallback(async () => {
    if (!queryOid.trim()) {
      message.warning('Please enter an OID')
      return
    }

    // Overwrite semantics (PR2): the moment the user clicks Send, drop any
    // prior session and flip loading so the table reflects "fetching" before
    // the response arrives.
    setResult(null)
    setIsQuerying(true)
    setConnectionStatus('connecting')
    setStatusMessage(`Executing ${queryOperation}...`)

    try {
      const oids = queryOid.split(',').map(s => s.trim()).filter(s => s.length > 0)

      let result: {
        success: boolean
        varbinds: Array<{ oid: string; name?: string; value: string | number | Buffer | null; type: string; isError: boolean; error?: string }>
        error?: string
        responseTime: number
        timestamp: number
      }

      switch (queryOperation) {
        case 'GET':
          result = await window.api.snmp.get(config, oids)
          break
        case 'GETBULK':
          result = await window.api.snmp.getBulk(config, oids, maxRepetitions)
          break
        case 'SET':
          if (!setValue.trim()) {
            message.warning('Please enter a value to set')
            setIsQuerying(false)
            return
          }
          result = await window.api.snmp.set(config, oids.map(oid => ({
            oid,
            value: setValue,
            type: setType
          })))
          break
        case 'WALK':
          result = await window.api.snmp.walk(config, oids[0])
          break
        case 'BULK_WALK':
          result = await window.api.snmp.bulkWalk(config, oids[0], maxRepetitions)
          break
        default:
          message.error('Unknown operation')
          setIsQuerying(false)
          return
      }

      if (result.success) {
        setConnectionStatus('connected')
        const session = buildResultSession(queryOperation, oids[0] ?? '', result, mibTree)
        setResult(session)
        // PR3 — empty-result status text suffix so the status bar surfaces
        // "no data" without resorting to a modal / toast.
        const baseMsg = `${queryOperation}: ${session.rows.length} result(s), ${result.responseTime}ms`
        setStatusMessage(
          session.rows.length === 0 ? `${baseMsg} — 本次操作结果为空` : baseMsg
        )
      } else {
        setConnectionStatus('error')
        message.error(`SNMP error: ${result.error}`)
        setStatusMessage(`Error: ${result.error}`)
      }
    } catch (err) {
      setConnectionStatus('error')
      const errMsg = err instanceof Error ? err.message : String(err)
      message.error(`Request failed: ${errMsg}`)
      setStatusMessage(`Error: ${errMsg}`)
    } finally {
      setIsQuerying(false)
    }
  }, [config, queryOid, queryOperation, maxRepetitions, setValue, setType, mibTree, setResult, setIsQuerying, setConnectionStatus, setStatusMessage])

  const handleClear = useCallback(() => {
    setResult(null)
    setStatusMessage('Results cleared')
  }, [setResult, setStatusMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isQuerying) {
      handleSend()
    }
  }, [handleSend, isQuerying])

  return (
    <div className="query-panel">
      <h3
        className="query-panel-title"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          // When collapsed, drop the bottom margin so the panel collapses
          // visually to a single header row.
          marginBottom: collapsed ? 0 : undefined
        }}
      >
        <SearchOutlined />
        <span style={{ marginLeft: 4 }}>SNMP Query</span>
        <RightOutlined
          style={{
            marginLeft: 8,
            fontSize: 12,
            transform: collapsed ? 'none' : 'rotate(90deg)',
            transition: 'transform 0.2s'
          }}
        />
      </h3>
      {!collapsed && (
      <div className="query-form">
        <div className="query-form-item">
          <label>OID</label>
          <Input
            className="oid-input"
            placeholder="e.g. 1.3.6.1.2.1.1.1.0 or sysDescr.0"
            value={queryOid}
            onChange={(e) => setQueryOid(e.target.value)}
            onKeyDown={handleKeyDown}
            size="small"
          />
        </div>

        <div className="query-form-item">
          <label>Operation</label>
          <Select
            value={queryOperation}
            onChange={(v) => setQueryOperation(v as SnmpOperation)}
            size="small"
            style={{ width: 120 }}
            options={[
              { label: 'GET', value: 'GET' },
              { label: 'GETBULK', value: 'GETBULK' },
              { label: 'SET', value: 'SET' },
              { label: 'WALK', value: 'WALK' },
              { label: 'Bulk Walk', value: 'BULK_WALK' }
            ]}
          />
        </div>

        {isBulkOperation && (
          <div className="query-form-item">
            <label>Max Repetitions</label>
            <InputNumber
              value={maxRepetitions}
              onChange={(v) => setMaxRepetitions(v ?? 10)}
              min={1}
              max={100}
              size="small"
              style={{ width: 80 }}
            />
          </div>
        )}

        {isSetOperation && (
          <>
            <div className="query-form-item">
              <label>Value Type</label>
              <Select
                value={setType}
                onChange={setSetType}
                size="small"
                style={{ width: 140 }}
                options={[
                  { label: 'OCTET STRING', value: 'OCTET STRING' },
                  { label: 'INTEGER', value: 'INTEGER' },
                  { label: 'OBJECT IDENTIFIER', value: 'OBJECT IDENTIFIER' },
                  { label: 'IpAddress', value: 'IpAddress' },
                  { label: 'Counter32', value: 'Counter32' },
                  { label: 'Gauge32', value: 'Gauge32' },
                  { label: 'TimeTicks', value: 'TimeTicks' }
                ]}
              />
            </div>
            <div className="query-form-item">
              <label>Value</label>
              <Input
                value={setValue}
                onChange={(e) => setSetValue(e.target.value)}
                placeholder="Value to set"
                size="small"
                style={{ width: 150 }}
              />
            </div>
          </>
        )}

        <div className="query-form-item" style={{ justifyContent: 'flex-end' }}>
          <label>&nbsp;</label>
          <Space size="small">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isQuerying}
              size="small"
            >
              Send
            </Button>
            <Tooltip title="Clear results">
              <Button
                icon={<ClearOutlined />}
                onClick={handleClear}
                size="small"
              />
            </Tooltip>
          </Space>
        </div>
      </div>
      )}
    </div>
  )
}
