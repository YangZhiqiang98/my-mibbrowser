// Trace: Full renderer simulation. Trace what the tree looks like.
const fs = require('fs')

const BERT = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'
const BASE = 'E:/RC/MIB/SLT8400/09_ros6.x/private/RAISECOM-BASE-MIB.my'

function stripImportsSection(c) { return c.replace(/IMPORTS\s*[\s\S]*?;/gi, '') }
let counter = 0
function resetCounter() { counter = 0 }
function parseModule(content, fileName) {
  const m = content.match(/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
  const moduleName = m ? m[1] : fileName
  const mod = { name: moduleName, nodes: [] }
  const stripped = stripImportsSection(content)
  let r
  for (const [kind, regex] of [
    ['OBJECT-TYPE', /(\S+)\s+OBJECT-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g],
    ['OBJECT-IDENTITY', /(\S+)\s+(?:OBJECT-IDENTITY|MODULE-IDENTITY)\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g],
    ['NOTIFICATION-TYPE', /(\S+)\s+NOTIFICATION-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g],
  ]) {
    while ((r = regex.exec(stripped)) !== null) {
      mod.nodes.push({ id: `node-${++counter}`, name: r[1], kind, oidDef: r[3].trim(), parentId: null, children: [], oid: [], oidString: '' })
    }
  }
  const oid = /(\S+)\s+OBJECT\s+IDENTIFIER\s*::=\s*\{([^}]+)\}/g
  while ((r = oid.exec(stripped)) !== null) {
    mod.nodes.push({ id: `node-${++counter}`, name: r[1], kind: 'OBJECT IDENTIFIER', oidDef: r[2].trim(), parentId: null, children: [], oid: [], oidString: '' })
  }
  return mod
}
function parseOidDef(oidDef) {
  const t = oidDef.trim().replace(/^\{\s*/, '').replace(/\s*\}$/, '')
  if (!t) return null
  const m = t.match(/^(\S+)\s+(\d+)$/)
  if (m) return { parentName: m[1], childNumber: parseInt(m[2], 10) }
  return null
}
function parseMultiSegmentOidDef(oidDef) {
  const t = oidDef.trim(); if (!t) return null
  const segs = []
  const sr = /(\S+?)\((\d+)\)|(\d+)/g; let s
  while ((s = sr.exec(t)) !== null) {
    if (s[1] !== undefined) segs.push({ name: s[1], number: parseInt(s[2], 10) })
    else if (s[3] !== undefined) segs.push({ name: '', number: parseInt(s[3], 10) })
  }
  if (segs.length === 0) return null
  const p = []
  for (const s of segs) { if (s.number !== null) p.push(s.number); else return null }
  return p.length > 0 ? p : null
}
function createStandardRootNodes() {
  let i = 10000
  const c = (n, o, d) => ({ id: `root-${i++}`, name: n, oid: o, oidString: o.join('.'), kind: 'root', parentId: null, children: [], oidDef: d })
  return [
    c('iso', [1], ''), c('org', [1, 3], 'iso 3'), c('dod', [1, 3, 6], 'org 6'),
    c('internet', [1, 3, 6, 1], 'dod 1'), c('mgmt', [1, 3, 6, 1, 2], 'internet 2'),
    c('mib-2', [1, 3, 6, 1, 2, 1], 'mgmt 1'), c('private', [1, 3, 6, 1, 4], 'internet 4'),
    c('enterprises', [1, 3, 6, 1, 4, 1], 'private 1'), c('experimental', [1, 3, 6, 1, 3], 'internet 3')
  ]
}
function buildRelationships(nodes, nodeMap) {
  for (const node of nodes) {
    if (!node.oidDef) continue
    const p = parseOidDef(node.oidDef)
    if (!p) {
      const mo = parseMultiSegmentOidDef(node.oidDef)
      if (mo && mo.length > 0) {
        node.oid = [...mo]; node.oidString = node.oid.join('.')
        const po = mo.slice(0, -1).join('.')
        const par = nodes.find(n => n.oidString === po && n.oid.length > 0)
        if (par) { node.parentId = par.id; if (!par.children.includes(node.id)) par.children = [...par.children, node.id] }
      }
      continue
    }
    const par = nodeMap.get(p.parentName)
    if (!par) continue
    node.parentId = par.id
    if (!par.children.includes(node.id)) par.children = [...par.children, node.id]
    if (par.oid.length > 0) { node.oid = [...par.oid, p.childNumber]; node.oidString = node.oid.join('.') }
  }
  let c = true, i = 0
  while (c && i < 20) {
    c = false; i++
    for (const node of nodes) {
      if (node.oid.length > 0) continue
      if (!node.oidDef) continue
      const p = parseOidDef(node.oidDef); if (!p) continue
      let par = nodeMap.get(p.parentName)
      if (!par) par = nodes.find(n => n.name === p.parentName && n.oid.length > 0)
      if (!par || par.oid.length === 0) continue
      if (node.parentId !== par.id) {
        node.parentId = par.id
        if (!par.children.includes(node.id)) par.children = [...par.children, node.id]
      }
      node.oid = [...par.oid, p.childNumber]; node.oidString = node.oid.join('.')
      c = true
    }
  }
}
function buildMibTree(modules) {
  const nodeMap = new Map()
  const allNodes = []
  for (const n of createStandardRootNodes()) { nodeMap.set(n.name, n); allNodes.push(n) }
  for (const mod of modules) for (const n of mod.nodes) { if (!nodeMap.has(n.name)) nodeMap.set(n.name, n); allNodes.push(n) }
  buildRelationships(allNodes, nodeMap)
  const oidMap = new Map(); const survivingNodes = []; const removedIds = new Set()
  for (const node of allNodes) {
    if (node.oid.length === 0) { survivingNodes.push(node); continue }
    const k = node.oidString
    if (oidMap.has(k)) {
      const ex = oidMap.get(k)
      for (const cid of node.children) if (!ex.children.includes(cid)) ex.children = [...ex.children, cid]
      if (!ex.parentId && node.parentId) ex.parentId = node.parentId
      removedIds.add(node.id)
    } else { oidMap.set(k, node); survivingNodes.push(node) }
  }
  const oldToNew = new Map()
  for (const rid of removedIds) {
    const rm = allNodes.find(n => n.id === rid); if (!rm) continue
    const sv = oidMap.get(rm.oidString); if (sv) oldToNew.set(rid, sv.id)
  }
  for (const node of survivingNodes) {
    if (node.parentId && oldToNew.has(node.parentId)) node.parentId = oldToNew.get(node.parentId)
    node.children = node.children.map(c => oldToNew.get(c) || c).filter(c => !removedIds.has(c))
  }
  for (const [n, nd] of nodeMap) if (removedIds.has(nd.id)) { const sv = oidMap.get(nd.oidString); if (sv) nodeMap.set(n, sv) }
  const byId = new Map(); for (const n of survivingNodes) byId.set(n.id, n)
  const reach = new Set()
  for (const node of survivingNodes) {
    let cur = node; const chain = []
    while (cur) {
      chain.push(cur.id)
      if (reach.has(cur.id)) { for (const i of chain) reach.add(i); break }
      if (cur.oidString === '1') { for (const i of chain) reach.add(i); break }
      if (!cur.parentId) break
      cur = byId.get(cur.parentId); if (!cur) break
    }
  }
  const final = survivingNodes.filter(n => reach.has(n.id))
  for (const n of final) n.children = n.children.filter(c => reach.has(c))
  return final
}

