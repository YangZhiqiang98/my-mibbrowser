// Trace: simulate cache + fresh load scenario
const fs = require('fs')

const BERT = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'
const BASE = 'E:/RC/MIB/SLT8400/09_ros6.x/private/RAISECOM-BASE-MIB.my'

function stripImportsSection(content) { return content.replace(/IMPORTS\s*[\s\S]*?;/gi, '') }

let counter = 0
function resetCounter() { counter = 0 }

function parseModule(content, fileName) {
  const moduleNameMatch = content.match(/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
  const moduleName = moduleNameMatch ? moduleNameMatch[1] : fileName
  const module = { name: moduleName, nodes: [] }
  const stripped = stripImportsSection(content)

  const ot = /(\S+)\s+OBJECT-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
  let m
  while ((m = ot.exec(stripped)) !== null) {
    module.nodes.push({ id: `node-${++counter}`, name: m[1], kind: 'OBJECT-TYPE', oidDef: m[3].trim(), parentId: null, children: [], oid: [], oidString: '' })
  }
  const oi = /(\S+)\s+(?:OBJECT-IDENTITY|MODULE-IDENTITY)\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
  while ((m = oi.exec(stripped)) !== null) {
    module.nodes.push({ id: `node-${++counter}`, name: m[1], kind: 'OBJECT-IDENTITY', oidDef: m[3].trim(), parentId: null, children: [], oid: [], oidString: '' })
  }
  const nt = /(\S+)\s+NOTIFICATION-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
  while ((m = nt.exec(stripped)) !== null) {
    module.nodes.push({ id: `node-${++counter}`, name: m[1], kind: 'NOTIFICATION-TYPE', oidDef: m[3].trim(), parentId: null, children: [], oid: [], oidString: '' })
  }
  const oid = /(\S+)\s+OBJECT\s+IDENTIFIER\s*::=\s*\{([^}]+)\}/g
  while ((m = oid.exec(stripped)) !== null) {
    module.nodes.push({ id: `node-${++counter}`, name: m[1], kind: 'OBJECT IDENTIFIER', oidDef: m[2].trim(), parentId: null, children: [], oid: [], oidString: '' })
  }
  return module
}

function parseOidDef(oidDef) {
  const trimmed = oidDef.trim().replace(/^\{\s*/, '').replace(/\s*\}$/, '')
  if (!trimmed) return null
  const simpleMatch = trimmed.match(/^(\S+)\s+(\d+)$/)
  if (simpleMatch) return { parentName: simpleMatch[1], childNumber: parseInt(simpleMatch[2], 10) }
  return null
}
function parseMultiSegmentOidDef(oidDef) {
  const trimmed = oidDef.trim()
  if (!trimmed) return null
  const segments = []
  const segRegex = /(\S+?)\((\d+)\)|(\d+)/g
  let segMatch
  while ((segMatch = segRegex.exec(trimmed)) !== null) {
    if (segMatch[1] !== undefined) segments.push({ name: segMatch[1], number: parseInt(segMatch[2], 10) })
    else if (segMatch[3] !== undefined) segments.push({ name: '', number: parseInt(segMatch[3], 10) })
  }
  if (segments.length === 0) return null
  const oidParts = []
  for (const seg of segments) { if (seg.number !== null) oidParts.push(seg.number); else return null }
  return oidParts.length > 0 ? oidParts : null
}

function createStandardRootNodes() {
  let idCounter = 10000
  const create = (name, oid, oidDef) => ({ id: `root-${idCounter++}`, name, oid, oidString: oid.join('.'), kind: 'root', parentId: null, children: [], oidDef })
  return [
    create('iso', [1], ''),
    create('org', [1, 3], 'iso 3'),
    create('dod', [1, 3, 6], 'org 6'),
    create('internet', [1, 3, 6, 1], 'dod 1'),
    create('mgmt', [1, 3, 6, 1, 2], 'internet 2'),
    create('mib-2', [1, 3, 6, 1, 2, 1], 'mgmt 1'),
    create('private', [1, 3, 6, 1, 4], 'internet 4'),
    create('enterprises', [1, 3, 6, 1, 4, 1], 'private 1'),
    create('experimental', [1, 3, 6, 1, 3], 'internet 3')
  ]
}

