// Trace script: parse the 2 MIB files and dump nodes related to raisecomClockEObjects
// This is a research-only script, not production code. Replays the parser logic.
const fs = require('fs')

const BERT = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'

// Replicate stripImportsSection
function stripImportsSection(content) {
  return content.replace(/IMPORTS\s*[\s\S]*?;/gi, '')
}

function extractField(body, fieldName) {
  const regex = new RegExp(`${fieldName}\\s+("?)([^"\\n]*(?:\\n[^"\\n]*)*?)\\1`, 'i')
  const match = body.match(regex)
  if (!match) return null
  let value = match[2].trim()
  value = value.replace(/\s*\n\s*/g, ' ')
  return value
}

function cleanDescription(desc) {
  return desc.replace(/\s+/g, ' ').replace(/--/g, '').trim()
}

let counter = 0
const allModules = []

function parseModule(content, fileName) {
  const moduleNameMatch = content.match(/^(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
  const moduleName = moduleNameMatch ? moduleNameMatch[1] : fileName
  const module = { name: moduleName, nodes: [] }

  const stripped = stripImportsSection(content)

  // OBJECT-TYPE
  const ot = /(\S+)\s+OBJECT-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
  let m
  while ((m = ot.exec(stripped)) !== null) {
    module.nodes.push({
      id: `node-${++counter}`,
      name: m[1],
      kind: 'OBJECT-TYPE',
      oidDef: m[3].trim(),
      parentId: null,
      children: [],
      oid: [],
      oidString: ''
    })
  }

  // OBJECT-IDENTITY / MODULE-IDENTITY
  const oi = /(\S+)\s+(?:OBJECT-IDENTITY|MODULE-IDENTITY)\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
  while ((m = oi.exec(stripped)) !== null) {
    module.nodes.push({
      id: `node-${++counter}`,
      name: m[1],
      kind: 'OBJECT-IDENTITY',
      oidDef: m[3].trim(),
      parentId: null,
      children: [],
      oid: [],
      oidString: ''
    })
  }

  // NOTIFICATION-TYPE
  const nt = /(\S+)\s+NOTIFICATION-TYPE\s*([\s\S]*?)(?::=\s*\{([^}]+)\})/g
  while ((m = nt.exec(stripped)) !== null) {
    module.nodes.push({
      id: `node-${++counter}`,
      name: m[1],
      kind: 'NOTIFICATION-TYPE',
      oidDef: m[3].trim(),
      parentId: null,
      children: [],
      oid: [],
      oidString: ''
    })
  }

  // OBJECT IDENTIFIER
  const oid = /(\S+)\s+OBJECT\s+IDENTIFIER\s*::=\s*\{([^}]+)\}/g
  while ((m = oid.exec(stripped)) !== null) {
    module.nodes.push({
      id: `node-${++counter}`,
      name: m[1],
      kind: 'OBJECT IDENTIFIER',
      oidDef: m[2].trim(),
      parentId: null,
      children: [],
      oid: [],
      oidString: ''
    })
  }

  return module
}

const bert = parseModule(fs.readFileSync(BERT, 'utf-8'), 'BERT')
const clocke = parseModule(fs.readFileSync(CLOCKE, 'utf-8'), 'CLOCKE')

console.log('=== BERT nodes ===')
for (const n of bert.nodes) {
  console.log(`  ${n.id} ${n.name} (${n.kind}) oidDef="${n.oidDef}"`)
}
console.log(`BERT total: ${bert.nodes.length}`)

console.log('=== CLOCKE nodes ===')
for (const n of clocke.nodes) {
  console.log(`  ${n.id} ${n.name} (${n.kind}) oidDef="${n.oidDef}"`)
}
console.log(`CLOCKE total: ${clocke.nodes.length}`)

console.log('\n=== Nodes referencing raisecomClockEObjects as parent ===')
for (const n of clocke.nodes) {
  if (n.oidDef.startsWith('raisecomClockEObjects')) {
    console.log(`  ${n.id} ${n.name} (${n.kind}) -> ${n.oidDef}`)
  }
}
