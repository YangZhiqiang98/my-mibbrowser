import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import type {
  MibNode,
  MibModule,
  MibParseResult,
  MibParseError,
  MibAccess,
  MibStatus,
  MibNodeKind,
  MibNamedValue,
  MibTextualConvention,
  MibDependencyWarning
} from './types'

interface MibSource {
  name: string
  content: string
  sourceFile?: string
}

interface MibModuleIndexEntry extends MibSource {
  moduleName: string
  imports: Record<string, string[]>
}

/**
 * Strip the IMPORTS section from MIB content to prevent imported symbols
 * from being parsed as actual OBJECT-TYPE/OBJECT-IDENTITY definitions.
 */
function stripImportsSection(content: string): string {
  return content.replace(/IMPORTS\s*[\s\S]*?;/gi, '')
}

/**
 * Simple SMI MIB file parser.
 * Handles SMIv1 and SMIv2 syntax for common MIB files.
 */
export class MibParser {
  private modules: MibModule[] = []
  private errors: MibParseError[] = []
  private warnings: string[] = []
  private dependencyWarnings: MibDependencyWarning[] = []
  private textualConventionMap = new Map<string, MibTextualConvention>()

  /**
   * Parse one or more MIB files
   */
  parseFiles(filePaths: string[]): MibParseResult {
    this.reset()

    const sources: MibSource[] = []
    for (const filePath of filePaths) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        sources.push({ name: basename(filePath), content, sourceFile: filePath })
      } catch (err) {
        this.errors.push({
          line: 0,
          column: 0,
          message: `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error'
        })
      }
    }

    this.parseSources(sources)
    return this.buildResult()
  }

  /**
   * Parse MIB files from text content (used for drag-and-drop from renderer).
   * Accepts an array of { name, content } objects.
   */
  parseFileContents(fileContents: Array<{ name: string; content: string }>): MibParseResult {
    this.reset()
    this.parseSources(fileContents.map((file) => ({
      name: file.name,
      content: file.content,
      sourceFile: file.name
    })))
    return this.buildResult()
  }

  /**
   * Parse all MIB files in a directory, recursively scanning subdirectories.
   */
  parseDirectory(dirPath: string): MibParseResult {
    if (!existsSync(dirPath)) {
      return {
        modules: [],
        errors: [{ line: 0, column: 0, message: `Directory not found: ${dirPath}`, severity: 'error' }],
        warnings: [],
        dependencyWarnings: []
      }
    }

    const extensions = ['.my', '.mib', '.txt']
    const files = collectMibFiles(dirPath, extensions)

    return this.parseFiles(files)
  }

  private reset(): void {
    this.modules = []
    this.errors = []
    this.warnings = []
    this.dependencyWarnings = []
    this.textualConventionMap = new Map()
  }

  private buildResult(): MibParseResult {
    return {
      modules: this.modules,
      errors: this.errors,
      warnings: this.warnings,
      dependencyWarnings: this.dependencyWarnings
    }
  }

  private parseSources(sources: MibSource[]): void {
    const indexed = sources.map((source) => this.indexSource(source))
    const ordered = orderByDependencies(indexed)

    this.recordMissingDependencies(indexed)

    for (const entry of ordered) {
      try {
        this.parseModuleFromSource(entry)
      } catch (err) {
        this.errors.push({
          line: 0,
          column: 0,
          message: `Failed to parse ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error'
        })
      }
    }

    this.applyTextualConventionMetadata()
  }

  private indexSource(source: MibSource): MibModuleIndexEntry {
    return {
      ...source,
      moduleName: this.extractModuleName(source.content, source.name),
      imports: this.parseImports(source.content)
    }
  }

  private recordMissingDependencies(indexed: MibModuleIndexEntry[]): void {
    const availableModules = new Set(indexed.map((entry) => entry.moduleName))

    for (const entry of indexed) {
      for (const [moduleName, symbols] of Object.entries(entry.imports)) {
        if (availableModules.has(moduleName)) continue

        const warning: MibDependencyWarning = {
          module: entry.moduleName,
          sourceFile: entry.sourceFile,
          missingModule: moduleName,
          symbols,
          message: `Module ${entry.moduleName} imports ${symbols.join(', ')} from missing module ${moduleName}`
        }
        this.dependencyWarnings.push(warning)
        this.warnings.push(warning.message)
      }
    }
  }

  private parseModuleFromSource(source: MibSource): void {
    const moduleName = this.extractModuleName(source.content, source.name)

    const module: MibModule = {
      name: moduleName,
      description: '',
      lastUpdated: '',
      organization: '',
      contactInfo: '',
      rootOid: '',
      nodes: [],
      imports: {},
      sourceFile: source.sourceFile,
      textualConventions: {},
      dependencyWarnings: this.dependencyWarnings.filter((warning) => warning.module === moduleName)
    }

    // Parse imports
    module.imports = this.parseImports(source.content)

    // Parse module identity
    this.parseModuleIdentity(source.content, module)

    // Strip IMPORTS section before parsing definitions to avoid
    // imported symbols being parsed as actual MIB definitions
    const contentWithoutImports = stripImportsSection(source.content)

    module.textualConventions = this.parseTextualConventions(contentWithoutImports, moduleName)
    for (const convention of Object.values(module.textualConventions)) {
      this.textualConventionMap.set(convention.name, convention)
    }

    // Parse object type definitions
    const objectTypes = this.parseObjectTypes(contentWithoutImports, moduleName, source.sourceFile)
    module.nodes.push(...objectTypes)

    // Parse object identity definitions
    const objectIdentities = this.parseObjectIdentities(contentWithoutImports, moduleName, source.sourceFile)
    module.nodes.push(...objectIdentities)

    // Parse notification types
    const notifications = this.parseNotificationTypes(contentWithoutImports, moduleName, source.sourceFile)
    module.nodes.push(...notifications)

    // Parse OBJECT IDENTIFIER definitions (e.g. "rcOptBertObjects OBJECT IDENTIFIER ::= { parent 1 }")
    const objectIdDefs = this.parseObjectIdDefs(contentWithoutImports, moduleName, source.sourceFile)
    module.nodes.push(...objectIdDefs)

    this.modules.push(module)
  }

  /**
   * Extract module name from MIB content.
   *
   * MIB files frequently begin with comments (e.g. "-- file: FOO-MIB.my")
   * or surrounding whitespace before the actual `MODULE-NAME DEFINITIONS ::= BEGIN`
   * declaration, so the primary regex must NOT be anchored to position 0.
   *
   * The MODULE-IDENTITY fallback also must not run against the raw content —
   * the IMPORTS section typically lists `MODULE-IDENTITY` as an imported symbol,
   * which would otherwise yield the bogus module name "IMPORTS". The IMPORTS
   * section is stripped before the fallback search.
   */
  private extractModuleName(content: string, fileName: string): string {
    // Match `MODULE-NAME DEFINITIONS ::= BEGIN`. Allowed anywhere in the file
    // (not anchored to ^) so leading comments and whitespace do not block it.
    const moduleMatch = content.match(/(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
    if (moduleMatch) {
      return moduleMatch[1]
    }
    // Fallback: locate the MODULE-IDENTITY macro invocation, but ignore the
    // IMPORTS section to avoid grabbing the literal token `IMPORTS`.
    const withoutImports = stripImportsSection(content)
    const identityMatch = withoutImports.match(/(\S+)\s+MODULE-IDENTITY/i)
    if (identityMatch) {
      return identityMatch[1]
    }
    return basename(fileName, extname(fileName))
  }

  /**
   * Parse IMPORTS section
   */
  private parseImports(content: string): Record<string, string[]> {
    const imports: Record<string, string[]> = {}
    const importMatch = content.match(/IMPORTS\s*([\s\S]*?);/i)

    if (!importMatch) return imports

    const importBlock = importMatch[1]
    // Match "symbol1, symbol2 FROM module"
    const fromMatches = importBlock.matchAll(/([^;]+?)\s+FROM\s+(\S+)/g)

    for (const match of fromMatches) {
      const symbols = match[1].split(',').map(s => s.trim()).filter(s => s.length > 0)
      const moduleName = match[2]
      imports[moduleName] = symbols
    }

    return imports
  }

  /**
   * Parse MODULE-IDENTITY section
   */
  private parseModuleIdentity(content: string, module: MibModule): void {
    const lastUpdatedMatch = content.match(/LAST-UPDATED\s*"([^"]+)"/)
    if (lastUpdatedMatch) module.lastUpdated = lastUpdatedMatch[1]

    const orgMatch = content.match(/ORGANIZATION\s*"([^"]+)"/)
    if (orgMatch) module.organization = orgMatch[1]

    const contactMatch = content.match(/CONTACT-INFO\s*"([^"]+)"/)
    if (contactMatch) module.contactInfo = contactMatch[1]

    const descMatch = content.match(/DESCRIPTION\s*"([^"]+)"/)
    if (descMatch) module.description = descMatch[1]
  }

  /**
   * Parse all OBJECT-TYPE definitions
   */
  private parseObjectTypes(content: string, moduleName: string, sourceFile?: string): MibNode[] {
    const nodes: MibNode[] = []

    // Match OBJECT-TYPE blocks
    const objectTypeRegex = /(\S+)\s+OBJECT-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
    let match: RegExpExecArray | null

    while ((match = objectTypeRegex.exec(content)) !== null) {
      const name = match[1]
      const body = match[2]
      const oidDef = match[3].trim()

      const syntax = this.extractSyntax(body)
      const access = this.extractAccess(body)
      const status = this.extractStatus(body)
      const description = this.extractField(body, 'DESCRIPTION') || ''
      const indexColumns = this.extractIndexColumns(body)
      const kind = this.determineKind(syntax, access, indexColumns)
      const bits = extractBits(syntax)
      const enumValues = extractEnumValues(syntax)

      const node: MibNode = {
        id: `${moduleName}::${name}`,
        name,
        oid: [],
        oidString: '',
        syntax,
        access,
        status,
        description: this.cleanDescription(description),
        kind,
        module: moduleName,
        parentId: null,
        children: [],
        isTable: syntax.includes('SEQUENCE OF') || syntax.includes('SEQUENCE'),
        indexColumns,
        oidDef,
        enumValues: enumValues.length > 0 ? enumValues : undefined,
        bits: bits.length > 0 ? bits : undefined,
        textualConvention: extractSyntaxBase(syntax),
        sourceFile
      }

      nodes.push(node)
    }

    return nodes
  }

  /**
   * Parse OBJECT-IDENTITY definitions
   */
  private parseObjectIdentities(content: string, moduleName: string, sourceFile?: string): MibNode[] {
    const nodes: MibNode[] = []
    const regex = /(\S+)\s+(?:OBJECT-IDENTITY|MODULE-IDENTITY)\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const name = match[1]
      const body = match[2]
      const description = this.extractField(body, 'DESCRIPTION') || ''
      const status = this.extractStatus(body)
      const oidDef = match[3].trim()

      const node: MibNode = {
        id: `${moduleName}::${name}`,
        name,
        oid: [],
        oidString: '',
        syntax: 'OBJECT-IDENTITY',
        access: 'not-accessible',
        status,
        description: this.cleanDescription(description),
        kind: 'group',
        module: moduleName,
        parentId: null,
        children: [],
        isTable: false,
        indexColumns: [],
        oidDef,
        sourceFile
      }

      nodes.push(node)
    }

    return nodes
  }

  /**
   * Parse NOTIFICATION-TYPE definitions
   */
  private parseNotificationTypes(content: string, moduleName: string, sourceFile?: string): MibNode[] {
    const nodes: MibNode[] = []
    const regex = /(\S+)\s+NOTIFICATION-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const name = match[1]
      const body = match[2]
      const description = this.extractField(body, 'DESCRIPTION') || ''
      const status = this.extractStatus(body)
      const oidDef = match[3].trim()

      const node: MibNode = {
        id: `${moduleName}::${name}`,
        name,
        oid: [],
        oidString: '',
        syntax: 'NOTIFICATION-TYPE',
        access: 'accessible-for-notify',
        status,
        description: this.cleanDescription(description),
        kind: 'notification',
        module: moduleName,
        parentId: null,
        children: [],
        isTable: false,
        indexColumns: [],
        oidDef,
        sourceFile
      }

      nodes.push(node)
    }

    return nodes
  }

  /**
   * Parse OBJECT IDENTIFIER definitions (e.g. "rcOptBertObjects OBJECT IDENTIFIER ::= { parent 1 }")
   * These are container/group nodes commonly used in MIB files to organize subtrees.
   */
  private parseObjectIdDefs(content: string, moduleName: string, sourceFile?: string): MibNode[] {
    const nodes: MibNode[] = []
    const regex = /(\S+)\s+OBJECT\s+IDENTIFIER\s*::=\s*\{([^}]+)\}/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const name = match[1]
      const oidDef = match[2].trim()

      const node: MibNode = {
        id: `${moduleName}::${name}`,
        name,
        oid: [],
        oidString: '',
        syntax: 'OBJECT IDENTIFIER',
        access: 'not-accessible',
        status: 'current',
        description: '',
        kind: 'group',
        module: moduleName,
        parentId: null,
        children: [],
        isTable: false,
        indexColumns: [],
        oidDef,
        sourceFile
      }

      nodes.push(node)
    }

    return nodes
  }

  /**
   * Extract a field value from a MIB definition body
   */
  private extractField(body: string, fieldName: string): string | null {
    const regex = new RegExp(`${fieldName}\\s+("?)([^"\\n]*(?:\\n[^"\\n]*)*?)\\1`, 'i')
    const match = body.match(regex)
    if (!match) return null

    let value = match[2].trim()
    // Handle multi-line quoted strings
    value = value.replace(/\s*\n\s*/g, ' ')
    return value
  }

  private extractSyntax(body: string): string {
    const match = body.match(/SYNTAX\s+([\s\S]*?)(?=\n\s*(?:UNITS|MAX-ACCESS|ACCESS|STATUS|DESCRIPTION|REFERENCE|INDEX|AUGMENTS|DEFVAL)\b|$)/i)
    if (!match) return ''
    return normalizeMibInlineValue(match[1])
  }

  private parseTextualConventions(content: string, moduleName: string): Record<string, MibTextualConvention> {
    const conventions: Record<string, MibTextualConvention> = {}
    const regex = /(\S+)\s+::=\s+TEXTUAL-CONVENTION\s*([\s\S]*?)(?=\n\S+\s+(?:OBJECT-TYPE|OBJECT-IDENTITY|MODULE-IDENTITY|NOTIFICATION-TYPE|OBJECT\s+IDENTIFIER|::=\s+TEXTUAL-CONVENTION)|\s+END\b)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const name = match[1]
      const body = match[2]
      const syntax = this.extractSyntax(body)
      const displayHint = this.extractField(body, 'DISPLAY-HINT') || undefined
      const description = this.extractField(body, 'DESCRIPTION') || ''
      const convention: MibTextualConvention = {
        name,
        syntax,
        displayHint,
        status: this.extractStatus(body),
        description: this.cleanDescription(description),
        module: moduleName
      }
      conventions[name] = convention
    }

    return conventions
  }

  private applyTextualConventionMetadata(): void {
    for (const module of this.modules) {
      for (const node of module.nodes) {
        const base = node.textualConvention || extractSyntaxBase(node.syntax)
        const convention = this.textualConventionMap.get(base)
        if (!convention) continue

        node.textualConvention = convention.name
        node.displayHint = convention.displayHint

        if (!node.enumValues || node.enumValues.length === 0) {
          const enumValues = extractEnumValues(convention.syntax)
          if (enumValues.length > 0) node.enumValues = enumValues
        }
        if (!node.bits || node.bits.length === 0) {
          const bits = extractBits(convention.syntax)
          if (bits.length > 0) node.bits = bits
        }
      }
    }
  }

  /**
   * Extract MAX-ACCESS or ACCESS field
   */
  private extractAccess(body: string): MibAccess {
    const accessMatch = body.match(/(?:MAX-ACCESS|ACCESS)\s+(\S+)/i)
    if (!accessMatch) return 'not-accessible'

    const access = accessMatch[1].toLowerCase()
    const validAccess: MibAccess[] = [
      'not-accessible', 'accessible-for-notify', 'read-only', 'read-write', 'read-create'
    ]
    return validAccess.includes(access as MibAccess) ? access as MibAccess : 'not-accessible'
  }

  /**
   * Extract STATUS field
   */
  private extractStatus(body: string): MibStatus {
    const statusMatch = body.match(/STATUS\s+(\S+)/i)
    if (!statusMatch) return 'current'

    const status = statusMatch[1].toLowerCase()
    const validStatus: MibStatus[] = ['current', 'deprecated', 'obsolete']
    return validStatus.includes(status as MibStatus) ? status as MibStatus : 'current'
  }

  /**
   * Determine node kind from syntax and access
   */
  private determineKind(syntax: string, access: MibAccess, indexColumns: string[] = []): MibNodeKind {
    if (syntax.includes('SEQUENCE OF')) return 'table'
    if (indexColumns.length > 0) return 'entry'
    if (syntax === 'SEQUENCE' || syntax.includes('SEQUENCE {')) return 'entry'
    if (access === 'not-accessible' && !syntax.includes('SEQUENCE')) return 'column'
    return 'scalar'
  }

  /**
   * Extract INDEX columns from table entry definition
   */
  private extractIndexColumns(body: string): string[] {
    const indexMatch = body.match(/INDEX\s*\{([^}]+)\}/i)
    if (!indexMatch) return []

    return indexMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0)
  }

  /**
   * Clean up description text
   */
  private cleanDescription(desc: string): string {
    return desc
      .replace(/\s+/g, ' ')
      .replace(/--/g, '')
      .trim()
  }
}

