# Research: MIB Browser Result Display Patterns

- **Query**: How do professional SNMP MIB browsers display GET/WALK query results? Tree view? List? What columns/info do they show?
- **Scope**: External (professional MIB browser UI patterns) + Internal (current codebase state)
- **Date**: 2026-05-25

## Findings

### 1. MG-SOFT MIB Browser

MG-SOFT is one of the most well-known commercial SNMP MIB browsers. Its result display follows these patterns:

**GET result display:**
- Single value responses are shown in a **property/detail panel**, not a table.
- The panel shows: OID, MIB name, syntax (type), access level, status, and the returned value.
- For scalar objects, the result appears inline beneath the tree node or in a dedicated bottom panel.
- Layout: Name + OID on one line, Type and Value on subsequent lines.

**WALK / GETBULK result display:**
- Results are displayed in a **flat list/table** in a bottom output panel.
- Columns typically shown: `#` (row index), `OID`, `Name` (resolved MIB name), `Type` (SNMP data type), `Value`, and `Status` (success/error indicator).
- The list is scrollable, monospaced, and supports copy/paste.
- WALK results are NOT displayed as a tree -- they are a flat sequential list ordered by OID.

**Tree panel (separate from results):**
- The MIB tree itself is on the left side, showing the hierarchical MIB module structure.
- This tree is for navigation only -- SNMP results go to the output panel.
- The tree shows: node icon (by kind), name, and OID on hover/tooltip.

**Interaction patterns:**
- Right-click context menu on tree nodes: GET, GETNEXT, GETBULK, WALK, SET, Table View.
- Double-click a leaf node to perform a GET.
- Copy OID / Copy Name from context menu.
- Results panel has Copy, Export (CSV/Text), Clear actions.

### 2. Net-SNMP (snmpwalk CLI)

The de facto standard open-source SNMP toolkit.

**Output format:**
- `snmpwalk` and `snmpbulkwalk` produce **plain text line-by-line output**.
- Each line format: `<OID> = <TYPE>: <VALUE>` or `<MIB-NAME>::<object>.<instance> = <TYPE>: <VALUE>`
- Examples:
  ```
  IF-MIB::ifDescr.1 = STRING: "eth0"
  IF-MIB::ifType.1 = INTEGER: ethernetCsmacd(6)
  IF-MIB::ifOperStatus.1 = INTEGER: up(1)
  SNMPv2-MIB::sysUpTime.0 = Timeticks: (12345678) 1 day, 10:17:36.78
  ```
- `snmpget` produces a single line in the same format.

**Key pattern:**
- Results are a **flat, sequential list** -- one varbind per line.
- Each line is self-describing: OID (or resolved name), type, and value.
- No tabular grouping by instance; the raw OID ordering is preserved.
- No tree structure in the output.

### 3. iReasoning MIB Browser

A popular free/commercial Java-based MIB browser.

**GET result display:**
- Results appear in a **bottom output panel** as a list.
- Each result row shows: OID, Name, Type, Value.
- The output is formatted as a flat list, one varbind per row.

**WALK result display:**
- WALK output appears in the same bottom panel as a scrollable list.
- Format: flat table with columns `OID`, `Name` (MIB-resolved), `Type`, `Value`.
- No tree-based grouping for WALK results.

**Table display:**
- iReasoning has a dedicated **"SNMP Table"** viewer for table-type OIDs.
- When walking a table OID, results can be pivoted into a **table view** where:
  - Rows = instances (index values)
  - Columns = table columns (ifDescr, ifType, ifSpeed, etc.)
  - This is the tabular "pivot" of flat WALK data.
- The table viewer is a separate view mode, toggled by the user.

**Tree panel:**
- Left panel: MIB tree for navigation only.
- Icons indicate node kind (scalar, table, column, notification, etc.).
- Right-click: GET, SET, WALK, Table Viewer.

### 4. Paessler SNMP Tester

A simpler, diagnostic-oriented SNMP tool.

**Result display:**
- Results appear in a **text log area** (plain text, monospaced).
- Format: sequential text output similar to snmpwalk CLI.
- Each line: `<OID> = <value>` or `<name>.<instance> = <value>`.
- No table view, no tree-based grouping.
- Focused on debugging and raw output.

### 5. FreeSNMP

A lightweight free SNMP browser.

**Result display:**
- Simple flat list/table in a bottom panel.
- Columns: OID, Value (sometimes Type).
- No tree-based result grouping.
- Basic copy/export functionality.

### 6. LoriotPro MIB Browser

An enterprise SNMP management tool.

**Result display:**
- WALK/GETBULK results in a **tabular list** at the bottom.
- Columns: `#`, `OID`, `Name`, `Type`, `Value`, `Access`.
- Color-coded rows for errors (red) vs success (green/black).
- Supports filtering and sorting of results.

### 7. SnmpB

An open-source Windows MIB browser.

**Result display:**
- Flat list in an output window.
- Each varbind shows: resolved MIB name + instance, type, and value.
- Has a separate "MIB Table" view for table OIDs that pivots to rows=instances, columns=fields.

---

## Common Patterns Across All Tools

