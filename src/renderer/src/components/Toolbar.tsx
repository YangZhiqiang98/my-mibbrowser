import React, { useEffect, useState, useCallback } from 'react'
import { Input, Select, InputNumber, Button, Dropdown, Modal, Tooltip, App, Divider, Switch, Badge } from 'antd'
import {
  SettingOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  GlobalOutlined,
  ApiOutlined,
  LinkOutlined,
  StopOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { normalizeSnmpConfig, useAppStore } from '../stores/appStore'
import type { SnmpConfig, SecurityLevel, AuthProtocol, PrivProtocol, SnmpTransport } from '../../../main/snmp/types'
import {
  SNMP_AUTH_PROTOCOL_OPTIONS,
  SNMP_PRIV_PROTOCOL_OPTIONS,
  SNMP_TRANSPORT_OPTIONS
} from '../../../shared/snmpOptions'

export function Toolbar(): React.ReactElement {
  const { message } = App.useApp()
  const config = useAppStore((s) => s.snmpConfig)
  const setConfig = useAppStore((s) => s.setSnmpConfig)
  const profiles = useAppStore((s) => s.profiles)
  const setProfiles = useAppStore((s) => s.setProfiles)
  const isQuerying = useAppStore((s) => s.isQuerying)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const debugMode = useAppStore((s) => s.debugMode)
  const setDebugMode = useAppStore((s) => s.setDebugMode)
  const debugLogCount = useAppStore((s) => s.debugLogs.length)
  const debugLogPanelOpen = useAppStore((s) => s.debugLogPanelOpen)
  const setDebugLogPanelOpen = useAppStore((s) => s.setDebugLogPanelOpen)
  const [showConnectionSettings, setShowConnectionSettings] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const handleTestConnection = useCallback(async () => {
    if (!config.host.trim()) {
      message.warning('Please enter a host address')
      return
    }

    setIsTesting(true)
    setConnectionStatus('connecting')
    setStatusMessage('Testing connection...')

    try {
      const result = await window.api.snmp.get(config, ['1.3.6.1.2.1.1.1.0'])
      if (result.success && result.varbinds.length > 0) {
        const sysDescr = String(result.varbinds[0].value ?? '(empty)')
        setConnectionStatus('connected')
        message.success(`Connected: ${sysDescr.substring(0, 80)}`)
        setStatusMessage(`Connected (${result.responseTime}ms)`)
      } else {
        setConnectionStatus('error')
        message.error(`Connection failed: ${result.error ?? 'No response'}`)
        setStatusMessage(`Test failed: ${result.error ?? 'No response'}`)
      }
    } catch (err) {
      setConnectionStatus('error')
      const errMsg = err instanceof Error ? err.message : String(err)
      message.error(`Connection error: ${errMsg}`)
      setStatusMessage(`Test error: ${errMsg}`)
    } finally {
      setIsTesting(false)
    }
  }, [config, message, setConnectionStatus, setStatusMessage])

  const handleAbortRequest = useCallback(async () => {
    const cancelled = await window.api.snmp.cancel()
    if (cancelled) {
      setStatusMessage('Abort requested...')
    } else {
      message.info('No SNMP request is running')
    }
  }, [message, setStatusMessage])

  const handleVersionChange = (version: string): void => {
    setConfig({ version: version as SnmpConfig['version'] })
  }

  const handleDebugModeChange = async (enabled: boolean): Promise<void> => {
    const previous = debugMode
    setDebugMode(enabled)
    try {
      const actual = await window.api.debug.setEnabled(enabled)
      setDebugMode(actual)
      if (actual) setDebugLogPanelOpen(true)
      setStatusMessage(`Debug mode ${actual ? 'enabled' : 'disabled'}`)
    } catch (error) {
      setDebugMode(previous)
      const errMsg = error instanceof Error ? error.message : String(error)
      message.error(`Debug mode update failed: ${errMsg}`)
      setStatusMessage(`Debug mode update failed: ${errMsg}`)
    }
  }

  useEffect(() => {
    void window.api.debug.getEnabled()
      .then(setDebugMode)
      .catch(() => undefined)
  }, [setDebugMode])

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return
    const id = `profile-${Date.now()}`
    const profile = { id, name: profileName, config }
    await window.api.profile.save(profile)
    const updated = await window.api.profile.load()
    setProfiles(updated.map((p: { id: string; name: string; config: Partial<SnmpConfig> }) => ({
      id: p.id,
      name: p.name,
      config: normalizeSnmpConfig(p.config)
    })))
    setShowSaveModal(false)
    setProfileName('')
  }

  const handleLoadProfile = (profile: { config: Partial<SnmpConfig> }): void => {
    setConfig(normalizeSnmpConfig(profile.config))
  }

  const handleDeleteProfile = async (id: string) => {
    await window.api.profile.delete(id)
    const updated = await window.api.profile.load()
    setProfiles(updated.map((p: { id: string; name: string; config: Partial<SnmpConfig> }) => ({
      id: p.id,
      name: p.name,
      config: normalizeSnmpConfig(p.config)
    })))
  }

  const profileMenuItems = profiles.map(p => ({
    key: p.id,
    onClick: () => handleLoadProfile(p),
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 200 }}>
        <span>{p.name}</span>
        <DeleteOutlined
          style={{ color: '#ff4d4f', fontSize: 12 }}
          onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id) }}
        />
      </div>
    )
  }))

  return (
    <div className="toolbar">
      <span className="toolbar-title">
        <GlobalOutlined /> MIB Browser
      </span>

      <Input
        className="host-input"
        prefix={<LinkOutlined />}
        placeholder="IP address"
        value={config.host}
        onChange={(e) => setConfig({ host: e.target.value })}
        size="small"
      />

      <Tooltip title="Device connection settings">
        <Button
          icon={<SettingOutlined />}
          size="small"
          onClick={() => setShowConnectionSettings(true)}
        />
      </Tooltip>

      <Tooltip title="Debug logs">
        <Badge count={debugLogCount} size="small" overflowCount={999}>
          <Button
            icon={<FileTextOutlined />}
            size="small"
            type={debugLogPanelOpen ? 'primary' : 'default'}
            onClick={() => setDebugLogPanelOpen(!debugLogPanelOpen)}
          />
        </Badge>
      </Tooltip>

      {isQuerying && (
        <Tooltip title="Abort current SNMP request">
          <Button
            danger
            icon={<StopOutlined />}
            size="small"
            onClick={handleAbortRequest}
          >
            Stop
          </Button>
        </Tooltip>
      )}

      <div style={{ marginLeft: 'auto' }} />

      <Modal
        title="Device Connection Settings"
        open={showConnectionSettings}
        onOk={() => setShowConnectionSettings(false)}
        onCancel={() => setShowConnectionSettings(false)}
        width={640}
        footer={[
          <Button key="close" onClick={() => setShowConnectionSettings(false)}>
            Close
          </Button>,
          ...(isTesting
            ? [
                <Button
                  key="abort-test"
                  danger
                  icon={<StopOutlined />}
                  onClick={handleAbortRequest}
                >
                  Stop
                </Button>
              ]
            : []),
          <Button
            key="test"
            icon={<ApiOutlined />}
            loading={isTesting}
            onClick={handleTestConnection}
          >
            Test
          </Button>
        ]}
      >
        <div className="connection-settings">
          <div className="connection-settings-actions">
            <Tooltip title="Saved profiles">
              <Dropdown menu={{ items: profileMenuItems }} trigger={['click']}>
                <Button icon={<FolderOpenOutlined />} size="small">
                  Profiles
                </Button>
              </Dropdown>
            </Tooltip>
            <Tooltip title="Save current config">
              <Button
                icon={<SaveOutlined />}
                size="small"
                onClick={() => setShowSaveModal(true)}
              >
                Save
              </Button>
            </Tooltip>
          </div>

          <Divider plain>Target</Divider>

          <div className="connection-settings-grid">
            <div className="query-form-item">
              <label>Host / IP</label>
              <Input
                value={config.host}
                onChange={(e) => setConfig({ host: e.target.value })}
              />
            </div>
            <div className="query-form-item">
              <label>Port</label>
              <InputNumber
                value={config.port}
                onChange={(v) => setConfig({ port: v ?? 161 })}
                min={1}
                max={65535}
                style={{ width: '100%' }}
              />
            </div>
            <div className="query-form-item">
              <label>SNMP Version</label>
              <Select
                value={config.version}
                onChange={handleVersionChange}
                options={[
                  { label: 'v1', value: 'v1' },
                  { label: 'v2c', value: 'v2c' },
                  { label: 'v3', value: 'v3' }
                ]}
              />
            </div>
            <div className="query-form-item">
              <label>Transport</label>
              <Select
                value={config.transport}
                onChange={(v) => setConfig({ transport: v as SnmpTransport })}
                options={[...SNMP_TRANSPORT_OPTIONS]}
              />
            </div>
            {config.version !== 'v3' && (
              <div className="query-form-item">
                <label>Community</label>
                <Input
                  value={config.community}
                  onChange={(e) => setConfig({ community: e.target.value })}
                />
              </div>
            )}
          </div>

          {config.version === 'v3' && (
            <>
              <Divider plain>SNMPv3</Divider>

              <div className="connection-settings-grid">
                <div className="query-form-item">
                  <label>Security Level</label>
                  <Select
                    value={config.securityLevel}
                    onChange={(v) => setConfig({ securityLevel: v as SecurityLevel })}
                    options={[
                      { label: 'noAuthNoPriv', value: 'noAuthNoPriv' },
                      { label: 'authNoPriv', value: 'authNoPriv' },
                      { label: 'authPriv', value: 'authPriv' }
                    ]}
                  />
                </div>
                <div className="query-form-item">
                  <label>Username</label>
                  <Input
                    value={config.username}
                    onChange={(e) => setConfig({ username: e.target.value })}
                  />
                </div>

                {config.securityLevel !== 'noAuthNoPriv' && (
                  <>
                    <div className="query-form-item">
                      <label>Auth Protocol</label>
                      <Select
                        value={config.authProtocol}
                        onChange={(v) => setConfig({ authProtocol: v as AuthProtocol })}
                        options={[...SNMP_AUTH_PROTOCOL_OPTIONS]}
                      />
                    </div>
                    <div className="query-form-item">
                      <label>Auth Password</label>
                      <Input.Password
                        value={config.authPassword}
                        onChange={(e) => setConfig({ authPassword: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {config.securityLevel === 'authPriv' && (
                  <>
                    <div className="query-form-item">
                      <label>Priv Protocol</label>
                      <Select
                        value={config.privProtocol}
                        onChange={(v) => setConfig({ privProtocol: v as PrivProtocol })}
                        options={[...SNMP_PRIV_PROTOCOL_OPTIONS]}
                      />
                    </div>
                    <div className="query-form-item">
                      <label>Priv Password</label>
                      <Input.Password
                        value={config.privPassword}
                        onChange={(e) => setConfig({ privPassword: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <Divider plain>Request</Divider>

          <div className="connection-settings-grid">
            <div className="query-form-item">
              <label>Debug Mode</label>
              <Switch
                checked={debugMode}
                onChange={(checked) => {
                  void handleDebugModeChange(checked)
                }}
              />
            </div>
            <div className="query-form-item">
              <label>Timeout (ms)</label>
              <InputNumber
                value={config.timeout}
                onChange={(v) => setConfig({ timeout: v ?? 5000 })}
                min={1000}
                max={30000}
                step={1000}
                style={{ width: '100%' }}
              />
            </div>
            <div className="query-form-item">
              <label>Retries</label>
              <InputNumber
                value={config.retries}
                onChange={(v) => setConfig({ retries: v ?? 1 })}
                min={0}
                max={5}
                style={{ width: '100%' }}
              />
            </div>
            <div className="query-form-item">
              <label>Bulk Max Repetitions</label>
              <InputNumber
                value={config.bulkMaxRepetitions}
                onChange={(v) => setConfig({ bulkMaxRepetitions: v ?? 10 })}
                min={1}
                max={100}
                style={{ width: '100%' }}
              />
            </div>
            <div className="query-form-item">
              <label>Bulk Non-repeaters</label>
              <InputNumber
                value={config.bulkNonRepeaters}
                onChange={(v) => setConfig({ bulkNonRepeaters: v ?? 0 })}
                min={0}
                max={20}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Save Profile Modal */}
      <Modal
        title="Save Connection Profile"
        open={showSaveModal}
        onOk={handleSaveProfile}
        onCancel={() => setShowSaveModal(false)}
      >
        <div className="query-form-item">
          <label>Profile Name</label>
          <Input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Enter a name for this profile"
          />
        </div>
      </Modal>
    </div>
  )
}