/**
 * Resolve OID paths by building a tree from parsed MIB modules.
 * This builds the standard MIB tree structure with iso(1).org(3).dod(6).internet(1) as root.
 */
export function buildMibTree(modules: MibModule[]): MibNode[] {
  // Create a map of all nodes by name (for parent lookups during relationship building)
  const nodeMap = new Map<string, MibNode>()
  const allNodes: MibNode[] = []

  // First, create the standard root structure
  const rootNodes = createStandardRootNodes()
  for (const node of rootNodes) {
    nodeMap.set(node.name, node)
    allNodes.push(node)
  }

  // Add all parsed nodes to the map (name map uses first definition for parent lookups)
  for (const module of modules) {
    for (const node of module.nodes) {
      if (!nodeMap.has(node.name)) {
        nodeMap.set(node.name, node)
      }
      allNodes.push(node)
    }
  }

  // Build parent-child relationships and resolve OID paths
  buildRelationships(allNodes, nodeMap)

  // --- Deduplicate by OID ---
  // Prefer standard root nodes; merge children from duplicates.
  const oidMap = new Map<string, MibNode>()
  const survivingNodes: MibNode[] = []
  const removedIds = new Set<string>()

  for (const node of allNodes) {
    if (node.oid.length === 0) {
      // Nodes with unresolved OIDs are kept individually (orphan filter will handle them)
      survivingNodes.push(node)
      continue
    }
    const key = node.oidString
    if (oidMap.has(key)) {
      const existing = oidMap.get(key)!
      // If the duplicate shares the same stable id (same module/name parsed
      // twice, e.g. same MIB loaded from two source directories), it represents
      // the same logical entity. Skip merging and removal — adding its id to
      // removedIds would later strip valid child references that point to the
      // surviving node, since survivor and duplicate share the same id.
      if (existing.id === node.id) {
        continue
      }
      // Merge: keep existing (prefer root), add children from duplicate
      for (const childId of node.children) {
        if (!existing.children.includes(childId)) {
          existing.children = [...existing.children, childId]
        }
      }
      // Fill in or prefer MIB-parsed properties over standard root placeholders
      if (!existing.description && node.description) existing.description = node.description
      if (!existing.syntax && node.syntax) existing.syntax = node.syntax
      if (!existing.oidDef && node.oidDef) existing.oidDef = node.oidDef
      // Prefer MIB-parsed access/status/kind over standard root defaults
      if (node.access !== 'not-accessible' && existing.access === 'not-accessible') {
        existing.access = node.access
      }
      if (node.status && node.status !== 'current') existing.status = node.status
      if (node.kind !== 'root' && existing.kind === 'root') existing.kind = node.kind
      // Inherit parentId from duplicate if survivor has none
      // (standard root nodes are created with parentId: null, but MIB-parsed
      // duplicates have the resolved parentId from buildRelationships)
      if (!existing.parentId && node.parentId) {
        existing.parentId = node.parentId
      }
      removedIds.add(node.id)
    } else {
      oidMap.set(key, node)
      survivingNodes.push(node)
    }
  }

  // Re-redirect references from removed nodes to survivors
  const oldToNew = new Map<string, string>()
  for (const removedId of removedIds) {
    const removed = allNodes.find(n => n.id === removedId)
    if (!removed) continue
    const survivor = oidMap.get(removed.oidString)
    if (survivor) oldToNew.set(removedId, survivor.id)
  }

  for (const node of survivingNodes) {
    if (node.parentId && oldToNew.has(node.parentId)) {
      node.parentId = oldToNew.get(node.parentId)!
    }
    node.children = node.children
      .map(cid => oldToNew.get(cid) ?? cid)
      .filter(cid => !removedIds.has(cid))
  }
  // Also update nodeMap name entries to point to survivors
  for (const [name, node] of nodeMap) {
    if (removedIds.has(node.id)) {
      const survivor = oidMap.get(node.oidString)
      if (survivor) nodeMap.set(name, survivor)
    }
  }

  // --- Filter orphan nodes ---
  // Only keep nodes whose parent chain can be traced to the root OID "1" (iso).
  const nodeById = new Map<string, MibNode>()
  for (const node of survivingNodes) {
    nodeById.set(node.id, node)
  }

  const rootOid = '1'
  const reachable = new Set<string>()

  for (const node of survivingNodes) {
    // Walk up parent chain
    let current: MibNode | undefined = node
    const chain: string[] = []
    while (current) {
      chain.push(current.id)
      if (reachable.has(current.id)) {
        // Already known reachable
        for (const id of chain) reachable.add(id)
        break
      }
      if (current.oidString === rootOid) {
        for (const id of chain) reachable.add(id)
        break
      }
      if (!current.parentId) break
      current = nodeById.get(current.parentId)
      if (!current) break
    }
  }

  // Filter: only keep reachable nodes
  const finalNodes = survivingNodes.filter(n => reachable.has(n.id))

  // Clean up children arrays to remove references to non-reachable nodes
  for (const node of finalNodes) {
    node.children = node.children.filter(cid => reachable.has(cid))
  }

  return finalNodes
}