function buildRelationships(nodes, nodeMap) {
  for (const node of nodes) {
    if (!node.oidDef) continue
    const parsed = parseOidDef(node.oidDef)
    if (!parsed) {
      const multiOid = parseMultiSegmentOidDef(node.oidDef)
      if (multiOid && multiOid.length > 0) {
        node.oid = [...multiOid]
        node.oidString = node.oid.join('.')
        const parentOid = multiOid.slice(0, -1).join('.')
        const parent = nodes.find(n => n.oidString === parentOid && n.oid.length > 0)
        if (parent) {
          node.parentId = parent.id
          if (!parent.children.includes(node.id)) parent.children = [...parent.children, node.id]
        }
      }
      continue
    }
    const { parentName, childNumber } = parsed
    const parent = nodeMap.get(parentName)
    if (!parent) continue
    node.parentId = parent.id
    if (!parent.children.includes(node.id)) parent.children = [...parent.children, node.id]
    if (parent.oid.length > 0) {
      node.oid = [...parent.oid, childNumber]
      node.oidString = node.oid.join('.')
    }
  }
  let changed = true, iterations = 0
  while (changed && iterations < 20) {
    changed = false; iterations++
    for (const node of nodes) {
      if (node.oid.length > 0) continue
      if (!node.oidDef) continue
      const parsed = parseOidDef(node.oidDef)
      if (!parsed) continue
      const { parentName, childNumber } = parsed
      let parent = nodeMap.get(parentName)
      if (!parent) parent = nodes.find(n => n.name === parentName && n.oid.length > 0)
      if (!parent || parent.oid.length === 0) continue
      if (node.parentId !== parent.id) {
        node.parentId = parent.id
        if (!parent.children.includes(node.id)) parent.children = [...parent.children, node.id]
      }
      node.oid = [...parent.oid, childNumber]
      node.oidString = node.oid.join('.')
      changed = true
    }
  }
}

function buildMibTree(modules) {
  const nodeMap = new Map()
  const allNodes = []
  for (const n of createStandardRootNodes()) { nodeMap.set(n.name, n); allNodes.push(n) }
  for (const module of modules) {
    for (const node of module.nodes) {
      if (!nodeMap.has(node.name)) nodeMap.set(node.name, node)
      allNodes.push(node)
    }
  }
  buildRelationships(allNodes, nodeMap)

  const oidMap = new Map()
  const survivingNodes = []
  const removedIds = new Set()
  for (const node of allNodes) {
    if (node.oid.length === 0) { survivingNodes.push(node); continue }
    const key = node.oidString
    if (oidMap.has(key)) {
      const existing = oidMap.get(key)
      for (const childId of node.children) {
        if (!existing.children.includes(childId)) existing.children = [...existing.children, childId]
      }
      if (!existing.parentId && node.parentId) existing.parentId = node.parentId
      removedIds.add(node.id)
    } else {
      oidMap.set(key, node)
      survivingNodes.push(node)
    }
  }
  const oldToNew = new Map()
  for (const removedId of removedIds) {
    const removed = allNodes.find(n => n.id === removedId)
    if (!removed) continue
    const survivor = oidMap.get(removed.oidString)
    if (survivor) oldToNew.set(removedId, survivor.id)
  }
  for (const node of survivingNodes) {
    if (node.parentId && oldToNew.has(node.parentId)) node.parentId = oldToNew.get(node.parentId)
    node.children = node.children.map(c => oldToNew.get(c) || c).filter(c => !removedIds.has(c))
  }
  for (const [name, node] of nodeMap) {
    if (removedIds.has(node.id)) {
      const survivor = oidMap.get(node.oidString)
      if (survivor) nodeMap.set(name, survivor)
    }
  }
  const nodeById = new Map()
  for (const node of survivingNodes) nodeById.set(node.id, node)
  const reachable = new Set()
  for (const node of survivingNodes) {
    let current = node
    const chain = []
    while (current) {
      chain.push(current.id)
      if (reachable.has(current.id)) { for (const id of chain) reachable.add(id); break }
      if (current.oidString === '1') { for (const id of chain) reachable.add(id); break }
      if (!current.parentId) break
      current = nodeById.get(current.parentId)
      if (!current) break
    }
  }
  const finalNodes = survivingNodes.filter(n => reachable.has(n.id))
  for (const node of finalNodes) node.children = node.children.filter(c => reachable.has(c))
  return finalNodes
}

// === SCENARIO: User loaded BASE-MIB earlier (counter reset between parseFiles calls — the OLD buggy behavior).
// Simulates situation where:
// - Session 1: parser parses BASE-MIB. counter goes from 0 to N. Cache saved.
// - Session 2 (NEW app run): app starts, parser created with counter=0.
//                          loadMibCache loads BASE-MIB modules with their cached node-1..node-N ids.
//                          Counter STILL 0 in the new parser (no reset triggered).
// - User loads ADD via Directory. parser.parseDirectory => parseFiles starts fresh counter=0.
//                          ADD parses generate node-1..node-68.
//                          These conflict with cached node-1..node-68.

console.log('=== Simulating: Cached BASE-MIB (counter 0..N from prior session) + fresh ADD parse (counter restarts at 0) ===\n')

resetCounter()
const cachedBase = parseModule(fs.readFileSync(BASE, 'utf-8'), 'BASE')
console.log(`Cached BASE nodes count: ${cachedBase.nodes.length}`)
console.log(`First 5 cached BASE node ids:`)
for (let i = 0; i < 5; i++) console.log(`  ${cachedBase.nodes[i].id} ${cachedBase.nodes[i].name} oidDef="${cachedBase.nodes[i].oidDef}"`)
console.log('  ...')
console.log(`Nodes 17, 18, 19, 42 from BASE:`)
for (const idx of [16, 17, 18, 41]) {  // 0-indexed for nodes 17,18,19,42
  if (cachedBase.nodes[idx]) {
    console.log(`  ${cachedBase.nodes[idx].id} ${cachedBase.nodes[idx].name} oidDef="${cachedBase.nodes[idx].oidDef}"`)
  }
}

