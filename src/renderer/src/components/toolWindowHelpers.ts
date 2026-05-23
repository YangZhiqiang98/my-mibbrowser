import type { MessageInstance } from 'antd/es/message/interface'
import type { MibTreeNodeData, ResultSession } from '../types'

export async function consumeToolWindowDragNode(messageApi: MessageInstance): Promise<MibTreeNodeData | null> {
  const node = await window.api.snmpTool.consumeDragNode()
  if (!node) return null
  if (!node.oid) {
    messageApi.warning('该节点没有 OID')
    return null
  }
  return node
}

export function publishResultToMain(
  session: ResultSession | null,
  options: {
    connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error'
    statusMessage?: string
    isQuerying?: boolean
  } = {}
): void {
  window.api.snmpTool.updateMainResult({
    session,
    ...options
  }).catch(() => {})
}

export function publishStatusToMain(options: {
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error'
  statusMessage?: string
  isQuerying?: boolean
}): void {
  window.api.snmpTool.updateMainStatus(options).catch(() => {})
}

export function publishToastToMain(
  kind: 'success' | 'error' | 'warning' | 'info',
  message: string
): void {
  window.api.snmpTool.showMainToast({ kind, message }).catch(() => {})
}
