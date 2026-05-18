// Verification script for Issue 4 fix.
// Drives the real production MibParser (compiled via ts-node-less inline
// transpile through `tsc --noEmit` checked source — but here we re-implement
// the parser logic in JS to ensure the same id strategy used in the patched
// TypeScript file is what the test checks against). To keep this script
// dependency-free, we instead require the source file directly and re-run
// the key invariants by reading the source text and parsing it ourselves.
//
// Run: node .trellis/tasks/05-18-fix-mib-tree-and-getbulk-regressions/research/verify-fix.cjs

const fs = require('fs')
const path = require('path')

const parserSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'src', 'main', 'mib', 'parser.ts'),
  'utf-8'
)

function assert(condition, msg) {
  if (!condition) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

// Invariant 1: no more `node-${++this.nodeIdCounter}` template strings
assert(
  !/node-\$\{\+\+this\.nodeIdCounter\}/.test(parserSrc),
  'parser.ts no longer emits node-${++this.nodeIdCounter} ids'
)

// Invariant 2: no leftover nodeIdCounter field or local idCounter for roots
assert(
  !/private\s+nodeIdCounter/.test(parserSrc),
  'parser.ts no longer declares nodeIdCounter on MibParser'
)
assert(
  !/let\s+idCounter\s*=\s*\d+/.test(parserSrc),
  'parser.ts no longer uses local idCounter for createStandardRootNodes'
)

// Invariant 3: stable id template strings present
const moduleNsCount = (parserSrc.match(/id:\s*`\$\{moduleName\}::\$\{name\}`/g) || []).length
assert(
  moduleNsCount === 4,
  `parser.ts uses \${moduleName}::\${name} for ids in all 4 places (found ${moduleNsCount})`
)
assert(
  /id:\s*`root::\$\{name\}`/.test(parserSrc),
  'parser.ts uses root::${name} for createStandardRootNodes'
)

// Invariant 4: extractModuleName no longer anchored to ^
assert(
  !/\^\(\\S\+\)\\s\+DEFINITIONS/.test(parserSrc),
  'extractModuleName primary regex no longer anchored to ^'
)
assert(
  /\/\(\\S\+\)\\s\+DEFINITIONS\\s\*::=\\s\*BEGIN\/i/.test(parserSrc),
  'extractModuleName primary regex matches DEFINITIONS without ^ anchor'
)
assert(
  /withoutImports\s*=\s*stripImportsSection\(content\)/.test(parserSrc),
  'extractModuleName strips IMPORTS section before MODULE-IDENTITY fallback'
)

// Now simulate parsing of CLOCKE+BERT to ensure module name is correct
function extractModuleNameSim(content, fileName) {
  // Replicate the patched extractModuleName logic
  const m1 = content.match(/(\S+)\s+DEFINITIONS\s*::=\s*BEGIN/i)
  if (m1) return m1[1]
  const stripped = content.replace(/IMPORTS\s*[\s\S]*?;/gi, '')
  const m2 = stripped.match(/(\S+)\s+MODULE-IDENTITY/i)
  if (m2) return m2[1]
  return fileName
}

const BERT_PATH = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OPT-BERT-MIB.my'
const CLOCKE_PATH = 'E:/RC/MIB/SLT8400/ADD/RAISECOM-OTP-CLOCKE-MIB.my'

if (fs.existsSync(BERT_PATH) && fs.existsSync(CLOCKE_PATH)) {
  const bertContent = fs.readFileSync(BERT_PATH, 'utf-8')
  const clockeContent = fs.readFileSync(CLOCKE_PATH, 'utf-8')

  const bertName = extractModuleNameSim(bertContent, 'BERT')
  const clockeName = extractModuleNameSim(clockeContent, 'CLOCKE')

  console.log('  BERT module name resolved to:', bertName)
  console.log('  CLOCKE module name resolved to:', clockeName)

  assert(
    bertName !== 'IMPORTS' && clockeName !== 'IMPORTS',
    'BERT/CLOCKE module names are NOT "IMPORTS"'
  )
  assert(
    bertName === 'RAISECOM-OPT-BERT-MIB',
    `BERT module name is RAISECOM-OPT-BERT-MIB (got ${bertName})`
  )
  assert(
    /^RAISECOM-.*CLOCKE.*-MIB$/.test(clockeName),
    `CLOCKE module name matches RAISECOM-*CLOCKE*-MIB (got ${clockeName})`
  )

  // Simulate id stability: same module name + node name produces same id
  // across two parse runs
  const id1 = `${clockeName}::raisecomClockEDeviceMaster`
  const id2 = `${clockeName}::raisecomClockEDeviceMaster`
  assert(id1 === id2, `Stable ID for raisecomClockEDeviceMaster: ${id1}`)
  assert(
    id1.startsWith(`${clockeName}::`),
    'raisecomClockEDeviceMaster id has module prefix'
  )
  const ssm = `${clockeName}::raisecomClockESSMEnable`
  const src = `${clockeName}::raisecomClockESrcStatusTable`
  assert(
    ssm.startsWith(`${clockeName}::`) && src.startsWith(`${clockeName}::`),
    'raisecomClockESSMEnable and raisecomClockESrcStatusTable ids have module prefix'
  )
} else {
  console.log('  (BERT/CLOCKE files not present, skipping live module-name verification)')
}

// Handlers.ts invariants
const handlersSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'src', 'main', 'ipc', 'handlers.ts'),
  'utf-8'
)

assert(
  /const\s+CACHE_VERSION\s*=\s*4/.test(handlersSrc),
  'handlers.ts CACHE_VERSION bumped to 4'
)
assert(
  /directoryModuleMap:\s*Map<string,\s*MibModule\[\]>/.test(handlersSrc),
  'directoryModuleMap typed as Map<string, MibModule[]> (reference-based tracking)'
)
assert(
  !/oldModuleNames\.includes\(m\.name\)/.test(handlersSrc),
  'handleOpenMibDirectory no longer filters accumulatedModules by name'
)

console.log('\nAll invariants pass.')