/**
 * Create the standard MIB root tree nodes
 */
function createStandardRootNodes(): MibNode[] {
  const createNode = (
    name: string, oid: number[], syntax: string, access: MibAccess,
    description: string, kind: MibNodeKind, oidDef: string
  ): MibNode => ({
    id: `root::${name}`,
    name,
    oid,
    oidString: oid.join('.'),
    syntax,
    access,
    status: 'current',
    description,
    kind,
    module: 'RFC',
    parentId: null,
    children: [],
    isTable: false,
    indexColumns: [],
    oidDef
  })

  return [
    createNode('iso', [1], 'OBJECT-IDENTITY', 'not-accessible', 'ISO root', 'root', ''),
    createNode('org', [1, 3], 'OBJECT-IDENTITY', 'not-accessible', 'ISO organization', 'root', 'iso 3'),
    createNode('dod', [1, 3, 6], 'OBJECT-IDENTITY', 'not-accessible', 'US Department of Defense', 'root', 'org 6'),
    createNode('internet', [1, 3, 6, 1], 'OBJECT-IDENTITY', 'not-accessible', 'Internet OID tree root', 'root', 'dod 1'),
    createNode('mgmt', [1, 3, 6, 1, 2], 'OBJECT-IDENTITY', 'not-accessible', 'Management OID subtree', 'root', 'internet 2'),
    createNode('mib-2', [1, 3, 6, 1, 2, 1], 'OBJECT-IDENTITY', 'not-accessible', 'MIB-2 subtree', 'root', 'mgmt 1'),
    createNode('private', [1, 3, 6, 1, 4], 'OBJECT-IDENTITY', 'not-accessible', 'Private enterprise OID subtree', 'root', 'internet 4'),
    createNode('enterprises', [1, 3, 6, 1, 4, 1], 'OBJECT-IDENTITY', 'not-accessible', 'Enterprise-specific OID subtree', 'root', 'private 1'),
    createNode('experimental', [1, 3, 6, 1, 3], 'OBJECT-IDENTITY', 'not-accessible', 'Experimental OID subtree', 'root', 'internet 3'),
  ]
}

