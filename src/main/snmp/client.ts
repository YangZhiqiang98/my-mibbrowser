// @ts-expect-error net-snmp has no TS types bundled
import snmp from 'net-snmp'
import type { SnmpConfig, SnmpResult, SnmpVarbind, SnmpSetValue, SecurityLevel } from './types'

/**
 * Format a varbind value for display
 */
function formatVarbindValue(varbind: { oid: string; type: number; value: unknown }): SnmpVarbind {
  const typeNames: Record<number, string> = {
    1: 'BOOLEAN',
    2: 'INTEGER',
    3: 'BIT STRING',
    4: 'OCTET STRING',
    5: 'NULL',
    6: 'OBJECT IDENTIFIER',
    64: 'IpAddress',
    65: 'Counter32',
    66: 'Gauge32',
    67: 'TimeTicks',
    68: 'Opaque',
    70: 'Counter64',
    128: 'noSuchObject',
    129: 'noSuchInstance',
    130: 'endOfMibView'
  }

  const typeName = typeNames[varbind.type] || `Unknown(${varbind.type})`
  let formattedValue: string | number | Buffer | null = null
  let isError = false
  let errorMsg: string | undefined

  if (varbind.type === 128) {
    isError = true
    errorMsg = 'noSuchObject'
    formattedValue = 'noSuchObject'
  } else if (varbind.type === 129) {
    isError = true
    errorMsg = 'noSuchInstance'
    formattedValue = 'noSuchInstance'
  } else if (varbind.type === 130) {
    isError = true
    errorMsg = 'endOfMibView'
    formattedValue = 'endOfMibView'
  } else if (Buffer.isBuffer(varbind.value)) {
    // Check if it looks like an IP address (4 bytes)
    if (varbind.type === 64 && varbind.value.length === 4) {
      formattedValue = Array.from(varbind.value).join('.')
    } else {
      formattedValue = varbind.value
    }
  } else {
    formattedValue = varbind.value as string | number | null
  }

  return {
    oid: varbind.oid,
    value: formattedValue,
    type: typeName,
    isError,
    error: errorMsg
  }
}

/**
 * Create an SNMP session based on configuration
 */
function createSession(config: SnmpConfig): ReturnType<typeof snmp.createSession> {
  if (config.version === 'v3') {
    const securityLevelMap: Record<SecurityLevel, number> = {
      noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv,
      authNoPriv: snmp.SecurityLevel.authNoPriv,
      authPriv: snmp.SecurityLevel.authPriv
    }

    const authProtocolMap: Record<string, string> = {
      md5: snmp.AuthProtocols.md5,
      sha: snmp.AuthProtocols.sha
    }

    const privProtocolMap: Record<string, string> = {
      des: snmp.PrivProtocols.des,
      aes: snmp.PrivProtocols.aes
    }

    const user: Record<string, unknown> = {
      name: config.username,
      level: securityLevelMap[config.securityLevel]
    }

    if (config.securityLevel !== 'noAuthNoPriv') {
      user.authProtocol = authProtocolMap[config.authProtocol] || snmp.AuthProtocols.md5
      user.authKey = config.authPassword
    }

    if (config.securityLevel === 'authPriv') {
      user.privProtocol = privProtocolMap[config.privProtocol] || snmp.PrivProtocols.des
      user.privKey = config.privPassword
    }

    return snmp.createSession({
      host: config.host,
      port: config.port,
      timeout: config.timeout / 1000,
      retries: config.retries,
      version: snmp.Version3,
      engineID: undefined,
      transport: 'udp4'
    })
  }

  return snmp.createSession(config.host, config.community, {
    port: config.port,
    timeout: config.timeout / 1000,
    retries: config.retries,
    version: config.version === 'v1' ? snmp.Version1 : snmp.Version2c
  })
}

/**
 * Execute an SNMP GET request
 */
export function snmpGet(config: SnmpConfig, oids: string[]): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)

    session.get(oids, (error: unknown, varbinds: unknown[]) => {
      const responseTime = Date.now() - startTime

      if (error) {
        session.close()
        resolve({
          success: false,
          varbinds: [],
          error: String(error),
          responseTime,
          timestamp: Date.now()
        })
        return
      }

      const results = (varbinds || []).map((vb: unknown) =>
        formatVarbindValue(vb as { oid: string; type: number; value: unknown })
      )

      session.close()
      resolve({
        success: true,
        varbinds: results,
        responseTime,
        timestamp: Date.now()
      })
    })
  })
}

/**
 * Execute an SNMP GETNEXT request
 */
export function snmpGetNext(config: SnmpConfig, oids: string[]): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)

    session.getNext(oids, (error: unknown, varbinds: unknown[]) => {
      const responseTime = Date.now() - startTime

      if (error) {
        session.close()
        resolve({
          success: false,
          varbinds: [],
          error: String(error),
          responseTime,
          timestamp: Date.now()
        })
        return
      }

      const results = (varbinds || []).map((vb: unknown) =>
        formatVarbindValue(vb as { oid: string; type: number; value: unknown })
      )

      session.close()
      resolve({
        success: true,
        varbinds: results,
        responseTime,
        timestamp: Date.now()
      })
    })
  })
}

/**
 * Execute an SNMP GETBULK request
 */
