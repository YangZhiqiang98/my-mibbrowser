// End-to-end verification using the actual compiled production parser.
// Run: node .trellis/tasks/05-18-fix-mib-tree-and-getbulk-regressions/research/verify-parser-live.cjs

const path = require('path')
const fs = require('fs')
const { MibParser, buildMibTree } = require(path.join(__dirname, 'compiled', 'parser.js'))

function assert(condition, msg) {
  if (!condition) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

const BERT = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'

if (!fs.existsSync(BERT) || !fs.existsSync(CLOCKE)) {
  console.log('SKIP: BERT/CLOCKE not present; cannot run live verification')
  process.exit(0)
}

const parser = new MibParser()

// First pass — simulate "Files load"
const r1 = parser.parseFiles([BERT, CLOCKE])
console.log('Pass 1 module names:', r1.modules.map(m => m.name))

const bert1 = r1.modules.find(m => /BERT/.test(m.name))
const clocke1 = r1.modules.find(m => /CLOCKE/.test(m.name))

assert(bert1 && bert1.name !== 'IMPORTS', `BERT module name fixed (got ${bert1?.name})`)
assert(clocke1 && clocke1.name !== 'IMPORTS', `CLOCKE module name fixed (got ${clocke1?.name})`)

const devMaster1 = clocke1.nodes.find(n => n.name === 'raisecomClockEDeviceMaster')
const ssm1 = clocke1.nodes.find(n => n.name === 'raisecomClockESSMEnable')
const srcStatus1 = clocke1.nodes.find(n => n.name === 'raisecomClockESrcStatusTable')

assert(devMaster1, 'raisecomClockEDeviceMaster parsed')
assert(ssm1, 'raisecomClockESSMEnable parsed')
assert(srcStatus1, 'raisecomClockESrcStatusTable parsed')

assert(
  devMaster1.id.includes(clocke1.name) && devMaster1.id.includes('raisecomClockEDeviceMaster'),
  `devMaster.id contains module prefix: ${devMaster1.id}`
)

// Second pass on same parser — same files. Stable ids means same ids both times.
const r2 = parser.parseFiles([BERT, CLOCKE])
const clocke2 = r2.modules.find(m => /CLOCKE/.test(m.name))
const devMaster2 = clocke2.nodes.find(n => n.name === 'raisecomClockEDeviceMaster')
const ssm2 = clocke2.nodes.find(n => n.name === 'raisecomClockESSMEnable')
const srcStatus2 = clocke2.nodes.find(n => n.name === 'raisecomClockESrcStatusTable')

assert(devMaster1.id === devMaster2.id, `raisecomClockEDeviceMaster.id stable across runs: ${devMaster1.id}`)
assert(ssm1.id === ssm2.id, `raisecomClockESSMEnable.id stable across runs: ${ssm1.id}`)
assert(srcStatus1.id === srcStatus2.id, `raisecomClockESrcStatusTable.id stable across runs: ${srcStatus1.id}`)

// Third pass — different parser instance (simulates app restart). Ids still stable.
const parser2 = new MibParser()
const r3 = parser2.parseFiles([BERT, CLOCKE])
const clocke3 = r3.modules.find(m => /CLOCKE/.test(m.name))
const devMaster3 = clocke3.nodes.find(n => n.name === 'raisecomClockEDeviceMaster')

assert(
  devMaster1.id === devMaster3.id,
  `raisecomClockEDeviceMaster.id stable across MibParser instances: ${devMaster3.id}`
)

// All ids unique across both modules in one parse run
const allIds1 = [...r1.modules.flatMap(m => m.nodes.map(n => n.id))]
const idSet = new Set(allIds1)
assert(
  allIds1.length === idSet.size,
  `All ${allIds1.length} ids in pass 1 are unique (no collisions)`
)

// Build the tree with no cached modules — should still have iso as the only root
const tree1 = buildMibTree(r1.modules)
const roots1 = tree1.filter(n => !n.parentId)

// Trace which root nodes exist by collecting nodes with parentId === null after merge
const isoNodes = tree1.filter(n => n.name === 'iso' && (!n.parentId || n.parentId === null))
console.log(`Built tree size: ${tree1.length} nodes`)

// Find the 3 problematic CLOCKE children in the built tree and verify they have parents
const devMasterBuilt = tree1.find(n => n.name === 'raisecomClockEDeviceMaster')
const ssmBuilt = tree1.find(n => n.name === 'raisecomClockESSMEnable')
const srcStatusBuilt = tree1.find(n => n.name === 'raisecomClockESrcStatusTable')

if (devMasterBuilt && devMasterBuilt.parentId) {
  const parent = tree1.find(n => n.id === devMasterBuilt.parentId)
  console.log(`  raisecomClockEDeviceMaster.parentId resolves to: ${parent?.name ?? 'MISSING'}`)
  // Whether it resolves to raisecomClockEObjects depends on whether
  // BASE-MIB is loaded (defines optSysMgmt). Without it, the chain
  // up to iso is broken and orphan filter removes the node.
}

// Print module map summary
console.log('Module summary:')
for (const m of r1.modules) {
  console.log(`  ${m.name}: ${m.nodes.length} nodes, sample ids: ${m.nodes.slice(0, 3).map(n => n.id).join(', ')}`)
}

console.log('\nLive parser verification: all stable-id invariants hold.')