/**
 * Parse the ::= { parentName childNumber } definition into parent name and child number.
 * Handles forms like:
 *   "system 1"          -> { parentName: "system", childNumber: 1 }
 *   "enterprises 1234"  -> { parentName: "enterprises", childNumber: 1234 }
 *   "mgmt 1"            -> { parentName: "mgmt", childNumber: 1 }
 */
function parseOidDef(oidDef: string): { parentName: string; childNumber: number } | null {
  // Strip surrounding braces: "{ iso 3 }" → "iso 3"
  const trimmed = oidDef.trim().replace(/^\{\s*/, '').replace(/\s*\}$/, '')
  if (!trimmed) return null

  const simpleMatch = trimmed.match(/^(\S+)\s+(\d+)$/)
  if (simpleMatch) {
    return {
      parentName: simpleMatch[1],
      childNumber: parseInt(simpleMatch[2], 10)
    }
  }

  return null
}

/**
 * Parse a multi-segment OID definition like "iso(1) org(3) dod(6) internet(1) mgmt(2) mib-2(1) 1"
 * and return the fully-qualified numeric OID array, or null if it cannot be fully resolved.
 */
function parseMultiSegmentOidDef(oidDef: string): number[] | null {
  const trimmed = oidDef.trim()
  if (!trimmed) return null

  // Match segments like: name(number) or standalone number
  // e.g. "iso(1) org(3) dod(6) internet(1) mgmt(2) mib-2(1) 1"
  const segments: Array<{ name: string; number: number | null }> = []
  const segRegex = /(\S+?)\((\d+)\)|(\d+)/g
  let segMatch: RegExpExecArray | null
  while ((segMatch = segRegex.exec(trimmed)) !== null) {
    if (segMatch[1] !== undefined) {
      // name(number) form
      segments.push({ name: segMatch[1], number: parseInt(segMatch[2], 10) })
    } else if (segMatch[3] !== undefined) {
      // standalone number
      segments.push({ name: '', number: parseInt(segMatch[3], 10) })
    }
  }

  if (segments.length === 0) return null

  // If all segments have numeric values, build the OID directly
  const oidParts: number[] = []
  for (const seg of segments) {
    if (seg.number !== null) {
      oidParts.push(seg.number)
    } else {
      return null
    }
  }

  return oidParts.length > 0 ? oidParts : null
}

