import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, InputNumber, Select, Space, Switch, Tag, Tooltip } from 'antd'
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { TrapNotificationEvent, TrapReceiverConfig } from '../../../shared/trapTypes'
import type { SnmpTransport } from '../../../shared/snmpOptions'
import { SNMP_TRANSPORT_OPTIONS } from '../../../shared/snmpOptions'

const DEFAULT_TRAP_PORT = 9162

export function TrapConsolePanel(): React.ReactElement | null {
  const { message } = App.useApp()
  const events = useAppStore((s) => s.trapEvents)
  const panelOpen = useAppStore((s) => s.trapConsoleOpen)
  const autoScroll = useAppStore((s) => s.trapConsoleAutoScroll)
  const status = useAppStore((s) => s.trapReceiverStatus)
  const snmpConfig = useAppStore((s) => s.snmpConfig)
  const clearTrapEvents = useAppStore((s) => s.clearTrapEvents)
  const setTrapConsoleOpen = useAppStore((s) => s.setTrapConsoleOpen)
  const setTrapConsoleAutoScroll = useAppStore((s) => s.setTrapConsoleAutoScroll)
  const setTrapReceiverStatus = useAppStore((s) => s.setTrapReceiverStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const [port, setPort] = useState(DEFAULT_TRAP_PORT)
  const [transport, setTransport] = useState<SnmpTransport>('udp4')
  const [community, setCommunity] = useState(snmpConfig.community || 'public')
  const [filterText, setFilterText] = useState('')
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasPanelOpenRef = useRef(false)

  useEffect(() => {
    if (!panelOpen || !autoScroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [autoScroll, events.length, panelOpen])

  useEffect(() => {
    if (!panelOpen) return
    void window.api.trap.getStatus().then(setTrapReceiverStatus).catch(() => undefined)
  }, [panelOpen, setTrapReceiverStatus])

  useEffect(() => {
    if (!panelOpen) {
      wasPanelOpenRef.current = false
      return
    }

    if (status.listening) {
      setPort(status.port)
      setTransport(status.transport)
      wasPanelOpenRef.current = true
      return
    }

    if (!wasPanelOpenRef.current) {
      setPort(status.port)
      setTransport(snmpConfig.transport)
      setCommunity(snmpConfig.community || 'public')
    }
    wasPanelOpenRef.current = true
  }, [panelOpen, snmpConfig.community, snmpConfig.transport, status.listening, status.port, status.transport])

  const filteredEvents = useMemo(() => {
    const query = filterText.trim().toLowerCase()
    if (!query) return events
    return events.filter((event) => formatTrapEventText(event).toLowerCase().includes(query))
  }, [events, filterText])

  const copyText = useMemo(() => filteredEvents.map(formatTrapEventText).join('\n\n'), [filteredEvents])

  const handleStart = useCallback(async () => {
    setStarting(true)
    try {
      const nextStatus = await window.api.trap.start(buildTrapReceiverConfig({
        port,
        transport,
        community,
        snmpConfig
      }))
      setTrapReceiverStatus(nextStatus)
      setStatusMessage(nextStatus.message)
      if (nextStatus.listening) {
        message.success(nextStatus.message)
      } else {
        message.error(nextStatus.error ?? nextStatus.message)
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      message.error(`Trap receiver start failed: ${errMsg}`)
      setStatusMessage(`Trap receiver start failed: ${errMsg}`)
    } finally {
      setStarting(false)
    }
  }, [community, message, port, setStatusMessage, setTrapReceiverStatus, snmpConfig, transport])

  const handleStop = useCallback(async () => {
    setStopping(true)
    try {
      const nextStatus = await window.api.trap.stop()
      setTrapReceiverStatus(nextStatus)
      setStatusMessage(nextStatus.message)
      message.success(nextStatus.message)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      message.error(`Trap receiver stop failed: ${errMsg}`)
      setStatusMessage(`Trap receiver stop failed: ${errMsg}`)
    } finally {
      setStopping(false)
    }
  }, [message, setStatusMessage, setTrapReceiverStatus])

  const handleCopy = useCallback(() => {
    if (filteredEvents.length === 0) {
      message.info('No Trap / Inform events to copy')
      return
    }
    navigator.clipboard.writeText(copyText).then(
      () => message.success(`Copied ${filteredEvents.length} event(s)`),
      () => message.error('Copy Trap / Inform events failed')
    )
  }, [copyText, filteredEvents.length, message])

  const handleClear = useCallback(() => {
    clearTrapEvents()
    message.success('Trap / Inform events cleared')
  }, [clearTrapEvents, message])

  if (!panelOpen) return null

  return (
    <section className="trap-console-panel" aria-label="Trap and Inform console">
      <div className="trap-console-header">
        <div className="trap-console-title">
          <ThunderboltOutlined />
          <span>Trap / Inform Console</span>
          <Tag color={status.listening ? 'green' : 'default'}>
            {status.listening ? `${status.transport}:${status.port}` : 'stopped'}
          </Tag>
          <Tag color="blue">{events.length} events</Tag>
        </div>
        <div className="trap-console-actions">
          <InputNumber
            size="small"
            min={1}
            max={65535}
            value={port}
            onChange={(value) => setPort(value ?? DEFAULT_TRAP_PORT)}
            disabled={status.listening}
            className="trap-console-port"
          />
          <Select
            size="small"
            value={transport}
            onChange={(value) => setTransport(value)}
            options={[...SNMP_TRANSPORT_OPTIONS]}
            disabled={status.listening}
            className="trap-console-transport"
          />
          <Input
            size="small"
            value={community}
            onChange={(event) => setCommunity(event.target.value)}
            disabled={status.listening}
            className="trap-console-community"
            placeholder="community"
          />
          {status.listening ? (
            <Button
              danger
              size="small"
              icon={<PauseCircleOutlined />}
              loading={stopping}
              onClick={handleStop}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              loading={starting}
              onClick={handleStart}
            >
              Start
            </Button>
          )}
          <Input.Search
            allowClear
            size="small"
            placeholder="Filter events"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            className="trap-console-filter"
          />
          <Tooltip title="Auto-scroll to newest event">
            <Switch
              size="small"
              checked={autoScroll}
              checkedChildren={<DownOutlined />}
              unCheckedChildren={<DownOutlined />}
              onChange={setTrapConsoleAutoScroll}
            />
          </Tooltip>
          <Space size="small">
            <Tooltip title="Copy visible events">
              <Button icon={<CopyOutlined />} size="small" onClick={handleCopy} disabled={filteredEvents.length === 0}>
                Copy
              </Button>
            </Tooltip>
            <Tooltip title="Clear events">
              <Button icon={<DeleteOutlined />} size="small" danger onClick={handleClear} disabled={events.length === 0}>
                Clear
              </Button>
            </Tooltip>
            <Tooltip title="Close console">
              <Button icon={<CloseOutlined />} size="small" onClick={() => setTrapConsoleOpen(false)} />
            </Tooltip>
          </Space>
        </div>
      </div>
      <div className={status.error ? 'trap-console-status is-error' : 'trap-console-status'}>
        {status.message}
      </div>
      <div className="trap-console-body" ref={scrollRef}>
        {filteredEvents.length === 0 ? (
          <div className="trap-console-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No Trap / Inform events" />
          </div>
        ) : (
          filteredEvents.map((event) => <TrapEventRow key={event.id} event={event} />)
        )}
      </div>
    </section>
  )
}

function TrapEventRow({ event }: { event: TrapNotificationEvent }): React.ReactElement {
  return (
    <article className={`trap-event trap-event-${event.kind}`}>
      <div className="trap-event-summary">
        <span className="trap-event-time">{formatTime(event.timestamp)}</span>
        <Tag color={event.kind === 'inform' ? 'purple' : 'orange'}>{event.kind.toUpperCase()}</Tag>
        <span className="trap-event-source">{event.sourceAddress}:{event.sourcePort}</span>
        <span className="trap-event-type">{event.trapName || event.trapOid || event.pduType}</span>
        <span className="trap-event-meta">{event.version} / {event.varbinds.length} varbind(s)</span>
      </div>
      <div className="trap-event-details">
        <span>PDU: <code>{event.pduType}</code></span>
        {event.community && <span>Community: <code>{event.community}</code></span>}
        {event.user && <span>User: <code>{event.user}</code></span>}
        {event.uptime && <span>Uptime: <code>{event.uptime}</code></span>}
        {event.enterprise && <span>Enterprise: <code>{event.enterprise}</code></span>}
      </div>
      {event.varbinds.length > 0 && (
        <div className="trap-varbind-list">
          {event.varbinds.map((varbind) => (
            <div className="trap-varbind" key={`${event.id}-${varbind.oid}`}>
              <code>{varbind.name || varbind.oid}</code>
              <span className="trap-varbind-type">{varbind.type}</span>
              <span className="trap-varbind-value">{varbind.value}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function buildTrapReceiverConfig({
  port,
  transport,
  community,
  snmpConfig
}: {
  port: number
  transport: SnmpTransport
  community: string
  snmpConfig: ReturnType<typeof useAppStore.getState>['snmpConfig']
}): TrapReceiverConfig {
  return {
    port,
    transport,
    community,
    disableAuthorization: false,
    includeAuthentication: true,
    v3: {
      enabled: snmpConfig.version === 'v3' && !!snmpConfig.username.trim(),
      username: snmpConfig.username,
      securityLevel: snmpConfig.securityLevel,
      authProtocol: snmpConfig.authProtocol,
      authPassword: snmpConfig.authPassword,
      privProtocol: snmpConfig.privProtocol,
      privPassword: snmpConfig.privPassword
    }
  }
}

function formatTrapEventText(event: TrapNotificationEvent): string {
  const header = [
    new Date(event.timestamp).toISOString(),
    event.kind.toUpperCase(),
    `${event.sourceAddress}:${event.sourcePort}`,
    event.trapName || event.trapOid || event.pduType
  ].join(' ')
  const varbinds = event.varbinds.map((varbind) =>
    `  ${varbind.name || varbind.oid} [${varbind.type}] = ${varbind.value}`
  ).join('\n')
  return varbinds ? `${header}\n${varbinds}` : header
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + `.${String(date.getMilliseconds()).padStart(3, '0')}`
}
