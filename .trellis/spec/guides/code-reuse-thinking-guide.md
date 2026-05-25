# Code Reuse Thinking Guide

> **Purpose**: Stop and think before creating new code - does it already exist?

---

## The Problem

**Duplicated code is the #1 source of inconsistency bugs.**

When you copy-paste or rewrite existing logic:
- Bug fixes don't propagate
- Behavior diverges over time
- Codebase becomes harder to understand

---

## Before Writing New Code

### Step 1: Search First

```bash
# Search for similar function names
grep -r "functionName" .

# Search for similar logic
grep -r "keyword" .
```

### Step 2: Ask These Questions

| Question | If Yes... |
|----------|-----------|
| Does a similar function exist? | Use or extend it |
| Is this pattern used elsewhere? | Follow the existing pattern |
| Could this be a shared utility? | Create it in the right place |
| Am I copying code from another file? | **STOP** - extract to shared |

---

## Common Duplication Patterns

### Pattern 1: Copy-Paste Functions

**Bad**: Copying a validation function to another file

**Good**: Extract to shared utilities, import where needed

### Pattern 2: Similar Components

**Bad**: Creating a new component that's 80% similar to existing

**Good**: Extend existing component with props/variants

### Pattern 3: Repeated Constants

**Bad**: Defining the same constant in multiple files

**Good**: Single source of truth, import everywhere

---

## When to Abstract

**Abstract when**:
- Same code appears 3+ times
- Logic is complex enough to have bugs
- Multiple people might need this

**Don't abstract when**:
- Only used once
- Trivial one-liner
- Abstraction would be more complex than duplication

---

## After Batch Modifications

When you've made similar changes to multiple files:

1. **Review**: Did you catch all instances?
2. **Search**: Run grep to find any missed
3. **Consider**: Should this be abstracted?

---

## Gotcha: Asymmetric Mechanisms Producing Same Output

**Problem**: When two different mechanisms must produce the same file set (e.g., recursive directory copy for init vs. manual `files.set()` for update), structural changes (renaming, moving, adding subdirectories) only propagate through the automatic mechanism. The manual one silently drifts.

**Symptom**: Init works perfectly, but update creates files at wrong paths or misses files entirely.

**Prevention checklist**:
- [ ] When migrating directory structures, search for ALL code paths that reference the old structure
- [ ] If one path is auto-derived (glob/copy) and another is manually listed, the manual one needs updating
- [ ] Add a regression test that compares outputs from both mechanisms

---

## Gotcha: Same-Shape Filters Across Surfaces Must Share a Predicate

**Problem**: When the same logical filter ("entry child is a table column", "this varbind belongs to my subtree", "this node is editable") is written inline at multiple call sites, a bug in the predicate has to be fixed at every site, and a future contract change (e.g., a new MIB `kind` value, a new editable access tag) requires editing N places. Inevitably, one is missed and the surfaces drift.

**Symptom**: One surface starts behaving differently from another for the same node — typically discovered when a user reports "feature X shows the right rows but feature Y shows nothing" on the same selection.

**Concrete prior incident**: Table Viewer and right-click GETBULK both filtered `entry.children` by `child.kind === 'column' && !!child.oid`. The MIB parser actually classifies `read-*` columns as `'scalar'` (only `not-accessible` columns get `'column'`), so both surfaces silently dropped every readable data column. Fix consolidated the filter into the shared `isTableColumnChild` predicate in `src/renderer/src/utils/tableSession.ts`; see `.trellis/spec/frontend/mib-tree-snmp-ops.md` Gotcha at the top.

**Prevention checklist**:
- [ ] Before writing a `kind === '<x>'` / `access === '<x>'` filter inline, grep for the same shape in other files
- [ ] If you find 2+ sites filtering the same way, extract a named predicate once and import it
- [ ] When you add a new `kind` / `access` value or change semantics, search for every call site of that predicate (one place) rather than every inline filter (N places)

---

## Checklist Before Commit

- [ ] Searched for existing similar code
- [ ] No copy-pasted logic that should be shared
- [ ] Constants defined in one place
- [ ] Similar patterns follow same structure
