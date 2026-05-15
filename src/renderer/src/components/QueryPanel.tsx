import React, { useState, useCallback } from 'react'
import { Input, Select, Button, InputNumber, Space, message, Tooltip } from 'antd'
import {
  SendOutlined,
  SearchOutlined,
  ClearOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { SnmpOperation } from '../../../main/snmp/types'
import type { ResultRow } from '../types'

export function QueryPanel(): React.ReactElement {
  const config = useAppStore((s) => s.snmpConfig)
  const queryOid = useAppStore((s) => s.queryOid)
  const setQueryOid = useAppStore((s) => s.setQueryOid)
  const queryOperation = useAppStore((s) => s.queryOperation)
  const setQueryOperation = useAppStore((s) => s.setQueryOperation)
  const addResults = useAppStore((s) => s.addResults)
  const clearResults = useAppStore((s) => s.clearResults)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)

  const [maxRepetitions, setMaxRepetitions] = useState(10)
  const [setValue, setSetValue] = useState('')
  const [setType, setSetType] = useState('OCTET STRING')

  const isSetOperation = queryOperation === 'SET'
  const isBulkOperation = queryOperation === 'GETBULK' || queryOperation === 'BULK_WALK'

  const handleSend = useCallback(async () => {
    if (!queryOid.trim()) {
      message.warning('Please enter an OID')
      return
    }

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
        case 'GETNEXT':
          result = await window.api.snmp.getNext(config, oids)
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
        const rows: ResultRow[] = result.varbinds.map((vb, idx) => ({
          key: `${result.timestamp}-${idx}`,
          oid: vb.oid,
          name: vb.name || '',
          value: formatValue(vb.value, vb.type),
          type: vb.type,
          status: vb.isError ? 'error' as const : 'success' as const,
          timestamp: new Date(result.timestamp).toLocaleTimeString(),
          responseTime: result.responseTime
        }))

        addResults(rows)
        setStatusMessage(
          `${queryOperation}: ${rows.length} result(s), ${result.responseTime}ms`
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
  }, [config, queryOid, queryOperation, maxRepetitions, setValue, setType])

  const handleClear = useCallback(() => {
    clearResults()
    setStatusMessage('Results cleared')
  }, [clearResults, setStatusMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isQuerying) {
      handleSend()
    }
  }, [handleSend, isQuerying])

  return (
    <div className="query-panel">
      <h3>
        <SearchOutlined /> SNMP Query
      </h3>
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
              { label: 'GETNEXT', value: 'GETNEXT' },
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
    </div>
  )
}

/**
 * Format a varbind value for display
 */
function formatValue(value: string | number | Buffer | null, type: string): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object' && !Array.isArray(value) && 'type' in value && (value as Record<string, unknown>).type === 'Buffer' && 'data' in value) {
    // Buffer serialized via IPC (JSON { type: 'Buffer', data: number[] })
    const bytes = (value as unknown as { data: number[] }).data
    if (type === 'IpAddress' && bytes.length === 4) {
      return bytes.join('.')
    }
    return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
  }

  if (Buffer.isBuffer(value)) {
    const bytes = Array.from(value)
    if (type === 'IpAddress' && bytes.length === 4) {
      return bytes.join('.')
    }
    return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
  }

  if (type === 'TimeTicks') {
    const ticks = Number(value)
    const days = Math.floor(ticks / 8640000)
    const hours = Math.floor((ticks % 8640000) / 360000)
    const minutes = Math.floor((ticks % 360000) / 6000)
    const seconds = Math.floor((ticks % 6000) / 100)
    const hundredths = ticks % 100
    return `${days}d ${hours}h ${minutes}m ${seconds}.${hundredths}s`
  }

  return String(value)
}
