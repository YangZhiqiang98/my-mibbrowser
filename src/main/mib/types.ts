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
 * Named numeric value from an INTEGER enum or BITS syntax.
 */
export interface MibNamedValue {
  /** Label from the MIB, e.g. "up" */
  name: string
  /** Numeric value, e.g. 1 */
  value: number
}

/**
 * Parsed TEXTUAL-CONVENTION metadata.
 */
export interface MibTextualConvention {
  /** Convention name, e.g. "DisplayString" */
  name: string
  /** Underlying SYNTAX field */
  syntax: string
  /** Optional DISPLAY-HINT */
  displayHint?: string
  /** STATUS value */
  status: MibStatus
  /** Human-readable description */
  description: string
  /** Source MIB module name */
  module: string
}

/**
 * Dependency warning produced while resolving IMPORTS.
 */
export interface MibDependencyWarning {
  /** Module that imports the missing dependency */
  module: string
  /** Source file for the importing module, when known */
  sourceFile?: string
  /** Missing imported module name */
  missingModule: string
  /** Imported symbols requested from the missing module */
  symbols: string[]
  /** User-facing diagnostic */
  message: string
}

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
  /** INTEGER enum values parsed from SYNTAX, if present */
  enumValues?: MibNamedValue[]
  /** BITS values parsed from SYNTAX, if present */
  bits?: MibNamedValue[]
  /** TEXTUAL-CONVENTION name used by SYNTAX, if known */
  textualConvention?: string
  /** DISPLAY-HINT inherited from a textual convention, if known */
  displayHint?: string
  /** Source file for this node, when known */
  sourceFile?: string
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
  /** Source file for this module, when known */
  sourceFile?: string
  /** Parsed textual conventions declared by this module */
  textualConventions: Record<string, MibTextualConvention>
  /** Dependency warnings scoped to this module */
  dependencyWarnings: MibDependencyWarning[]
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
  /** Structured dependency warnings */
  dependencyWarnings: MibDependencyWarning[]
  /** Current full MIB tree snapshot after successful load operations */
  tree?: MibNode[]
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
