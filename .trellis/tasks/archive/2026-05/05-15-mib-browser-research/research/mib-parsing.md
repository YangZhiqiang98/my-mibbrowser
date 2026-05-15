# Research: MIB File Parsing Approaches

- **Query**: Research MIB file parsing approaches for building an MIB Browser desktop application
- **Scope**: Internal (project context) + External (MIB standards, parsing libraries)
- **Date**: 2026-05-15

---

## 1. MIB File Format

### SMIv1 vs SMIv2

| Aspect | SMIv1 (RFC 1155) | SMIv2 (RFC 2578) |
|--------|------------------|------------------|
| Status | Obsolete | Current standard |
| Module Structure | `DEFINITIONS ::= BEGIN ... END` | Same, with enhanced syntax |
| Object Types | `OBJECT-TYPE` with `SYNTAX`, `ACCESS`, `STATUS`, `DESCRIPTION` | `OBJECT-TYPE` with `SYNTAX`, `MAX-ACCESS`, `STATUS`, `DESCRIPTION`, `AUGMENTS` |
| Trap Definitions | `TRAP-TYPE` | `NOTIFICATION-TYPE` |
| Module Identity | Not required | `MODULE-IDENTITY` required |
| Textual Conventions | Limited | Full `TEXTUAL-CONVENTION` support |
| Object Groups | Not supported | `OBJECT-GROUP`, `NOTIFICATION-GROUP` |
| Compliance | Not supported | `MODULE-COMPLIANCE`, `AGENT-CAPABILITIES` |
| Integer Types | `INTEGER` | `Integer32`, `Unsigned32`, `Counter32`, `Counter64`, `Gauge32`, `TimeTicks` |

### .my File Structure

A typical MIB module file (.my) follows this structure:

```smi
-- Comments start with --
MODULE-IDENTITY
    LAST-UPDATED "202401010000Z"
    ORGANIZATION "Organization name"
    CONTACT-INFO "Contact information"
    DESCRIPTION "Module description"
    ::= { iso org(3) dod(6) internet(1) private(4) enterprises(1) vendor 1 }

-- Imports from other modules
IMPORTS
    MODULE-IDENTITY, OBJECT-TYPE, Integer32, Counter32
        FROM SNMPv2-SMI
    DisplayString
        FROM SNMPv2-TC
    enterprises
        FROM SNMPv2-SMI;

-- Object Type Definitions
sysDescr OBJECT-TYPE
    SYNTAX      DisplayString (SIZE (0..255))
    MAX-ACCESS  read-only
    STATUS      current
    DESCRIPTION "A textual description of the entity."
    ::= { system 1 }

-- Table Definitions
ifTable OBJECT-TYPE
    SYNTAX      SEQUENCE OF IfEntry
    MAX-ACCESS  not-accessible
    STATUS      current
    DESCRIPTION "A list of interface entries."
    ::= { interfaces 2 }

ifEntry OBJECT-TYPE
    SYNTAX      IfEntry
    MAX-ACCESS  not-accessible
    STATUS      current
    DESCRIPTION "An entry containing management information for a particular interface."
    INDEX       { ifIndex }
    ::= { ifTable 1 }

-- Notification Definitions (SMIv2)
linkUp NOTIFICATION-TYPE
    OBJECTS     { ifIndex, ifAdminStatus, ifOperStatus }
    STATUS      current
    DESCRIPTION "A linkUp notification signifies..."
    ::= { snmpTraps 4 }
```

### Common MIB Module Dependencies

Standard MIB modules that are frequently imported:

| Module | Purpose |
|--------|---------|
| `SNMPv2-SMI` | Core SMIv2 definitions (MODULE-IDENTITY, OBJECT-TYPE, etc.) |
| `SNMPv2-TC` | Textual Conventions (DisplayString, TruthValue, MacAddress, etc.) |
| `SNMPv2-MIB` | System group, SNMP group, snmpTraps |
| `SNMPv2-CONF` | Compliance definitions (MODULE-COMPLIANCE, OBJECT-GROUP) |
| `IF-MIB` | Interface MIB (ifTable, ifEntry) |
| `RFC1213-MIB` | MIB-II (older, but widely used) |
| `INET-ADDRESS-MIB` | Network address types |
| `IANAifType-MIB` | Interface type enumerations |

---

## 2. Existing Parsing Libraries

### Python: pysnmp / pysmi / libsmi

