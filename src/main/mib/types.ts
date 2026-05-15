/**
 * MIB node access level
 */
export type MibAccess = 'not-accessible' | 'accessible-for-notify' | 'read-only' | 'read-write' | 'read-create'

/**
 * MIB node status
 */
export type MibStatus = 'current' | 'deprecated' | 'obsolete'

/**
 * MIB node kind
 */
export type MibNodeKind = 'scalar' | 'table' | 'entry' | 'column' | 'notification' | 'group' | 'module' | 'root'

/**
 * A single node in the MIB tree
 */
export interface MibNode {
  /** Unique identifier for the node in the tree */
  id: string
  /** Symbolic name, e.g. "sysDescr" */
  name: string
  /** Full numeric OID, e.g. [1, 3, 6, 1, 2, 1, 1, 1] */
  oid: number[]
  /** Dotted OID string, e.g. "1.3.6.1.2.1.1.1" */
  oidString: string
  /** SYNTAX type, e.g. "DisplayString", "Integer32", "OCTET STRING" */
  syntax: string
  /** MAX-ACCESS value */
  access: MibAccess
  /** STATUS value */
  status: MibStatus
  /** Human-readable description */
  description: string
  /** Node kind for icon display */
  kind: MibNodeKind
  /** Source MIB module name */
  module: string
  /** Parent node id */
  parentId: string | null
  /** Child node ids */
  children: string[]
  /** Whether this node is a table entry */
  isTable: boolean
  /** INDEX columns for table entries */
  indexColumns: string[]
  /** Raw OID definition from MIB file, e.g. "system 1" from ::= { system 1 } */
  oidDef: string
}

/**
 * A parsed MIB module
 */
export interface MibModule {
  /** Module name, e.g. "SNMPv2-MIB" */
  name: string
  /** Module description */
  description: string
  /** Last updated timestamp */
  lastUpdated: string
  /** Organization */
  organization: string
  /** Contact info */
  contactInfo: string
  /** Root OID of the module */
  rootOid: string
  /** All nodes in this module */
  nodes: MibNode[]
  /** Import statements */
  imports: Record<string, string[]>
}

/**
 * Result of parsing a MIB file
 */
export interface MibParseResult {
  /** Successfully parsed modules */
  modules: MibModule[]
  /** Parse errors */
  errors: MibParseError[]
  /** Parse warnings */
  warnings: string[]
}

/**
 * A parse error with location info
 */
export interface MibParseError {
  /** Line number in the source file */
  line: number
  /** Column number */
  column: number
  /** Error message */
  message: string
  /** Error severity */
  severity: 'error' | 'warning'
}

/**
 * Flattened node for the tree view
 */
export interface MibTreeNode {
  id: string
  name: string
  oid: string
  kind: MibNodeKind
  access: MibAccess
  syntax: string
  module: string
  isLeaf: boolean
  children: MibTreeNode[]
}