export function snmpGetBulk(
  config: SnmpConfig, oids: string[], maxRepetitions = 10, nonRepeaters = 0
): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)

    session.getBulk(oids, nonRepeaters, maxRepetitions, (error: unknown, varbinds: unknown[]) => {
      const responseTime = Date.now() - startTime

      if (error) {
        session.close()
        resolve({
          success: false,
          varbinds: [],
          error: String(error),
          responseTime,
          timestamp: Date.now()
        })
        return
      }

      const results = (varbinds || []).map((vb: unknown) =>
        formatVarbindValue(vb as { oid: string; type: number; value: unknown })
      )

      session.close()
      resolve({
        success: true,
        varbinds: results,
        responseTime,
        timestamp: Date.now()
      })
    })
  })
}

/**
 * Execute an SNMP SET request
 */
export function snmpSet(config: SnmpConfig, values: SnmpSetValue[]): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)

    const typeMap: Record<string, number> = {
      'INTEGER': snmp.ObjectType.Integer,
      'OCTET STRING': snmp.ObjectType.OctetString,
      'OBJECT IDENTIFIER': snmp.ObjectType.OID,
      'NULL': snmp.ObjectType.Null,
      'IpAddress': snmp.ObjectType.IpAddress,
      'Counter32': snmp.ObjectType.Counter,
      'Gauge32': snmp.ObjectType.Gauge,
      'TimeTicks': snmp.ObjectType.TimeTicks,
      'Opaque': snmp.ObjectType.Opaque,
      'Counter64': snmp.ObjectType.Counter64
    }

    const varbinds = values.map(v => ({
      oid: v.oid,
      type: typeMap[v.type] || snmp.ObjectType.OctetString,
      value: v.value
    }))

    session.set(varbinds, (error: unknown, varbinds: unknown[]) => {
      const responseTime = Date.now() - startTime

      if (error) {
        session.close()
        resolve({
          success: false,
          varbinds: [],
          error: String(error),
          responseTime,
          timestamp: Date.now()
        })
        return
      }

      const results = (varbinds || []).map((vb: unknown) =>
        formatVarbindValue(vb as { oid: string; type: number; value: unknown })
      )

      session.close()
      resolve({
        success: true,
        varbinds: results,
        responseTime,
        timestamp: Date.now()
      })
    })
  })
}

/**
 * Execute an SNMP WALK (GETNEXT loop) operation
 */
export function snmpWalk(config: SnmpConfig, rootOid: string): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)
    const results: SnmpVarbind[] = []

    const callback = (error: unknown, varbinds: unknown[]) => {
      if (error) {
        session.close()
        resolve({
          success: false,
          varbinds: results,
          error: String(error),
          responseTime: Date.now() - startTime,
          timestamp: Date.now()
        })
        return
      }

      for (const vb of varbinds as Array<{ oid: string; type: number; value: unknown }>) {
        if (snmp.isVarbindError(vb)) {
          session.close()
          resolve({
            success: true,
            varbinds: results,
            responseTime: Date.now() - startTime,
            timestamp: Date.now()
          })
          return
        }

        results.push(formatVarbindValue(vb))

        // Check if we've walked past the root OID
        if (!vb.oid.startsWith(rootOid) && !rootOid.startsWith(vb.oid)) {
          session.close()
          resolve({
            success: true,
            varbinds: results,
            responseTime: Date.now() - startTime,
            timestamp: Date.now()
          })
          return
        }
      }

      // Continue walking
      if (varbinds.length > 0) {
        const lastOid = (varbinds[varbinds.length - 1] as { oid: string }).oid
        session.getNext([lastOid], callback)
      } else {
        session.close()
        resolve({
          success: true,
          varbinds: results,
          responseTime: Date.now() - startTime,
          timestamp: Date.now()
        })
      }
    }

    session.getNext([rootOid], callback)
  })
}

/**
 * Execute an SNMP Bulk Walk (GETBULK loop) operation
 */
export function snmpBulkWalk(
  config: SnmpConfig, rootOid: string, maxRepetitions = 10
): Promise<SnmpResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const session = createSession(config)
    const results: SnmpVarbind[] = []

    const callback = (error: unknown, varbinds: unknown[]) => {
      if (error) {
        session.close()
        resolve({
          success: false,
          varbinds: results,
          error: String(error),
          responseTime: Date.now() - startTime,
          timestamp: Date.now()
        })
        return
      }

      let lastOid = ''

      for (const vb of varbinds as Array<{ oid: string; type: number; value: unknown }>) {
        if (snmp.isVarbindError(vb)) {
          session.close()
          resolve({
            success: true,
            varbinds: results,
            responseTime: Date.now() - startTime,
            timestamp: Date.now()
          })
          return
        }

        // Check if we've walked past the root OID
        if (!vb.oid.startsWith(rootOid) && !rootOid.startsWith(vb.oid)) {
          session.close()
          resolve({
            success: true,
            varbinds: results,
            responseTime: Date.now() - startTime,
            timestamp: Date.now()
          })
          return
        }

        results.push(formatVarbindValue(vb))
        lastOid = vb.oid
      }

      if (varbinds.length > 0 && lastOid) {
        session.getBulk([lastOid], 0, maxRepetitions, callback)
      } else {
        session.close()
        resolve({
          success: true,
          varbinds: results,
          responseTime: Date.now() - startTime,
          timestamp: Date.now()
        })
      }
    }

    session.getBulk([rootOid], 0, maxRepetitions, callback)
  })
}
