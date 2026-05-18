// Trace script: full simulation of buildMibTree from parser.ts
const fs = require('fs')

const BERT = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'
const BASE = 'E:/RC/MIB/SLT8400/09_ros6.x/private/RAISECOM-BASE-MIB.my'

function stripImportsSection(content) {
  return content.replace(/IMPORTS\s*[\s\S]*?;/gi, '')
}

let counter = 0

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
  if (simpleMatch) {
    return { parentName: simpleMatch[1], childNumber: parseInt(simpleMatch[2], 10) }
  }
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
  for (const seg of segments) {
    if (seg.number !== null) oidParts.push(seg.number)
    else return null
  }
  return oidParts.length > 0 ? oidParts : null
}

function createStandardRootNodes() {
  let idCounter = 10000
  const create = (name, oid, kind, oidDef) => ({
    id: `root-${idCounter++}`, name, oid, oidString: oid.join('.'),
    kind, parentId: null, children: [], oidDef
  })
  return [
    create('iso', [1], 'root', ''),
    create('org', [1, 3], 'root', 'iso 3'),
    create('dod', [1, 3, 6], 'root', 'org 6'),
    create('internet', [1, 3, 6, 1], 'root', 'dod 1'),
    create('mgmt', [1, 3, 6, 1, 2], 'root', 'internet 2'),
    create('mib-2', [1, 3, 6, 1, 2, 1], 'root', 'mgmt 1'),
    create('private', [1, 3, 6, 1, 4], 'root', 'internet 4'),
    create('enterprises', [1, 3, 6, 1, 4, 1], 'root', 'private 1'),
    create('experimental', [1, 3, 6, 1, 3], 'root', 'internet 3')
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

  let changed = true
  let iterations = 0
  while (changed && iterations < 20) {
    changed = false
    iterations++
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
  const rootNodes = createStandardRootNodes()
  for (const n of rootNodes) {
    nodeMap.set(n.name, n)
    allNodes.push(n)
  }
  for (const module of modules) {
    for (const node of module.nodes) {
      if (!nodeMap.has(node.name)) nodeMap.set(node.name, node)
      allNodes.push(node)
    }
  }
  buildRelationships(allNodes, nodeMap)

  // Dedup
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

  // Redirect
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

  // Orphan filter
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

// === Scenario 1: ONLY ADD directory (no BASE-MIB) ===
counter = 0
const bert = parseModule(fs.readFileSync(BERT, 'utf-8'), 'BERT')
const clocke = parseModule(fs.readFileSync(CLOCKE, 'utf-8'), 'CLOCKE')
console.log('=== Scenario 1: Only BERT + CLOCKE (no BASE-MIB) ===')
let final = buildMibTree([bert, clocke])
console.log(`Total final nodes: ${final.length}`)
console.log('\nNodes related to raisecomClockEObjects subtree:')
for (const n of final) {
  if (n.name && (n.name.startsWith('raisecomClockE') || n.name === 'raisecomClockEObjects')) {
    console.log(`  ${n.id} ${n.name} parentId=${n.parentId} oid=[${n.oid.join('.')}] children=[${n.children.join(',')}]`)
  }
}

console.log('\n=== Scenario 2: BASE-MIB + BERT + CLOCKE ===')
counter = 0
const base = parseModule(fs.readFileSync(BASE, 'utf-8'), 'BASE')
const bert2 = parseModule(fs.readFileSync(BERT, 'utf-8'), 'BERT')
const clocke2 = parseModule(fs.readFileSync(CLOCKE, 'utf-8'), 'CLOCKE')
final = buildMibTree([base, bert2, clocke2])
console.log(`Total final nodes: ${final.length}`)
console.log('\nraisecomClockEObjects and direct children:')
const clockEObj = final.find(n => n.name === 'raisecomClockEObjects')
if (clockEObj) {
  console.log(`  raisecomClockEObjects ${clockEObj.id} oid=[${clockEObj.oid.join('.')}] children=${JSON.stringify(clockEObj.children)}`)
  for (const cid of clockEObj.children) {
    const c = final.find(n => n.id === cid)
    if (c) console.log(`    └─ ${c.id} ${c.name} parentId=${c.parentId} oid=[${c.oid.join('.')}]`)
  }
}
console.log('\nMisplaced check: are these 3 in the final tree, and what are their parentIds?')
for (const targetName of ['raisecomClockEDeviceMaster', 'raisecomClockESSMEnable', 'raisecomClockESrcStatusTable', 'raisecomClockEPllCmd']) {
  const n = final.find(x => x.name === targetName)
  if (n) console.log(`  ${n.id} ${n.name} parentId=${n.parentId} oidString=${n.oidString}`)
  else console.log(`  ${targetName} NOT in final tree`)
}
