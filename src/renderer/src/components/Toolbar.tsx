import React, { useState, useCallback } from 'react'
import { Input, Select, InputNumber, Button, Dropdown, Modal, Space, Tooltip, App } from 'antd'
import {
  SettingOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  GlobalOutlined,
  ApiOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import type { SnmpConfig, SecurityLevel, AuthProtocol, PrivProtocol } from '../../../main/snmp/types'

export function Toolbar(): React.ReactElement {
  const { message } = App.useApp()
  const config = useAppStore((s) => s.snmpConfig)
  const setConfig = useAppStore((s) => s.setSnmpConfig)
  const profiles = useAppStore((s) => s.profiles)
  const setProfiles = useAppStore((s) => s.setProfiles)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)
  const [showV3Config, setShowV3Config] = useState(false)
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

  const handleVersionChange = (version: string) => {
    setConfig({ version: version as SnmpConfig['version'] })
  }

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return
    const id = `profile-${Date.now()}`
    const profile = { id, name: profileName, config }
    await window.api.profile.save(profile)
    const updated = await window.api.profile.load()
    setProfiles(updated.map((p: { id: string; name: string; config: SnmpConfig }) => ({
      id: p.id,
      name: p.name,
      config: {
        host: p.config.host,
        port: p.config.port,
        version: p.config.version,
        community: p.config.community,
        securityLevel: p.config.securityLevel,
        username: p.config.username,
        authProtocol: p.config.authProtocol,
        authPassword: p.config.authPassword,
        privProtocol: p.config.privProtocol,
        privPassword: p.config.privPassword,
        timeout: p.config.timeout,
        retries: p.config.retries
      }
    })))
    setShowSaveModal(false)
    setProfileName('')
  }

  const handleLoadProfile = (profile: { config: SnmpConfig }) => {
    setConfig(profile.config as SnmpConfig)
  }

  const handleDeleteProfile = async (id: string) => {
    await window.api.profile.delete(id)
    const updated = await window.api.profile.load()
    setProfiles(updated.map((p: { id: string; name: string; config: SnmpConfig }) => ({
      id: p.id,
      name: p.name,
      config: {
        host: p.config.host,
        port: p.config.port,
        version: p.config.version,
        community: p.config.community,
        securityLevel: p.config.securityLevel,
        username: p.config.username,
        authProtocol: p.config.authProtocol,
        authPassword: p.config.authPassword,
        privProtocol: p.config.privProtocol,
        privPassword: p.config.privPassword,
        timeout: p.config.timeout,
        retries: p.config.retries
      }
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
        />
      </Tooltip>

      <Input
        className="host-input"
        placeholder="Host"
        value={config.host}
        onChange={(e) => setConfig({ host: e.target.value })}
        size="small"
      />

      <InputNumber
        className="port-input"
        placeholder="Port"
        value={config.port}
        onChange={(v) => setConfig({ port: v ?? 161 })}
        min={1}
        max={65535}
        size="small"
      />

      <Select
        value={config.version}
        onChange={handleVersionChange}
        size="small"
        style={{ width: 80 }}
        options={[
          { label: 'v1', value: 'v1' },
          { label: 'v2c', value: 'v2c' },
          { label: 'v3', value: 'v3' }
        ]}
      />

      {config.version !== 'v3' ? (
        <Input
          className="community-input"
          placeholder="Community"
          value={config.community}
          onChange={(e) => setConfig({ community: e.target.value })}
          size="small"
        />
      ) : (
        <Button
          icon={<SettingOutlined />}
          size="small"
          onClick={() => setShowV3Config(!showV3Config)}
        >
          v3 Config
        </Button>
      )}

      <Tooltip title="Test connection (GET sysDescr.0)">
        <Button
          icon={<ApiOutlined />}
          size="small"
          loading={isTesting}
          onClick={handleTestConnection}
        >
          Test
        </Button>
      </Tooltip>

      <Space size="small" style={{ marginLeft: 'auto' }}>
        <span style={{ fontSize: 12, color: '#666' }}>Timeout:</span>
        <InputNumber
          value={config.timeout}
          onChange={(v) => setConfig({ timeout: v ?? 5000 })}
          min={1000}
          max={30000}
          step={1000}
          size="small"
          style={{ width: 80 }}
          addonAfter="ms"
        />
        <span style={{ fontSize: 12, color: '#666' }}>Retries:</span>
        <InputNumber
          value={config.retries}
          onChange={(v) => setConfig({ retries: v ?? 1 })}
          min={0}
          max={5}
          size="small"
          style={{ width: 60 }}
        />
      </Space>

      {/* SNMPv3 Configuration Modal */}
      <Modal
        title="SNMPv3 Configuration"
        open={showV3Config}
        onOk={() => setShowV3Config(false)}
        onCancel={() => setShowV3Config(false)}
        width={500}
      >
        <div className="v3-config">
          <div className="v3-config-row">
            <div className="query-form-item">
              <label>Security Level</label>
              <Select
                value={config.securityLevel}
                onChange={(v) => setConfig({ securityLevel: v as SecurityLevel })}
                style={{ width: 200 }}
                options={[
                  { label: 'noAuthNoPriv', value: 'noAuthNoPriv' },
                  { label: 'authNoPriv', value: 'authNoPriv' },
                  { label: 'authPriv', value: 'authPriv' }
                ]}
              />
            </div>
          </div>

          <div className="v3-config-row">
            <div className="query-form-item">
              <label>Username</label>
              <Input
                value={config.username}
                onChange={(e) => setConfig({ username: e.target.value })}
                style={{ width: 200 }}
              />
            </div>
          </div>

          {config.securityLevel !== 'noAuthNoPriv' && (
            <>
              <div className="v3-config-row">
                <div className="query-form-item">
                  <label>Auth Protocol</label>
                  <Select
                    value={config.authProtocol}
                    onChange={(v) => setConfig({ authProtocol: v as AuthProtocol })}
                    style={{ width: 200 }}
                    options={[
                      { label: 'MD5', value: 'md5' },
                      { label: 'SHA', value: 'sha' }
                    ]}
                  />
                </div>
                <div className="query-form-item">
                  <label>Auth Password</label>
                  <Input.Password
                    value={config.authPassword}
                    onChange={(e) => setConfig({ authPassword: e.target.value })}
                    style={{ width: 200 }}
                  />
                </div>
              </div>
            </>
          )}

          {config.securityLevel === 'authPriv' && (
            <div className="v3-config-row">
              <div className="query-form-item">
                <label>Priv Protocol</label>
                <Select
                  value={config.privProtocol}
                  onChange={(v) => setConfig({ privProtocol: v as PrivProtocol })}
                  style={{ width: 200 }}
                  options={[
                    { label: 'DES', value: 'des' },
                    { label: 'AES', value: 'aes' }
                  ]}
                />
              </div>
              <div className="query-form-item">
                <label>Priv Password</label>
                <Input.Password
                  value={config.privPassword}
                  onChange={(e) => setConfig({ privPassword: e.target.value })}
                  style={{ width: 200 }}
                />
              </div>
            </div>
          )}
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