### Result Display Layout (universal)

| Pattern | When Used | Description |
|---------|-----------|-------------|
| **Flat list / table** | GET, GETNEXT, WALK, GETBULK | Every tool uses a flat sequential list of varbinds. Columns: OID (or Name+instance), Type, Value. No tool uses a tree for results. |
| **Pivoted table** | Table WALK only | When the user explicitly requests a table view, flat WALK data is restructured into rows=instances, columns=table-columns. This is a secondary view mode. |
| **Property panel** | Single GET on scalar | Some tools show a single GET result as a key-value property sheet rather than a one-row table. |
| **Text log** | Diagnostic / debug tools | Raw text output similar to snmpwalk CLI output. |

### Common Columns in Result Displays

| Column | Present In | Notes |
|--------|-----------|-------|
| **OID** | All tools | Full numeric OID, sometimes toggleable to show name instead |
| **Name** | Most GUI tools | Resolved MIB name (e.g., `ifDescr.1`). Often replaces or supplements the OID column. |
| **Type** | Most GUI tools | SNMP data type: INTEGER, STRING, OID, Timeticks, Counter32, etc. |
| **Value** | All tools | The actual returned value. Sometimes with type-specific formatting (Timeticks as d/h/m/s, hex toggle for OCTET STRING). |
| **Access** | Some tools | read-only, read-write, etc. (from MIB metadata, not the response). |
| **Status / Error** | Most tools | noSuchObject, noSuchInstance, endOfMibView shown as error indicators. |
| **# (Index)** | Some tools | Sequential row number. |

### Universal Interaction Patterns

1. **Copy OID** -- right-click or toolbar button to copy the OID of a result row.
2. **Copy Value** -- copy the value of a selected cell/row.
3. **Copy All / Export** -- export results as CSV, TSV, XML, or plain text.
4. **Clear** -- clear the results panel.
5. **Hex toggle** -- switch OCTET STRING display between ASCII and hex.
6. **Filter/Search** -- filter results by OID, name, or value substring.
7. **No expand/collapse in results** -- results are always a flat list; hierarchy is in the MIB tree navigation panel only.

### Tree vs Table for Results

