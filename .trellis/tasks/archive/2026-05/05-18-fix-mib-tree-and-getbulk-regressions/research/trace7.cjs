// Simulate user's ACTUAL scenario: cache + fresh ADD load.
const fs = require('fs')
const CACHE_FILE = 'D:/learn/mib-cache/mib-cache-09_ros6_x_6e32ce08.json'
const ADD_CACHE = 'D:/learn/mib-cache/mib-cache-ADD_7977868a.json'
const BERT = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'

function stripImportsSection(c) { return c.replace(/IMPORTS\s*[\s\S]*?;/gi, '') }
class Parser {
  constructor() { this.counter = 0 }
  parseModule(content, fileName) {
    const m = content.match(/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
    let moduleName = m ? m[1] : null
    if (!moduleName) {
      const im = content.match(/(\S+)\s+MODULE-IDENTITY/i)
      moduleName = im ? im[1] : fileName
    }
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

// Simulate: load cache file → accumulatedModules
function loadMibCache(cacheFiles) {
  let accumulatedModules = []
  for (const file of cacheFiles) {
    const cache = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (cache.version !== 3) continue
    const existingNames = new Set(accumulatedModules.map(m => m.name))
    for (const mod of cache.modules) {
      if (!existingNames.has(mod.name)) {
        accumulatedModules.push(mod)
      }
    }
  }
  return accumulatedModules
}

// Step 1: load both cache files (simulating app startup)
let accumulatedModules = loadMibCache([CACHE_FILE, ADD_CACHE])
console.log(`Step 1: After loadMibCache, accumulatedModules count = ${accumulatedModules.length}`)
console.log(`Counts of module names:`)
const counts = {}
for (const m of accumulatedModules) counts[m.name] = (counts[m.name] || 0) + 1
const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 10)
for (const [n, c] of sorted) console.log(`  ${n}: ${c}`)

// Step 2: simulate user loading ADD directory (which has same path 'E:\RC\MIB\SLT8400\ADD' as ADD cache)
// directoryModuleMap should have ['IMPORTS'] from cache restore.
const dirPath = 'E:\\RC\\MIB\\SLT8400\\ADD'
const oldModuleNames = ['IMPORTS']  // From restored directoryModuleMap

// Fresh parse
const parser = new Parser()
const bert = parser.parseModule(fs.readFileSync(BERT, 'utf-8'), 'RAISECOM-OPT-BERT-MIB.my')
const clocke = parser.parseModule(fs.readFileSync(CLOCKE, 'utf-8'), 'RAISECOM-OTP-CLOCKE-MIB.my')
console.log(`\nStep 2: Fresh parse: BERT (name=${bert.name}, ${bert.nodes.length} nodes), CLOCKE (name=${clocke.name}, ${clocke.nodes.length} nodes)`)

// Filter and add (simulating handleOpenMibDirectory)
accumulatedModules = accumulatedModules.filter(m => !oldModuleNames.includes(m.name))
console.log(`Step 3: After filter !'IMPORTS', accumulatedModules count = ${accumulatedModules.length}`)
accumulatedModules = [...accumulatedModules, bert, clocke]
console.log(`Step 4: After add fresh BERT+CLOCKE, accumulatedModules count = ${accumulatedModules.length}`)

// Look at fresh BERT/CLOCKE module names
console.log(`\nBERT module name (after extractModuleName fallback): "${bert.name}"`)
console.log(`CLOCKE module name: "${clocke.name}"`)

// Now collect all nodes that COLLIDE with fresh BERT/CLOCKE ids (1-68)
console.log(`\n=== ID COLLISIONS ===`)
const freshIds = new Set([...bert.nodes, ...clocke.nodes].map(n => n.id))
const collisionsByCachedNode = []
for (const m of accumulatedModules) {
  if (m === bert || m === clocke) continue
  for (const node of m.nodes) {
    if (freshIds.has(node.id)) {
      collisionsByCachedNode.push({ id: node.id, cachedName: node.name, cachedOid: node.oidString, cachedModule: m.name })
    }
  }
}
console.log(`Total cached nodes that collide with fresh ids: ${collisionsByCachedNode.length}`)
// Group by id
const collisionsById = {}
for (const c of collisionsByCachedNode) {
  if (!collisionsById[c.id]) collisionsById[c.id] = []
  collisionsById[c.id].push(c)
}
for (const id of Object.keys(collisionsById).sort((a, b) => parseInt(a.replace('node-', '')) - parseInt(b.replace('node-', '')))) {
  const cached = collisionsById[id]
  const fresh = [...bert.nodes, ...clocke.nodes].find(n => n.id === id)
  console.log(`  ${id}: fresh=${fresh?.name}, cached=[${cached.map(c => c.cachedName + ' (' + c.cachedModule + ')').join(', ')}]`)
}