resetCounter()  // fresh parser
const bert = parseModule(fs.readFileSync(BERT, 'utf-8'), 'BERT')
const clocke = parseModule(fs.readFileSync(CLOCKE, 'utf-8'), 'CLOCKE')
console.log(`\nFresh ADD parse: BERT ${bert.nodes.length} nodes, CLOCKE ${clocke.nodes.length} nodes`)
console.log(`First BERT node id: ${bert.nodes[0]?.id}, First CLOCKE node id: ${clocke.nodes[0]?.id}`)
console.log(`raisecomClockEDeviceMaster: ${clocke.nodes.find(n => n.name === 'raisecomClockEDeviceMaster')?.id}`)
console.log(`raisecomClockESSMEnable: ${clocke.nodes.find(n => n.name === 'raisecomClockESSMEnable')?.id}`)
console.log(`raisecomClockESrcStatusTable: ${clocke.nodes.find(n => n.name === 'raisecomClockESrcStatusTable')?.id}`)

// accumulatedModules = [cachedBase, bert, clocke]
console.log('\n=== Running buildMibTree with [cachedBase, bert, clocke] (id collision present) ===\n')
const final = buildMibTree([cachedBase, bert, clocke])
console.log(`Total final nodes: ${final.length}`)

// Find raisecomClockEObjects and its children
const clockEObj = final.find(n => n.name === 'raisecomClockEObjects')
console.log(`\nraisecomClockEObjects: ${clockEObj?.id} parentId=${clockEObj?.parentId} children=${JSON.stringify(clockEObj?.children)}`)
console.log('Children resolution:')
if (clockEObj) {
  for (const cid of clockEObj.children) {
    const c = final.find(n => n.id === cid)
    if (c) console.log(`  -> ${c.id} ${c.name} oid=${c.oidString}`)
    else console.log(`  -> ${cid} NOT IN FINAL TREE`)
  }
}

console.log('\nLooking for misplaced 3 nodes in final tree:')
for (const targetName of ['raisecomClockEDeviceMaster', 'raisecomClockESSMEnable', 'raisecomClockESrcStatusTable', 'raisecomClockEPllCmd']) {
  const matches = final.filter(n => n.name === targetName)
  console.log(`  ${targetName}: ${matches.length} match(es)`)
  for (const m of matches) console.log(`    ${m.id} parentId=${m.parentId} oidString=${m.oidString}`)
}

// Check id collisions in final
console.log('\n=== ID COLLISION ANALYSIS IN FINAL ===')
const idMap = new Map()
for (const n of final) {
  if (!idMap.has(n.id)) idMap.set(n.id, [])
  idMap.get(n.id).push(n.name)
}
let collisions = 0
for (const [id, names] of idMap) {
  if (names.length > 1) {
    console.log(`  COLLISION: id=${id} names=${JSON.stringify(names)}`)
    collisions++
  }
}
console.log(`Total id collisions in final: ${collisions}`)

// === RENDERER buildTreeFromNodes ===
console.log('\n=== Simulating renderer buildTreeFromNodes ===')
function rendererBuildTree(nodes) {
  const dedupedNodes = nodes.map(node => ({ ...node, children: [...new Set(node.children)] }))
  const dedupedMap = new Map(dedupedNodes.map(n => [n.id, n]))
  const rootSet = new Set()
  const roots = dedupedNodes.filter(n => {
    if (n.parentId && dedupedMap.has(n.parentId)) return false
    if (rootSet.has(n.id)) return false
    rootSet.add(n.id)
    return true
  })
  return { roots, dedupedMap, dedupedNodes }
}

const { roots, dedupedMap, dedupedNodes } = rendererBuildTree(final)
console.log(`Renderer roots count: ${roots.length}`)
console.log('Roots:')
for (const r of roots.slice(0, 50)) console.log(`  ${r.id} ${r.name} parentId=${r.parentId} oid=${r.oidString}`)

console.log('\nChecking the 3 problem nodes in roots:')
for (const targetName of ['raisecomClockEDeviceMaster', 'raisecomClockESSMEnable', 'raisecomClockESrcStatusTable', 'raisecomClockEPllCmd']) {
  const inRoot = roots.find(n => n.name === targetName)
  const inFinal = final.find(n => n.name === targetName)
  console.log(`  ${targetName}: inRoot=${!!inRoot}, inFinal=${!!inFinal}`)
  if (inFinal && !inRoot) {
    // It's NOT a root but in final - so it's a child of some node. Check that.
    const parent = dedupedMap.get(inFinal.parentId)
    console.log(`    inFinal but not root: parent in dedupedMap = ${parent?.name} (${parent?.id})`)
  }
}
