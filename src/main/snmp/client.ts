// @ts-expect-error net-snmp has no TS types bundled
import snmp from 'net-snmp'
import type { SnmpConfig, SnmpResult, SnmpVarbind, SnmpSetValue, SecurityLevel } from './types'

/**
 * Raw varbind shape returned by net-snmp before formatting.
 */
type RawVarbind = { oid: string; type: number; value: unknown }

/**
 * Normalize the varbinds returned by net-snmp's getBulk.
 *
 * net-snmp returns a hybrid shape:
 *   - indices [0..nonRepeaters-1]: a single varbind object per non-repeater OID
 *   - indices [nonRepeaters..]:    an inner array of varbinds per repeater OID
 *
 * This flattens both segments into a single varbind list so callers can map
 * over them uniformly.
 */
function flattenBulkVarbinds(raw: unknown[], nonRepeaters: number): RawVarbind[] {
  const out: RawVarbind[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (i < nonRepeaters) {
      if (item) out.push(item as RawVarbind)
      continue
    }
    if (Array.isArray(item)) {
      for (const sub of item) {
        if (sub) out.push(sub as RawVarbind)
      }
    } else if (item) {
      out.push(item as RawVarbind)
    }
  }
  return out
}

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
    if (varbind.type === 64 && varbind.value.length === 4) {
      // IpAddress: convert 4 bytes to dotted format
      formattedValue = Array.from(varbind.value).join('.')
    } else if (varbind.type === 67) {
      // TimeTicks: keep as number
      formattedValue = varbind.value.readUInt32BE(0)
    } else {
      // OCTET STRING and others: try to decode as UTF-8 text
      const text = varbind.value.toString('utf-8')
      // If the text contains mostly printable characters, use it as-is
      const printable = text.replace(/[\x00-\x08\x0e-\x1f]/g, '')
      if (printable.length >= text.length * 0.8 && text.length > 0) {
        formattedValue = text
      } else {
        // Binary data: keep as Buffer for hex display
        formattedValue = varbind.value
      }
    }
  } else {
    formattedValue = varbind.value as string | number | null
  }

  return {
    oid: stripLeadingDot(varbind.oid),
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

    return snmp.createV3Session(config.host, user, {
      port: config.port,
      timeout: config.timeout,
      retries: config.retries,
      engineID: undefined,
      transport: 'udp4'
    })
  }

  return snmp.createSession(config.host, config.community, {
    port: config.port,
    timeout: config.timeout,
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

      const flat = flattenBulkVarbinds(varbinds || [], nonRepeaters)
      const results = flat.map((vb) => formatVarbindValue(vb))

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
 * Strip a leading dot from an OID if present, so comparisons are consistent.
 * net-snmp returns OIDs with a leading dot (e.g. ".1.3.6.1.2.1.1.1.0")
 * but the MIB tree stores them without (e.g. "1.3.6.1.2.1.1").
 */
function stripLeadingDot(oid: string): string {
  return oid.startsWith('.') ? oid.slice(1) : oid
}

/**
 * Check whether a varbind OID is still within the walk subtree rooted at rootOid.
 *
 * Compares OID segments (split on `.`) by requiring either an exact match or
 * `rootOid + '.'` as a prefix. This avoids false positives where one OID is a
 * lexical prefix of another at non-segment boundaries (e.g. "1.3.6.1.2.1.21"
 * vs "1.3.6.1.2.1.2").
 *
 * Also strips a leading dot from both inputs so net-snmp responses (which use
 * ".1.3.6...") line up with caller-provided roots (which usually do not).
 */
function oidInSubtree(oid: string, rootOid: string): boolean {
  const normalized = stripLeadingDot(oid)
  const root = stripLeadingDot(rootOid)
  return normalized === root || normalized.startsWith(root + '.')
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
        // endOfMibView (type 130) means the agent finished — stop the walk.
        // noSuchInstance (129) / noSuchObject (128) are non-fatal: include
        // them so the UI can show the error indicator, and keep walking.
        if (snmp.isVarbindError(vb) && (vb as { type: number }).type === 130) {
          session.close()
          resolve({
            success: true,
            varbinds: results,
            responseTime: Date.now() - startTime,
            timestamp: Date.now()
          })
          return
        }

        // Stop as soon as we walk past the requested subtree.
        // The boundary varbind itself does NOT belong to the result set,
        // so we must check BEFORE pushing — otherwise empty tables would
        // leak the next sibling's first instance into the results.
        if (!oidInSubtree(vb.oid, rootOid)) {
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
      }

      // Continue walking
      if (varbinds.length > 0) {
        // net-snmp returns OIDs with a leading dot; strip it before feeding
        // the OID back into getNext so the request is well-formed regardless
        // of how net-snmp's input parser treats leading dots.
        const lastOid = stripLeadingDot((varbinds[varbinds.length - 1] as { oid: string }).oid)
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

      const flat = flattenBulkVarbinds(varbinds || [], 0)
      let lastOid = ''
      let hitEndOfMib = false

      for (const vb of flat) {
        // endOfMibView (type 130) means the agent finished — stop the walk
        // after processing this batch. noSuchInstance/noSuchObject are
        // non-fatal: include and keep walking.
        if (snmp.isVarbindError(vb) && (vb as { type: number }).type === 130) {
          hitEndOfMib = true
          break
        }

        // Stop as soon as we walk past the requested subtree.
        // The boundary varbind itself does NOT belong to the result set.
        if (!oidInSubtree(vb.oid, rootOid)) {
          hitEndOfMib = true
          break
        }

        results.push(formatVarbindValue(vb))
        lastOid = vb.oid
      }

      if (hitEndOfMib || flat.length === 0 || !lastOid) {
        session.close()
        resolve({
          success: true,
          varbinds: results,
          responseTime: Date.now() - startTime,
          timestamp: Date.now()
        })
        return
      }

      // Strip leading dot before recursing — see snmpWalk for rationale.
      session.getBulk([stripLeadingDot(lastOid)], 0, maxRepetitions, callback)
    }

    session.getBulk([rootOid], 0, maxRepetitions, callback)
  })
}
