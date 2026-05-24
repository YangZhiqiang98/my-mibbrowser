# Add MIB compiler and dependency-aware MIB loading

## Goal

Upgrade the current MIB loading path from a lightweight regex parser into a dependency-aware MIB compilation pipeline that can reliably load real vendor MIB directories, report missing dependencies clearly, and preserve the MIB metadata needed by later table workflows.

This task follows the confirmed conservative MVP strategy from `goal.md`: improve reliability and metadata coverage incrementally, avoid a large parser rewrite unless the current architecture proves insufficient, and leave full commercial compiler/editor diagnostics out of scope.

## What I Already Know

- Current MIB parsing is implemented in `src/main/mib/parser.ts`.
- Current MIB state, caching, and IPC loading flow are implemented in `src/main/ipc/handlers.ts`.
- Current MIB model is defined in `src/main/mib/types.ts`.
- Renderer tree and result grouping depend on stable node identity, OID resolution, table/entry/column kinds, and `INDEX` metadata.
- Future Table Viewer work needs reliable table structure, instance/index metadata, enum metadata, and textual convention metadata.

## Requirements

- Directory-level MIB loading must scan module names, source files, `IMPORTS`, and dependency relationships before final parsing.
- MIB modules should be parsed in dependency-aware order where possible.
- Missing dependencies must be reported with actionable details:
  - source module
  - missing imported module
  - missing symbols when known
  - source file if known
- The parser/model must preserve table / entry / column / `INDEX` information.
- The parser/model must preserve basic metadata for:
  - enum values
  - `BITS`
  - `TEXTUAL-CONVENTION`
  - `DISPLAY-HINT`
- Existing MIB tree rendering, OID resolution, result column building, and current SNMP flows must remain compatible.
- Cache format changes must use a version bump and invalidate old cache data safely.
- UI-visible parse errors/warnings should be clearer than silent failure or a malformed tree.

## Acceptance Criteria

- [ ] Loading a MIB directory builds an import/dependency index before parsing modules.
- [ ] Modules are parsed in dependency-aware order when dependencies are present in the selected directory.
- [ ] Missing dependency warnings/errors include the importing module, missing module, and imported symbols.
- [ ] Table, entry, column, and `INDEX` metadata still resolve correctly after the parser changes.
- [ ] Enum, `BITS`, `TEXTUAL-CONVENTION`, and `DISPLAY-HINT` metadata are available in the parsed model.
- [ ] Existing MIB tree search, node selection, OID-to-name resolution, and result table grouping do not regress.
- [ ] Cache versioning handles the updated metadata shape without loading incompatible stale cache.
- [ ] Unit tests cover dependency indexing, missing dependency reporting, table/index parsing, and at least one enum/textual convention case.

## Definition Of Done

- Tests added or updated for parser and dependency-resolution behavior.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- Trellis quality check is run after implementation.
- Work is committed before `trellis-finish-work`.
- `trellis-finish-work` is run after the work commit.
- Commits are pushed to GitHub, using temporary `127.0.0.1:7897` Git proxy only if network push fails.

## Technical Approach

Use an incremental compiler pipeline around the existing parser:

1. Add a module pre-scan/indexing layer that extracts each file's module name and `IMPORTS`.
2. Build a dependency graph from module imports and source files.
3. Sort modules so local dependencies are parsed before importers where possible.
4. Emit structured dependency warnings for missing modules or unresolved imported symbols.
5. Extend `MibNode` / `MibModule` metadata to carry enums, bits, textual conventions, display hints, and source/dependency diagnostics.
6. Keep existing `MibParser.parseFiles`, `parseDirectory`, and `parseFileContents` API behavior compatible for callers.
7. Bump the MIB cache version in `handlers.ts` if serialized metadata shape changes.

## Decision (ADR-lite)

**Context**: A full commercial-grade MIB compiler is large and risky. The current project already has working tree, SNMP, and result flows that should not be disrupted.

**Decision**: Implement a conservative dependency-aware compiler pipeline around the current parser and data model. Add metadata support needed by table workflows, but defer complete SMI diagnostics and MIB editor functionality.

**Consequences**:

- Lower implementation risk and better compatibility with existing flows.
- Real-world MIB loading becomes more reliable without committing to a full parser rewrite.
- Some malformed MIBs may still require future compiler work.
- Future parser replacement remains possible behind the same parser/compiler boundary.

## Out Of Scope

- Full commercial-grade SMI error recovery.
- MIB editor or inline auto-fix tooling.
- Full `OBJECT-GROUP` / `MODULE-COMPLIANCE` semantic validation.
- Automatic download of missing dependencies.
- Graphical dependency visualization.
- Trap/Inform console, Agent Simulator, realtime graphs, or global UI redesign.

## Technical Notes

- Preserve existing architecture: Electron main process handles parsing and cache, renderer consumes the MIB tree through IPC.
- Prefer small focused tests before changing parser behavior.
- If a dedicated SMI/MIB parsing library is considered, evaluate maintenance state, license, TypeScript/Node compatibility, Electron main process compatibility, and metadata access before adopting it.