// === SIMULATE THE FULL SCENARIO ===
resetCounter()
const cachedBase = parseModule(fs.readFileSync(BASE, 'utf-8'), 'BASE')

resetCounter()  // counter resets BECAUSE this is the OLD buggy behavior (or counter starts at 0 in a new session)
const bert = parseModule(fs.readFileSync(BERT, 'utf-8'), 'BERT')
const clocke = parseModule(fs.readFileSync(CLOCKE, 'utf-8'), 'CLOCKE')

const final = buildMibTree([cachedBase, bert, clocke])

// === SIMULATE RENDERER buildTreeFromNodes (real one) ===
console.log('=== RENDERER SIMULATION (mibTreeUtils.ts) ===\n')
function rendererBuildTree(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  // Skip OID resolution since main process already did it.
  const dedupedNodes = nodes.map(node => ({ ...node, children: [...new Set(node.children)] }))
  const dedupedMap = new Map(dedupedNodes.map(n => [n.id, n]))
  const rootSet = new Set()
  const roots = dedupedNodes.filter(n => {
    if (n.parentId && dedupedMap.has(n.parentId)) return false
    if (rootSet.has(n.id)) return false
    rootSet.add(n.id)
    return true
  })

  function buildNode(node) {
    return {
      id: node.id, name: node.name, oid: node.oidString,
      children: node.children.map(c => dedupedMap.get(c)).filter(n => !!n).map(buildNode)
    }
  }
  return roots.map(buildNode)
}

const tree = rendererBuildTree(final)
console.log(`Top-level roots in tree: ${tree.length}`)
for (const r of tree) {
  console.log(`Root: ${r.id} ${r.name} oid=${r.oid}`)
}

// Render full tree (compact)
function renderTree(node, depth=0) {
  const indent = '  '.repeat(depth)
  console.log(`${indent}${node.id} ${node.name} (oid=${node.oid})`)
  for (const c of node.children) renderTree(c, depth + 1)
}
console.log('\n=== FULL TREE ===')
for (const r of tree) renderTree(r)

// Check specifically: are these 3 nodes rendered inside the tree somewhere?
function findInTree(tree, predicate) {
  const result = []
  function walk(node, path) {
    if (predicate(node)) result.push({ node, path: [...path, node.name].join(' > ') })
    for (const c of node.children) walk(c, [...path, node.name])
  }
  for (const r of tree) walk(r, [])
  return result
}

console.log('\n=== WHERE ARE THE 3 PROBLEM NODES IN RENDERED TREE? ===')
for (const target of ['raisecomClockEDeviceMaster', 'raisecomClockESSMEnable', 'raisecomClockESrcStatusTable', 'raisecomClockEPllCmd']) {
  const found = findInTree(tree, n => n.name === target)
  console.log(`${target}: ${found.length} occurrence(s)`)
  for (const f of found) console.log(`  at: ${f.path}`)
}