**pysnmp** (http://pysnmp.sourceforge.net/)
- Pure Python SNMP library
- Includes MIB parsing via `pysnmp.smi` module
- Can load .my files and build OID trees
- Dependencies: pysmi (Python SMI compiler)
- Maturity: High (widely used in production)
- License: BSD

**pysmi** (https://github.com/etingof/pysmi)
- Pure Python SMI/MIB parser and compiler
- Converts SMIv1/v2 to JSON, MIB, or Python formats
- Standalone MIB parsing without full SNMP stack
- Maturity: High
- License: BSD

**libsmi / smidump**
- C library with Python bindings
- Parses SMIv1/v2 and exports to various formats (JSON, XML, etc.)
- Maturity: High (reference implementation)
- License: MIT/FreeBSD

### JavaScript/TypeScript

**mib-parser** (npm: `mib-parser`)
- Pure JavaScript MIB parser
- Parses SMIv2 .my files
- Returns structured JSON representation
- Maturity: Medium (community maintained)
- Limitations: May not handle all SMIv1 syntax

**smi-parser** (npm: `smi-parser`)
- SMI/MIB parser for Node.js
- Supports SMIv1 and SMIv2
- Returns AST-like structure
- Maturity: Medium

**net-snmp** (npm: `net-snmp`)
- JavaScript SNMP library
- Includes MIB loading from .my files
- Uses C-based parser internally
- Maturity: Medium-High

**browser-mib-parser**
- Browser-compatible MIB parser
- Limited but works in frontend
- Maturity: Low

### Rust

**mib-parser** (crates.io: `mib-parser`)
- Rust MIB parser library
- Parses SMIv1/v2 syntax
- Maturity: Low-Medium (community maintained)
- Performance: Fast (Rust)

**smi** (crates.io: `smi`)
- SMI parser for Rust
- Maturity: Low

### C: net-snmp

**net-snmp** (http://www.net-snmp.org/)
- Reference implementation for SNMP
- Includes `mib2c`, `smidump`, `snmptranslate` tools
- MIB parsing via `parse.c` / `mib.c`
- Handles SMIv1 and SMIv2
- Maturity: Very High (industry standard)
- License: BSD-like
- Limitations: Complex C codebase, hard to embed

### Other Notable Tools

| Tool | Language | Purpose |
|------|----------|---------|
| `smilint` | C | SMI syntax validator |
| `smidump` | C | SMI to JSON/XML/etc converter |
| `mibdump.py` | Python | Python MIB compiler |
| `mib2c` | C | Generate C code from MIB |
| `MIB Smithy` | Commercial | Professional MIB editor |

---

## 3. Parsing Challenges

### Module Dependencies and Imports

**Challenge**: MIB modules import definitions from other modules. A parser must resolve these imports before processing.

```smi
IMPORTS
    DisplayString, TruthValue
        FROM SNMPv2-TC
    Counter32, Gauge32
        FROM SNMPv2-SMI;
```

**Solutions**:
1. **MIB search path**: Maintain a directory of standard MIB files
2. **Import resolution**: Parse all imports first, build dependency graph
3. **Circular dependency detection**: Some MIBs may have circular imports
4. **Missing imports**: Handle gracefully with fallback definitions

### Macro Definitions

**Challenge**: SMI macros (MODULE-IDENTITY, OBJECT-TYPE, etc.) are complex to parse.

```smi
MODULE-IDENTITY MACRO ::=
BEGIN
    TYPE NOTATION ::=
                  "LAST-UPDATED" value(Update UTCTime)
                  "ORGANIZATION" value(Org Text)
                  ...
    VALUE NOTATION ::=
                  value(VALUE ObjectID)
END
```

**Solutions**:
1. **Pre-processor**: Expand macros before parsing
2. **Built-in knowledge**: Hard-code standard macro definitions
3. **Reference implementation**: Use net-snmp or pysmi as reference

### Textual Conventions

**Challenge**: Textual Conventions define custom types with constraints.

```smi
DisplayString ::= TEXTUAL-CONVENTION
    DISPLAY-HINT "255a"
    STATUS       current
    DESCRIPTION  "Represents textual information..."
    SYNTAX       OCTET STRING (SIZE (0..255))
```

**Solutions**:
1. **Type registry**: Maintain a registry of known textual conventions
2. **Constraint validation**: Parse and enforce constraints (SIZE, RANGE)
3. **Display hints**: Parse DISPLAY-HINT for formatting

### Object Type Definitions

**Challenge**: OBJECT-TYPE has complex syntax with various fields.

```smi
sysDescr OBJECT-TYPE
    SYNTAX      DisplayString (SIZE (0..255))
    MAX-ACCESS  read-only
    STATUS      current
    DESCRIPTION "A textual description of the entity."
    ::= { system 1 }
```

**Key parsing points**:
- SYNTAX: May reference textual conventions or inline definitions
- MAX-ACCESS: read-only, read-write, read-create, not-accessible, accessible-for-notify
- STATUS: current, deprecated, obsolete
- DESCRIPTION: Quoted string (may span multiple lines)
- INDEX/AUGMENTS: For table entries
- DEFVAL: Default values

### Table Definitions

**Challenge**: SNMP tables have complex structure with INDEX or AUGMENTS clauses.

```smi
ifEntry OBJECT-TYPE
    SYNTAX      IfEntry
    MAX-ACCESS  not-accessible
    STATUS      current
    DESCRIPTION "An entry containing management information..."
    INDEX       { ifIndex }
    ::= { ifTable 1 }
```

**Solutions**:
1. **SEQUENCE OF parsing**: Parse SEQUENCE OF to identify table structure
2. **INDEX clause parsing**: Handle single/multi-column indexes
3. **AUGMENTS clause**: Link augmented tables to base tables
4. **IMPLIED keyword**: Handle implied indexes for variable-length keys

### OID Value Parsing

**Challenge**: OID values use a compact syntax that must be expanded.

```smi
::= { system 1 }
::= { iso org(3) dod(6) internet(1) }
```

**Solutions**:
1. **Name resolution**: Map symbolic names to numeric OIDs
2. **Parent reference**: Resolve relative OIDs (e.g., `{ system 1 }`)
3. **Full OID expansion**: Build complete OID path from root

---

## 4. MIB Tree Building

### OID Tree Structure

The MIB tree is a hierarchical structure rooted at the ISO root:

```
iso (1)
├── org (3)
│   └── dod (6)
│       └── internet (1)
│           ├── mgmt (2)
│           │   └── mib-2 (1)
│           │       ├── system (1)
│           │       │   ├── sysDescr (1)
│           │       │   ├── sysObjectID (2)
│           │       │   └── ...
│           │       ├── interfaces (2)
│           │       │   └── ifTable (2)
│           │       │       └── ifEntry (1)
│           │       │           ├── ifIndex (1)
│           │       │           ├── ifDescr (2)
│           │       │           └── ...
│           │       └── ...
│           ├── private (4)
│           │   └── enterprises (1)
│           │       └── vendor-specific...
│           └── experimental (3)
```

### Node Attributes

Each MIB tree node has these attributes:

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | string | Symbolic name (e.g., "sysDescr") |
| `oid` | number[] | Full OID path (e.g., [1, 3, 6, 1, 2, 1, 1, 1]) |
| `oidString` | string | Dotted OID (e.g., "1.3.6.1.2.1.1.1") |
| `type` | string | Syntax type (e.g., "DisplayString", "Integer32") |
| `access` | enum | MAX-ACCESS value |
| `status` | enum | current, deprecated, obsolete |
| `description` | string | Human-readable description |
| `parent` | reference | Parent node reference |
| `children` | reference[] | Child node references |
| `module` | string | Source MIB module name |

### Index Relationships

For table entries, additional attributes are needed:

| Attribute | Type | Description |
|-----------|------|-------------|
| `isTable` | boolean | Whether this is a table node |
| `isEntry` | boolean | Whether this is a table entry |
| `isColumn` | boolean | Whether this is a table column |
| `indexColumns` | reference[] | INDEX clause columns |
| `augments` | reference | AUGMENTS target table |

### Tree Building Algorithm

1. **Parse all MIB files**: Collect all object definitions
2. **Resolve imports**: Link imported definitions
3. **Build OID paths**: Expand relative OIDs to full paths
4. **Construct tree**: Insert nodes into tree structure
5. **Resolve table structures**: Link table entries and columns
6. **Validate consistency**: Check for duplicate OIDs, missing parents

---

## 5. Recommendations for MIB Browser

### Parsing Approach

**Option A: Use pysmi (Recommended)**
- Pros: Mature, handles SMIv1/v2, JSON output, Python-based
- Cons: Requires Python backend or Python-to-JS bridge
- Implementation: Use pysmi to parse .my files, output JSON, load in frontend

**Option B: Use JavaScript mib-parser**
- Pros: Direct frontend integration, no backend dependency
- Cons: Less mature, may not handle all MIB files
- Implementation: Load .my files directly in browser

**Option C: Custom parser**
- Pros: Full control, can optimize for specific needs
- Cons: Significant development effort, must handle all edge cases
- Implementation: Build parser using PEG.js or similar

### Recommended Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend       │     │   MIB Files     │
│   (MIB Tree)    │◄────│   (API)         │◄────│   (.my files)   │
│                 │     │                 │     │                 │
│   - Tree view   │     │   - pysmi       │     │   - Standard    │
│   - Search      │     │   - OID cache   │     │   - Custom      │
│   - Details     │     │   - Validation  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### MIB Search Path Strategy

1. **Built-in standard MIBs**: Ship with SNMPv2-SMI, SNMPv2-TC, SNMPv2-MIB, IF-MIB, etc.
2. **User MIB directory**: Allow users to specify additional MIB directories
3. **Automatic download**: Optionally fetch missing MIBs from standard repositories

---

## 6. References

### RFCs

- RFC 1155: Structure and Identification of Management Information (SMIv1)
- RFC 1212: Concise MIB Definitions
- RFC 1215: Convention for Defining Traps
- RFC 2578: Structure of Management Information Version 2 (SMIv2)
- RFC 2579: Textual Conventions for SMIv2
- RFC 2580: Conformance Statements for SMIv2

### Libraries

- pysmi: https://github.com/etingof/pysmi
- pysnmp: http://pysnmp.sourceforge.net/
- net-snmp: http://www.net-snmp.org/
- mib-parser (npm): https://www.npmjs.com/package/mib-parser
- smi-parser (npm): https://www.npmjs.com/package/smi-parser

### Tools

- smilint: Part of libsmi package
- smidump: Part of libsmi package
- mib2c: Part of net-snmp package