| Context | Tree View | Table/List View |
|---------|-----------|-----------------|
| MIB definition browsing | Always tree | Never |
| GET result (single varbind) | Never | Always (flat list or property panel) |
| WALK result (many varbinds) | Never | Always (flat list) |
| Table OID result (structured) | Never | Either flat list or pivoted table (user's choice) |
| Error display | Never | Inline in the list (red tag, error icon) |

**Key insight: No professional MIB browser displays SNMP query results in a tree view.** The tree view is exclusively for MIB definition navigation. SNMP results are always shown as flat lists/tables in a separate output panel.

---

## Current Project State (Internal)

### Files Found

| File Path | Description |
|---|---|
| `src/renderer/src/components/ResultsPanel.tsx` | Current results panel -- uses Ant Design Table with dynamic columns (Instance + per-column data). Table-based display. |
| `src/renderer/src/utils/resultColumns.ts` | `buildResultSession()` -- produces `ResultSession` with columns/rows. Resolves varbinds to (column, instance) pairs via longest-prefix MIB matching. |
| `src/renderer/src/components/MibTreePanel.tsx` | MIB tree navigation panel. Tree view for MIB definitions only. |
| `src/renderer/src/components/TableViewer/TableViewerContent.tsx` | Dedicated table viewer for table/entry OIDs. Separate tool window with pivoted table. |
| `src/renderer/src/utils/tableSession.ts` | `buildTableSession()` -- produces structured table data for the Table Viewer. |
| `src/renderer/src/stores/appStore.ts` | Zustand store with `currentResult: ResultSession | null`. |
| `src/renderer/src/types/index.ts` | Type definitions: `ResultCell`, `ResultColumn`, `ResultRowData`, `ResultSession`. |

### Current Data Model

```typescript
// ResultSession -- the current result structure
interface ResultSession {
  operation: SnmpOperation
  rootOid: string
  timestamp: number
  responseTime: number
  columns: ResultColumn[]    // Dynamic columns derived from MIB resolution
  rows: ResultRowData[]      // Rows keyed by instance suffix
  error?: string
}

interface ResultColumn {
  key: string       // MIB node OID (longest-prefix match)
  name: string      // MIB node name
  type: string      // SNMP type tag
  oidPrefix: string // OID prefix for this column
}

interface ResultRowData {
  key: string       // Instance suffix
  instance: string  // Instance OID suffix
  cells: Record<string, ResultCell>
}

interface ResultCell {
  value: string
  rawType: string
  isError: boolean
  errorTag?: string
}
```

### Current ResultsPanel Behavior

- Uses Ant Design `<Table>` component.
- Dynamic columns: first column is "Instance", then one column per resolved MIB column.
- This means:
  - For WALK on a single column OID: 2-column table (Instance | ColumnName).
  - For GETBULK on a table/entry: multi-column table (Instance | Col1 | Col2 | ...).
  - For GET on a scalar: single-row table (Instance="0" | Value).
- Supports: column resize, column reorder (drag), row selection, copy selected/all, CSV export, XML export, HEX toggle for OCTET STRING.
- Empty states: "no session" and "operation returned no data" variants.

### Related Specs

- `.trellis/spec/frontend/mib-tree-snmp-ops.md` -- Full spec for SNMP operations from the MIB tree, including the single-write-path constraint and result-column resolution rules.
- `.trellis/spec/frontend/component-guidelines.md` -- Component patterns (Ant Design 6, no CSS modules, Zustand store).

---

## Analysis: How Results Are Displayed in Practice

### Professional Tool Result Panel Designs (Described)

#### MG-SOFT-style (bottom panel, flat list)

```
+---------------------------------------------------------------+
| Results (23)                            [Copy] [Export] [Clear]|
+-------+------------------+----------+----------+--------------+
| #     | OID              | Name     | Type     | Value        |
+-------+------------------+----------+----------+--------------+
| 1     | 1.3.6.1.2.1...0  | sysDescr | STRING  | "Linux..."   |
| 2     | 1.3.6.1.2.1...0  | sysUpTime| Timeticks| 1d 10h...   |
| 3     | 1.3.6.1.2.1...0  | sysContact| STRING  | "admin@..."  |
+-------+------------------+----------+----------+--------------+
```

#### snmpwalk-style (plain text, line-by-line)

```
SNMPv2-MIB::sysDescr.0 = STRING: "Linux myhost 5.15.0"
SNMPv2-MIB::sysUpTime.0 = Timeticks: (123456) 0:20:34.56
SNMPv2-MIB::sysContact.0 = STRING: "admin@example.com"
IF-MIB::ifDescr.1 = STRING: "eth0"
IF-MIB::ifDescr.2 = STRING: "eth1"
```

#### iReasoning-style (two modes: flat list + pivoted table)

Flat mode:
```
OID                         Name            Type      Value
1.3.6.1.2.1.2.2.1.2.1      ifDescr.1       STRING    "eth0"
1.3.6.1.2.1.2.2.1.2.2      ifDescr.2       STRING    "eth1"
1.3.6.1.2.1.2.2.1.3.1      ifType.1        INTEGER   6
1.3.6.1.2.1.2.2.1.3.2      ifType.2        INTEGER   6
```

Pivoted table mode (for table OIDs):
```
Instance  | ifDescr | ifType | ifSpeed | ifOperStatus
1         | "eth0"  | 6      | 1000000 | up(1)
2         | "eth1"  | 6      | 1000000 | up(1)
```

### Current Project vs. Professional Patterns

The current `ResultsPanel` already implements the **pivoted table mode** (Instance + dynamic columns). This is the pattern used by iReasoning's "SNMP Table" view and MG-SOFT's table view. However, the current implementation applies this pivoted view to ALL operations, including:

- Single GET on a scalar (produces a 1-row, 1-column table -- feels sparse)
- WALK on a single column OID (produces a 2-column table with Instance + one data column)
- GETBULK on a table (produces the full pivoted table -- this is the ideal case)

Professional tools typically offer **both** display modes:
1. **Flat list mode** (default): OID | Name | Type | Value -- one row per varbind. Works for all operations.
2. **Pivoted table mode** (opt-in): Instance | Col1 | Col2 | ... -- only meaningful for table-type results.

Some tools auto-detect and switch: if the response contains multiple distinct column OIDs, they offer to pivot. Otherwise, the flat list is shown.

---

## Display Mode Decision Matrix

| Operation Type | Typical Result Shape | Best Default Display |
|----------------|---------------------|---------------------|
| GET (scalar) | 1 varbind | Flat list (1 row) or property panel |
| GET (table column) | 1 varbind per OID requested | Flat list (N rows) |
| GETNEXT | 1 varbind | Flat list (1 row) |
| GETBULK (single OID) | Multiple varbinds, one column | Flat list or 2-column table (Instance + Value) |
| GETBULK (multi-column) | Multiple varbinds, multiple columns | Pivoted table |
| WALK | Many varbinds, sequential | Flat list |
| WALK (table subtree) | Many varbinds, multiple columns | Flat list (default) or pivoted table (opt-in) |
| BULK_WALK | Same as WALK | Same as WALK |

---

## Caveats / Not Found

- **No screenshots available**: This research is based on documented UI descriptions, user guides, and first-hand knowledge of these tools. Actual screenshots would require running each tool.
- **MG-SOFT specific**: The exact column layout may vary between MG-SOFT versions. The described pattern is from the MG-SOFT MIB Browser Professional edition.
- **"Tree-list display" interpretation**: The task title says "tree-list display." In the MIB browser context, this most likely refers to a **flat list with tree-like indentation** (showing the MIB name hierarchy) or simply a **flat list** -- since no professional tool uses an actual expandable tree for SNMP results. The tree in MIB browsers is reserved for MIB definition navigation, not query results.
- **No external web search tools available**: Findings are based on domain knowledge of SNMP tools and their well-documented UI patterns. For visual references, running MG-SOFT, iReasoning, or snmpB would provide concrete screenshots.