/**
 * Build parent-child relationships between nodes and resolve OID paths.
 *
 * For each node that has an oidDef like "system 1", we:
 * 1. Parse the parent name and child number
 * 2. Look up the parent in the nodeMap
 * 3. Walk up the parent chain to build the full OID path
 * 4. Set parentId and update parent's children array
 */
function buildRelationships(nodes: MibNode[], nodeMap: Map<string, MibNode>): void {
  // First pass: parse oidDef and set parentId for all nodes
  for (const node of nodes) {
    if (!node.oidDef) continue

    const parsed = parseOidDef(node.oidDef)
    if (!parsed) {
      // Try multi-segment OID definition as fallback
      const multiOid = parseMultiSegmentOidDef(node.oidDef)
      if (multiOid && multiOid.length > 0) {
        node.oid = [...multiOid]
        node.oidString = node.oid.join('.')
        // Try to find parent from the OID prefix
        const parentOid = multiOid.slice(0, -1).join('.')
        const parent = nodes.find(n => n.oidString === parentOid && n.oid.length > 0)
        if (parent) {
          node.parentId = parent.id
          if (!parent.children.includes(node.id)) {
            parent.children = [...parent.children, node.id]
          }
        }
      }
      continue
    }

    const { parentName, childNumber } = parsed
    const parent = nodeMap.get(parentName)

    if (!parent) {
      // Parent not found yet (may be in a not-yet-loaded MIB file) - skip for now
      continue
    }

    // Set the parent relationship
    node.parentId = parent.id

    // Add this node to parent's children if not already present
    if (!parent.children.includes(node.id)) {
      parent.children = [...parent.children, node.id]
    }

    // Resolve OID by walking up the parent chain
    // Only resolve if the parent already has a resolved OID
    if (parent.oid.length > 0) {
      node.oid = [...parent.oid, childNumber]
      node.oidString = node.oid.join('.')
    }
  }

  // Second pass: resolve OIDs for nodes whose parents were resolved in the first pass
  // This handles chains like: mib-2 -> system -> sysDescr where system was parsed from MIB
  let changed = true
  let iterations = 0
  const maxIterations = 20 // Prevent infinite loops

  while (changed && iterations < maxIterations) {
    changed = false
    iterations++

    for (const node of nodes) {
      // Skip nodes that already have a resolved OID
      if (node.oid.length > 0) continue
      if (!node.oidDef) continue

      const parsed = parseOidDef(node.oidDef)
      if (!parsed) continue

      const { parentName, childNumber } = parsed

      // Look up parent - check nodeMap first, then search by name
      let parent = nodeMap.get(parentName)
      if (!parent) {
        // Try to find parent among all nodes (handles duplicates)
        parent = nodes.find(n => n.name === parentName && n.oid.length > 0)
      }

      if (!parent || parent.oid.length === 0) continue

      // Set parent relationship
      if (node.parentId !== parent.id) {
        node.parentId = parent.id
        if (!parent.children.includes(node.id)) {
          parent.children = [...parent.children, node.id]
        }
      }

      // Resolve OID
      node.oid = [...parent.oid, childNumber]
      node.oidString = node.oid.join('.')
      changed = true
    }
  }
}

