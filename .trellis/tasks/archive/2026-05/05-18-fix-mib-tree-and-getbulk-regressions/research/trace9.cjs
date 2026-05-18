// Debug: why is cached ieee8021CfmDefaultMdTable showing up in roots?
const fs = require('fs')
const CACHE_FILE = 'D:/learn/mib-cache/mib-cache-09_ros6_x_6e32ce08.json'
const ADD_CACHE = 'D:/learn/mib-cache/mib-cache-ADD_7977868a.json'
const BERT_FILE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE_FILE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'

function stripImportsSection(c) { return c.replace(/IMPORTS\s*[\s\S]*?;/gi, '') }
class Parser {
  constructor() { this.counter = 0 }
  parseModule(content, fileName) {
    const m = content.match(/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
    let moduleName = m ? m[1] : null
    if (!moduleName) { const im = content.match(/(\S+)\s+MODULE-IDENTITY/i); moduleName = im ? im[1] : fileName }
    const mod = { name: moduleName, nodes: [] }
    const stripped = stripImportsSection(content)
    let r
    for (const [kind, regex] of [
      ['OBJECT-TYPE', /(\S+)\s+OBJECT-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g],
      ['OBJECT-IDENTITY', /(\S+)\s+(?:OBJECT-IDENTITY|MODULE-IDENTITY)\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g],
      ['NOTIFICATION-TYPE', /(\S+)\s+NOTIFICATION-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g],
    ]) {
      while ((r = regex.exec(stripped)) !== null) {
        mod.nodes.push({ id: `node-${++this.counter}`, name: r[1], kind, oidDef: r[3].trim(), parentId: null, children: [], oid: [], oidString: '' })
      }
    }
    const oid = /(\S+)\s+OBJECT\s+IDENTIFIER\s*::=\s*\{([^}]+)\}/g
    while ((r = oid.exec(stripped)) !== null) {
      mod.nodes.push({ id: `node-${++this.counter}`, name: r[1], kind: 'OBJECT IDENTIFIER', oidDef: r[2].trim(), parentId: null, children: [], oid: [], oidString: '' })
    }
    return mod
  }
}

function parseOidDef(o) { const t = o.trim().replace(/^\{\s*/, '').replace(/\s*\}$/, ''); if (!t) return null; const m = t.match(/^(\S+)\s+(\d+)$/); return m ? { parentName: m[1], childNumber: parseInt(m[2], 10) } : null }
function parseMultiSegmentOidDef(o) { const t = o.trim(); if (!t) return null; const s = []; const r = /(\S+?)\((\d+)\)|(\d+)/g; let m; while ((m = r.exec(t)) !== null) { if (m[1] !== undefined) s.push({ name: m[1], number: parseInt(m[2], 10) }); else if (m[3] !== undefined) s.push({ name: '', number: parseInt(m[3], 10) }) } if (s.length === 0) return null; const p = []; for (const x of s) { if (x.number !== null) p.push(x.number); else return null } return p.length > 0 ? p : null }
function createStandardRootNodes() { let i = 10000; const c = (n, o, d) => ({ id: `root-${i++}`, name: n, oid: o, oidString: o.join('.'), kind: 'root', parentId: null, children: [], oidDef: d }); return [c('iso', [1], ''), c('org', [1, 3], 'iso 3'), c('dod', [1, 3, 6], 'org 6'), c('internet', [1, 3, 6, 1], 'dod 1'), c('mgmt', [1, 3, 6, 1, 2], 'internet 2'), c('mib-2', [1, 3, 6, 1, 2, 1], 'mgmt 1'), c('private', [1, 3, 6, 1, 4], 'internet 4'), c('enterprises', [1, 3, 6, 1, 4, 1], 'private 1'), c('experimental', [1, 3, 6, 1, 3], 'internet 3')] }
function buildRelationships(nodes, nodeMap) { for (const node of nodes) { if (!node.oidDef) continue; const p = parseOidDef(node.oidDef); if (!p) { const mo = parseMultiSegmentOidDef(node.oidDef); if (mo && mo.length > 0) { node.oid = [...mo]; node.oidString = node.oid.join('.'); const po = mo.slice(0, -1).join('.'); const par = nodes.find(n => n.oidString === po && n.oid.length > 0); if (par) { node.parentId = par.id; if (!par.children.includes(node.id)) par.children = [...par.children, node.id] } } continue } const par = nodeMap.get(p.parentName); if (!par) continue; node.parentId = par.id; if (!par.children.includes(node.id)) par.children = [...par.children, node.id]; if (par.oid.length > 0) { node.oid = [...par.oid, p.childNumber]; node.oidString = node.oid.join('.') } } let c = true, i = 0; while (c && i < 20) { c = false; i++; for (const node of nodes) { if (node.oid.length > 0) continue; if (!node.oidDef) continue; const p = parseOidDef(node.oidDef); if (!p) continue; let par = nodeMap.get(p.parentName); if (!par) par = nodes.find(n => n.name === p.parentName && n.oid.length > 0); if (!par || par.oid.length === 0) continue; if (node.parentId !== par.id) { node.parentId = par.id; if (!par.children.includes(node.id)) par.children = [...par.children, node.id] } node.oid = [...par.oid, p.childNumber]; node.oidString = node.oid.join('.'); c = true } } }

