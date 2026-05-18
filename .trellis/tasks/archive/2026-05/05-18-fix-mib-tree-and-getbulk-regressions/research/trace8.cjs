// Full simulation with actual user cache state
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
function buildMibTree(modules) { const nodeMap = new Map(); const allNodes = []; for (const n of createStandardRootNodes()) { nodeMap.set(n.name, n); allNodes.push(n) } for (const mod of modules) for (const n of mod.nodes) { if (!nodeMap.has(n.name)) nodeMap.set(n.name, n); allNodes.push(n) } buildRelationships(allNodes, nodeMap); const oidMap = new Map(); const survivingNodes = []; const removedIds = new Set(); for (const node of allNodes) { if (node.oid.length === 0) { survivingNodes.push(node); continue } const k = node.oidString; if (oidMap.has(k)) { const ex = oidMap.get(k); for (const cid of node.children) if (!ex.children.includes(cid)) ex.children = [...ex.children, cid]; if (!ex.parentId && node.parentId) ex.parentId = node.parentId; removedIds.add(node.id) } else { oidMap.set(k, node); survivingNodes.push(node) } } const oldToNew = new Map(); for (const rid of removedIds) { const rm = allNodes.find(n => n.id === rid); if (!rm) continue; const sv = oidMap.get(rm.oidString); if (sv) oldToNew.set(rid, sv.id) } for (const node of survivingNodes) { if (node.parentId && oldToNew.has(node.parentId)) node.parentId = oldToNew.get(node.parentId); node.children = node.children.map(c => oldToNew.get(c) || c).filter(c => !removedIds.has(c)) } for (const [n, nd] of nodeMap) if (removedIds.has(nd.id)) { const sv = oidMap.get(nd.oidString); if (sv) nodeMap.set(n, sv) } const byId = new Map(); for (const n of survivingNodes) byId.set(n.id, n); const reach = new Set(); for (const node of survivingNodes) { let cur = node; const chain = []; while (cur) { chain.push(cur.id); if (reach.has(cur.id)) { for (const i of chain) reach.add(i); break } if (cur.oidString === '1') { for (const i of chain) reach.add(i); break } if (!cur.parentId) break; cur = byId.get(cur.parentId); if (!cur) break } } const final = survivingNodes.filter(n => reach.has(n.id)); for (const n of final) n.children = n.children.filter(c => reach.has(c)); return final }

// === SETUP: simulate user's actual cache + fresh ADD load ===
let accumulatedModules = []
for (const file of [CACHE_FILE, ADD_CACHE]) {
  const cache = JSON.parse(fs.readFileSync(file, 'utf-8'))
  if (cache.version !== 3) continue
  const existingNames = new Set(accumulatedModules.map(m => m.name))
  for (const mod of cache.modules) {
    if (!existingNames.has(mod.name)) accumulatedModules.push(mod)
  }
}

// Fresh ADD load
const parser = new Parser()
const bert = parser.parseModule(fs.readFileSync(BERT_FILE, 'utf-8'), 'RAISECOM-OPT-BERT-MIB.my')
const clocke = parser.parseModule(fs.readFileSync(CLOCKE_FILE, 'utf-8'), 'RAISECOM-OTP-CLOCKE-MIB.my')

const oldModuleNames = ['IMPORTS']
accumulatedModules = accumulatedModules.filter(m => !oldModuleNames.includes(m.name))
accumulatedModules = [...accumulatedModules, bert, clocke]

console.log(`Final accumulatedModules: ${accumulatedModules.length}`)

const final = buildMibTree(accumulatedModules)
console.log(`buildMibTree final nodes: ${final.length}`)

// Find raisecomClockEObjects and check its children
const ce = final.find(n => n.name === 'raisecomClockEObjects')
console.log(`\nraisecomClockEObjects: ${ce?.id} parentId=${ce?.parentId} children=${JSON.stringify(ce?.children)}`)

// dedupedMap (renderer)
const dedupedMap = new Map(final.map(n => [n.id, n]))
console.log(`\ndedupedMap.size = ${dedupedMap.size} (final size ${final.length})`)

if (ce) {
  console.log(`\nrendered children of raisecomClockEObjects:`)
  for (const cid of ce.children) {
    const v = dedupedMap.get(cid)
    console.log(`  ${cid} -> ${v?.name || 'MISSING'} (oid=${v?.oidString || '?'})`)
  }
}

// Check 3 problem nodes
console.log(`\n=== Looking for the 3 problem nodes ===`)
for (const target of ['raisecomClockEDeviceMaster', 'raisecomClockESSMEnable', 'raisecomClockESrcStatusTable', 'raisecomClockEPllCmd']) {
  const matches = final.filter(n => n.name === target)
  console.log(`\n${target}: ${matches.length} match(es) in final`)
  for (const m of matches) {
    console.log(`  ${m.id} parentId=${m.parentId} oid=${m.oidString}`)
    const wonMap = dedupedMap.get(m.id)
    console.log(`    dedupedMap.get(${m.id}) -> ${wonMap?.name} (winner)`)
    // is this node in the children of the dedupedMap version of its parent?
    if (m.parentId) {
      const parent = dedupedMap.get(m.parentId)
      if (parent) {
        const inChildren = parent.children.includes(m.id)
        console.log(`    parent dedupedMap.get(${m.parentId}) = ${parent.name}, includes ${m.id} in children? ${inChildren}`)
      } else {
        console.log(`    parent ${m.parentId} NOT IN dedupedMap → will render at root`)
      }
    }
  }
}

// Where do these IDs render?
console.log(`\n=== Simulating renderer roots filter ===`)
const rootSet = new Set()
const roots = final.filter(n => {
  if (n.parentId && dedupedMap.has(n.parentId)) return false
  if (rootSet.has(n.id)) return false
  rootSet.add(n.id)
  return true
})
console.log(`Roots count: ${roots.length}`)
for (const r of roots.slice(0, 30)) {
  if (r.name.startsWith('raisecomClockE') || !r.name.startsWith('root')) {
    console.log(`  ROOT: ${r.id} ${r.name} parentId=${r.parentId} oid=${r.oidString}`)
  }
}

// Specifically check the 3 nodes
console.log(`\n=== Are the 3 problem nodes in roots? ===`)
for (const target of ['raisecomClockEDeviceMaster', 'raisecomClockESSMEnable', 'raisecomClockESrcStatusTable', 'raisecomClockEPllCmd']) {
  const matches = roots.filter(n => n.name === target)
  console.log(`  ${target}: ${matches.length} in roots`)
}