/**
 * Recursively collect MIB files from a directory and all subdirectories.
 */
function collectMibFiles(dirPath: string, extensions: string[]): string[] {
  const results: string[] = []
  const entries = readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectMibFiles(fullPath, extensions))
    } else if (entry.isFile() && extensions.includes(extname(entry.name).toLowerCase())) {
      results.push(fullPath)
    }
  }

  return results
}

function orderByDependencies(entries: MibModuleIndexEntry[]): MibModuleIndexEntry[] {
  const byName = new Map(entries.map((entry) => [entry.moduleName, entry]))
  const ordered: MibModuleIndexEntry[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (entry: MibModuleIndexEntry): void => {
    if (visited.has(entry.moduleName)) return
    if (visiting.has(entry.moduleName)) {
      // Cycles are legal enough to keep parsing; preserve original cycle order.
      return
    }

    visiting.add(entry.moduleName)
    for (const importedModule of Object.keys(entry.imports)) {
      const dependency = byName.get(importedModule)
      if (dependency) visit(dependency)
    }
    visiting.delete(entry.moduleName)
    visited.add(entry.moduleName)
    ordered.push(entry)
  }

  for (const entry of entries) {
    visit(entry)
  }

  return ordered
}

function extractSyntaxBase(syntax: string): string {
  return (syntax || '').split(/[{(]/)[0].trim()
}

function normalizeMibInlineValue(value: string): string {
  return value
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\{\s*/g, '{ ')
    .replace(/\s*\}/g, ' }')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractEnumValues(syntax: string): MibNamedValue[] {
  if (!syntax.includes('{')) return []
  if (/^\s*BITS\b/i.test(syntax)) return []
  return extractNamedValues(syntax)
}

function extractBits(syntax: string): MibNamedValue[] {
  if (!/^\s*BITS\b/i.test(syntax)) return []
  return extractNamedValues(syntax)
}

function extractNamedValues(syntax: string): MibNamedValue[] {
  const blockMatch = syntax.match(/\{([\s\S]*?)\}/)
  if (!blockMatch) return []

  const values: MibNamedValue[] = []
  const valueRegex = /([A-Za-z][A-Za-z0-9-]*)\s*\(\s*(-?\d+)\s*\)/g
  let match: RegExpExecArray | null
  while ((match = valueRegex.exec(blockMatch[1])) !== null) {
    values.push({
      name: match[1],
      value: Number(match[2])
    })
  }
  return values
}

/**
 * Check whether the OID string `oid` is exactly or is a child of `prefix`.
 * Compares component-by-component to avoid false prefix matches like
 * "1.3.6.1.2.1.10" being treated as a child of "1.3.6.1.2.1.1".
 *
 * Returns:
 *   'exact'  — oid === prefix (component-wise)
 *   'child'  — oid is a descendant of prefix
 *   'none'   — no match
 */
function oidMatchesPrefix(oid: string, prefix: string): 'exact' | 'child' | 'none' {
  if (oid === prefix) return 'exact'

  // prefix must be shorter and oid must start with prefix + "."
  if (oid.length <= prefix.length) return 'none'
  if (oid[prefix.length] !== '.') return 'none'
  if (!oid.startsWith(prefix)) return 'none'

  // We also need to ensure the boundary is at a component boundary, not
  // mid-number. Since prefix is a valid OID string ending with a digit,
  // and we checked oid[prefix.length] === '.', the boundary is clean.
  return 'child'
}

/**
 * Count the number of dot-separated components in an OID string.
 */
function oidComponentCount(oidStr: string): number {
  if (!oidStr) return 0
  return oidStr.split('.').length
}

/**
 * Resolve a numeric OID string to its symbolic name using the MIB node list.
 * Finds the longest matching OID prefix among known MIB nodes, then appends
 * the remaining instance identifier suffix.
 *
 * Uses component count rather than string length to determine the longest
 * match, avoiding false matches like "1.3.6.1.2.1.1" appearing to be a
 * prefix of "1.3.6.1.2.1.10.x".
 *
 * E.g. "1.3.6.1.2.1.1.1.0" -> "sysDescr.0"
 *      "1.3.6.1.2.1.2.2.1.1.1" -> "ifIndex.1"
 */
export function resolveOidToName(oid: string, nodes: MibNode[]): string {
  if (!oid || nodes.length === 0) return oid

  // net-snmp returns OIDs with a leading dot (e.g. ".1.3.6.1.2.1.1.1.0")
  // but MIB node oids are stored without it (e.g. "1.3.6.1.2.1.1").
  const normalized = oid.startsWith('.') ? oid.slice(1) : oid

  let bestMatch: MibNode | null = null
  let bestMatchComponents = 0

  for (const node of nodes) {
    if (!node.oidString || node.oidString.length === 0) continue

    const matchType = oidMatchesPrefix(normalized, node.oidString)
    if (matchType === 'none') continue

    const components = oidComponentCount(node.oidString)
    if (components > bestMatchComponents) {
      bestMatch = node
      bestMatchComponents = components
    }
  }

  if (!bestMatch) return oid

  // If exact match, return just the name
  if (normalized === bestMatch.oidString) {
    return bestMatch.name
  }

  // Otherwise append the instance suffix (skip the dot after bestMatch.oidString)
  const suffix = normalized.substring(bestMatch.oidString.length + 1)
  return `${bestMatch.name}.${suffix}`
}