function buildMibTree(modules) {
  const nodeMap = new Map(); const allNodes = []
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
  for (const rid of removedIds) { const rm = allNodes.find(n => n.id === rid); if (!rm) continue; const sv = oidMap.get(rm.oidString); if (sv) oldToNew.set(rid, sv.id) }
  for (const node of survivingNodes) { if (node.parentId && oldToNew.has(node.parentId)) node.parentId = oldToNew.get(node.parentId); node.children = node.children.map(c => oldToNew.get(c) || c).filter(c => !removedIds.has(c)) }
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
  return { final, survivingNodes, reachable: reach, nodeById: byId }
}

let accumulatedModules = []
for (const f of [CACHE_FILE, ADD_CACHE]) { const c = JSON.parse(fs.readFileSync(f, 'utf-8')); const ex = new Set(accumulatedModules.map(m => m.name)); for (const m of c.modules) if (!ex.has(m.name)) accumulatedModules.push(m) }
const parser = new Parser()
const bert = parser.parseModule(fs.readFileSync(BERT_FILE, 'utf-8'), 'RAISECOM-OPT-BERT-MIB.my')
const clocke = parser.parseModule(fs.readFileSync(CLOCKE_FILE, 'utf-8'), 'RAISECOM-OTP-CLOCKE-MIB.my')
accumulatedModules = accumulatedModules.filter(m => m.name !== 'IMPORTS')
accumulatedModules = [...accumulatedModules, bert, clocke]

const r = buildMibTree(accumulatedModules)
console.log(`final.length = ${r.final.length}`)
console.log(`survivingNodes.length = ${r.survivingNodes.length}`)
console.log(`reachable.size = ${r.reachable.size}`)

// Check if cached ieee8021CfmDefaultMdTable (cached, node-18) is in reach
const cachedDefaultMd = r.survivingNodes.find(n => n.name === 'ieee8021CfmDefaultMdTable')
const freshDeviceMaster = r.survivingNodes.find(n => n.name === 'raisecomClockEDeviceMaster')
console.log(`\nCached ieee8021CfmDefaultMdTable: ${cachedDefaultMd?.id}, parentId=${cachedDefaultMd?.parentId}`)
console.log(`reachable.has(${cachedDefaultMd?.id})? ${r.reachable.has(cachedDefaultMd?.id)}`)
console.log(`\nFresh raisecomClockEDeviceMaster: ${freshDeviceMaster?.id}, parentId=${freshDeviceMaster?.parentId}`)
console.log(`reachable.has(${freshDeviceMaster?.id})? ${r.reachable.has(freshDeviceMaster?.id)}`)

// Walk for ieee8021CfmDefaultMdTable manually
if (cachedDefaultMd) {
  console.log(`\nManual walk for ieee8021CfmDefaultMdTable (cached):`)
  let cur = cachedDefaultMd; const chain = []
  let step = 0
  while (cur && step < 50) {
    step++
    chain.push(`${cur.id} ${cur.name} oid=${cur.oidString}`)
    console.log(`  step ${step}: ${cur.id} ${cur.name} (oid=${cur.oidString}, parentId=${cur.parentId})`)
    if (r.reachable.has(cur.id)) { console.log(`    → already reachable`); break }
    if (cur.oidString === '1') { console.log(`    → oid=1, mark reachable`); break }
    if (!cur.parentId) { console.log(`    → no parentId, break`); break }
    cur = r.nodeById.get(cur.parentId)
    if (!cur) { console.log(`    → parent not in nodeById, break`); break }
  }
}

// Check who node-18 winners are: cached ieee8021CfmDefaultMdTable vs fresh raisecomClockEDeviceMaster
const node18Survivors = r.survivingNodes.filter(n => n.id === 'node-18')
console.log(`\nNodes with id=node-18 in survivingNodes:`)
for (const n of node18Survivors) console.log(`  ${n.id} ${n.name} oid=${n.oidString} reachable=${r.reachable.has(n.id)}`)
const node18Final = r.final.filter(n => n.id === 'node-18')
console.log(`Nodes with id=node-18 in final:`)
for (const n of node18Final) console.log(`  ${n.id} ${n.name} oid=${n.oidString}`)
// What does nodeById return?
console.log(`nodeById.get(node-18) = ${r.nodeById.get('node-18')?.name}`)

// Render dedupedMap (only nodes in final)
const dedupedNodes = r.final.map(n => ({ ...n, children: [...new Set(n.children)] }))
const dedupedMap = new Map(dedupedNodes.map(n => [n.id, n]))
console.log(`\ndedupedMap.size = ${dedupedMap.size}`)
console.log(`dedupedMap.get(node-18) = ${dedupedMap.get('node-18')?.name}`)
console.log(`dedupedMap.get(node-19) = ${dedupedMap.get('node-19')?.name}`)
console.log(`dedupedMap.get(node-42) = ${dedupedMap.get('node-42')?.name}`)
console.log(`dedupedMap.get(node-66) (raisecomClockEObjects) = ${dedupedMap.get('node-66')?.name}`)
console.log(`dedupedMap.get(node-16757) = ${dedupedMap.get('node-16757')?.name}`)

// Renderer filter
const rootSet = new Set()
const renderRoots = dedupedNodes.filter(n => {
  if (n.parentId && dedupedMap.has(n.parentId)) return false
  if (rootSet.has(n.id)) return false
  rootSet.add(n.id)
  return true
})
console.log(`\nRenderer Roots count: ${renderRoots.length}`)
for (const root of renderRoots) {
  console.log(`  ROOT: ${root.id} ${root.name} parentId=${root.parentId} oid=${root.oidString}`)
}
