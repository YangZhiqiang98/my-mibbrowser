# Research: SNMP Protocol Implementation Libraries

- **Query**: Research SNMP protocol implementation libraries for MIB Browser desktop application
- **Scope**: External (Python, JavaScript/Node.js, Rust, C/C++ libraries)
- **Date**: 2026-05-15

---

## Executive Summary

This report evaluates SNMP libraries across four language ecosystems for building an MIB Browser desktop application. The recommended approach depends on the chosen tech stack:

- **Electron + Node.js**: Use `net-snmp` (npm) - most mature, full SNMPv3 support
- **Tauri + Rust**: Use `snmp2` crate - actively maintained, async support
- **Python backend**: Use `pysnmp` (v7.x) - pure Python, comprehensive features
- **C/C++ integration**: Use `net-snmp` C library - industry reference implementation

---

## 1. Python Libraries

### 1.1 pysnmp (Primary Recommendation for Python)

**Package**: `pysnmp` (PyPI)
**Current Version**: 7.1.26
**License**: BSD-2-Clause
**Repository**: https://github.com/lextudio/pysnmp
**Homepage**: https://pysnmp.com

**Features**:
- Pure Python implementation (no C dependencies)
- Full SNMPv1/v2c/v3 support
- SNMPv3 USM (User-based Security Model) with MD5/SHA authentication and DES/AES encryption
- All SNMP operations: GET, GETNEXT, GETBULK, SET, TRAP, INFORM
- Async support (asyncio)
- MIB parsing via companion library `pysmi`
- Cross-platform (Windows/Linux/macOS)

**Dependencies**:
- `pyasn1` >= 0.6.3 (ASN.1 codec)
- `pysmi` (optional, for MIB parsing)

**Community Activity**:
- Latest release: 2026 (v7.1.26)
- Active maintenance by LeXtudio Inc.
- 70+ versions released
- Python 3.10-3.14 support

**Performance**:
- Pure Python, moderate performance
- Suitable for desktop applications
- Async support for concurrent operations

**Usage Complexity**: Medium
- Well-documented API
- Comprehensive examples available
- Learning curve for SNMPv3 configuration

**Cross-Platform**: Excellent (pure Python)

**Code Example**:
```python
from pysnmp.hlapi.v3arch.asyncio import *

async def get_snmp_value(host, community, oid):
    errorIndication, errorStatus, errorIndex, varBinds = await get_cmd(
        SnmpEngine(),
        CommunityData(community),
        UdpTransportTarget((host, 161)),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )
    
    if errorIndication:
        print(errorIndication)
    elif errorStatus:
        print(f'{errorStatus.prettyPrint()} at {errorIndex}')
    else:
        for varBind in varBinds:
            print(' = '.join([x.prettyPrint() for x in varBind]))
```

**Notes**:
- Version 7.x is the current maintained version (LeXtudio fork)
- `pysnmp-lextudio` package is deprecated, use `pysnmp` instead
- Includes built-in MIB loading capabilities

---

### 1.2 easysnmp (Alternative)

**Package**: `easysnmp` (PyPI)
**Current Version**: 0.2.6
**License**: BSD
**Repository**: https://github.com/easysnmp/easysnmp

**Features**:
- Python bindings for net-snmp C library
- SNMPv1/v2c/v3 support
- Higher-level API than raw net-snmp

**Dependencies**:
- net-snmp C library (system dependency)
- Python C extension compilation required

**Community Activity**:
- Latest release: 2023
- Moderate maintenance
- Smaller community than pysnmp

**Performance**: High (C backend)
- Better performance than pure Python solutions
- Requires C compilation

**Usage Complexity**: Low-Medium
- Simplified API compared to raw net-snmp
- Installation can be complex (C dependencies)

**Cross-Platform**: Limited (requires net-snmp C library)
- Linux: Good support
- macOS: Moderate
- Windows: Requires manual net-snmp installation

---

### 1.3 pysmi (MIB Parser Companion)

**Package**: `pysmi` (PyPI)
**Current Version**: 2.0.0
**License**: BSD

**Purpose**: SMI/MIB parser and compiler
- Parses SMIv1/v2 .my files
- Converts to JSON, MIB, or Python formats
- Companion to pysnmp for MIB handling

**Usage**:
```python
from pysmi.reader import FileReader
from pysmi.parser import SmiParser
from pysmi.codegen import JsonCodeGen
from pysmi.compiler import MibCompiler

# Parse MIB file to JSON
```

---

## 2. JavaScript/Node.js Libraries

### 2.1 net-snmp (Primary Recommendation for Node.js)

**Package**: `net-snmp` (npm)
**Current Version**: 3.26.3
**License**: MIT
**Repository**: https://github.com/markabrahams/node-net-snmp
**Created**: 2013-01-15
**Last Updated**: 2026-04-21

**Features**:
- Full SNMPv1/v2c/v3 support
- SNMPv3 USM with MD5/SHA authentication and DES/AES encryption
- All SNMP operations: GET, GETNEXT, GETBULK, SET, TRAP, INFORM
- MIB parsing and module store
- OID translation (numeric <-> named)
- SNMP agent implementation
- AgentX subagent support
- IPv4 and IPv6 support
- Notification receiver

**RFC Compliance**:
- RFC 1098 (SNMPv1)
- RFC 1155 (SMI)
- RFC 2578 (SMIv2)
- RFC 3413 (SNMP Applications)
- RFC 3414 (USM for SNMPv3)
- RFC 3416 (Protocol Operations)
- RFC 3417 (Transport Mappings)
- RFC 3826 (AES for SNMP USM)

**Dependencies**:
- `asn1-ber` ^1.2.1
- `smart-buffer` ^4.1.0

**Community Activity**:
- 174 versions released
- Active maintenance (updated 3 weeks ago)
- 13+ years of development
- TypeScript type definitions available (`@types/net-snmp`)

**Performance**: High
- Event-driven architecture
- Unlimited parallelism
- Optimized for large-scale monitoring

**Usage Complexity**: Medium
- Comprehensive API
- Well-documented with examples
- Good error handling

**Cross-Platform**: Excellent (pure JavaScript)

**Code Example**:
```javascript
const snmp = require('net-snmp');

// Create session
const session = snmp.createSession('192.168.1.1', 'public');

// GET request
const oids = ['1.3.6.1.2.1.1.5.0', '1.3.6.1.2.1.1.6.0'];

session.get(oids, (error, varbinds) => {
    if (error) {
        console.error(error);
    } else {
        for (const varbind of varbinds) {
            if (snmp.isVarbindError(varbind)) {
                console.error(snmp.varbindError(varbind));
            } else {
                console.log(`${varbind.oid} = ${varbind.value}`);
            }
        }
    }
    session.close();
});

// SNMPv3 with authentication and encryption
const session3 = snmp.createSession('192.168.1.1', null, {
    version: snmp.Version3,
    userName: 'myUser',
    authProtocol: snmp.AuthProtocols.sha,
    authKey: 'myAuthKey',
    privProtocol: snmp.PrivProtocols.aes,
    privKey: 'myPrivKey'
});
```

**Notes**:
- Most mature Node.js SNMP library
- Full-featured implementation
- Active community support
- TypeScript support available

---

### 2.2 snmp-native (Lightweight Alternative)

**Package**: `snmp-native` (npm)
**Current Version**: 1.2.0
**License**: MIT
**Repository**: https://github.com/calmh/node-snmp-native
**Created**: 2019-06-04
**Last Updated**: 2019-06-04

**Features**:
- SNMPv2c only (no SNMPv1 or SNMPv3)
- Get, GetNext, Set operations
- 64-bit data type support
- High performance, unlimited parallelism
- No external dependencies

**Limitations**:
- No SNMPv3 support (no authentication/encryption)
- No MIB parsing
- Opinionated design (intentionally excludes older versions)

**Performance**: Very High
- Optimized for large-scale monitoring
- No arbitrary limits on parallelism
- Tested with tens of thousands of counters

**Usage Complexity**: Low
- Simple, focused API
- Minimal configuration
- Well-documented

**Cross-Platform**: Excellent (pure JavaScript)

**Best For**: SNMPv2c-only environments where performance is critical

---

### 2.3 snmpjs (Agent-Focused)

**Package**: `snmpjs` (npm)
**Current Version**: 0.1.8
**License**: Proprietary
**Repository**: https://github.com/joyent/node-snmpjs

**Features**:
- SNMP agent toolkit
- Create SNMP agents and management applications
- SNMPv2c support
- Scalar and table data providers

**Limitations**:
- Focused on agent implementation, not client operations
- Limited documentation
- Older package (Joyent legacy)

**Best For**: Building SNMP agents, not client applications

---

### 2.4 @gibme/snmp (Modern Wrapper)

**Package**: `@gibme/snmp` (npm)
**Current Version**: 22.0.0
**License**: MIT

**Features**:
- Async/await wrapper around snmp-native
- Modern JavaScript API
- TypeScript support
- Static and instance methods

**Dependencies**:
- Node.js >= 22
- Built on snmp-native

**Usage Complexity**: Low
- Modern async/await API
- Simplified interface
- TypeScript definitions included

**Best For**: Modern Node.js applications preferring async/await patterns

---

## 3. Rust Libraries

### 3.1 snmp2 (Primary Recommendation for Rust)

**Crate**: `snmp2` (crates.io)
**Current Version**: Active (last updated 2026-03-01)
**Downloads**: 941,236
**Repository**: https://github.com/roboplc/snmp2

**Features**:
- SNMPv1/v2/v3 support
- Sync and async client libraries
- Trap support
- MIB support
- USM authentication and encryption

**Community Activity**:
- Actively maintained
- Regular updates
- Growing adoption

**Performance**: High
- Native Rust performance
- Async support (tokio)
- Memory safe

**Usage Complexity**: Medium
- Rust learning curve
- Comprehensive API
- Good documentation

**Cross-Platform**: Excellent (Rust standard)

**Best For**: Tauri applications, high-performance requirements

---

### 3.2 rasn-snmp (ASN.1 Framework)

**Crate**: `rasn-snmp` (crates.io)
**Downloads**: 259,516
**Last Updated**: 2026-04-24

**Features**:
- Data types for SNMP protocol
- Built on rasn ASN.1 framework
- No_std support
- Type-safe SNMP message handling

**Usage**:
- Low-level SNMP message construction/parsing
- Requires additional client implementation
- Part of larger rasn ecosystem

**Best For**: Building custom SNMP implementations or when type safety is paramount

---

### 3.3 snmp-parser (Protocol Parser)

**Crate**: `snmp-parser` (crates.io)
**Downloads**: 1,408,760
**Repository**: https://github.com/rusticata/snmp-parser.git
**Last Updated**: 2025-02-10

**Features**:
- SNMP protocol parser
- Based on nom parser combinator
- Supports SNMPv1/v2c/v3 messages
- Lightweight, focused on parsing

**Limitations**:
- Parser only, not a full client library
- No built-in transport or session management

**Best For**: Protocol analysis, packet inspection, custom implementations

---

### 3.4 snmp_usm (USM Implementation)

**Crate**: `snmp_usm` (crates.io)
**Downloads**: 36,022
**Repository**: https://github.com/davedufresne/modern_snmp
**Last Updated**: 2023-03-16

**Features**:
- User-based Security Model (USM) for SNMPv3
- Authentication algorithms (MD5, SHA)
- Privacy algorithms (DES, AES)
- Focused security implementation

**Best For**: Adding SNMPv3 security to custom implementations

---

### 3.5 snmp (Legacy)

**Crate**: `snmp` (crates.io)
**Downloads**: 71,893
**Repository**: https://github.com/hroi/rust-snmp
**Last Updated**: 2017-04-05

**Status**: Unmaintained (last updated 2017)
**Not Recommended** for new projects

---

## 4. C/C++ Libraries

### 4.1 net-snmp (Industry Standard)

**Library**: net-snmp
**Website**: http://www.net-snmp.org/
**License**: BSD-like
**Language**: C

**Features**:
- Reference implementation for SNMP
- Complete SNMPv1/v2c/v3 support
- USM authentication and encryption
- All SNMP operations
- MIB parsing and management
- Command-line tools (snmpget, snmpwalk, snmptranslate, etc.)
- SNMP agent framework
- AgentX subagent support
- Extensive MIB collection

**Components**:
- `libnetsnmp` - Core SNMP library
- `libnetsnmpagent` - SNMP agent library
- `libnetsnmphelpers` - Helper utilities
- `snmpd` - SNMP daemon
- `snmptrapd` - Trap receiver daemon
- Command-line tools suite

**Community Activity**:
- Industry standard for 20+ years
- Active maintenance
- Widely deployed in production
- Extensive documentation

**Performance**: Very High
- Optimized C implementation
- Battle-tested in production
- Low memory footprint

**Usage Complexity**: High
- Complex C API
- Steep learning curve
- Requires understanding of SNMP internals
- Memory management considerations

**Cross-Platform**: Good
- Linux: Excellent support
- macOS: Good support
- Windows: Supported but requires compilation

**Integration Options**:
1. **Direct C integration**: Link against libnetsnmp
2. **Python bindings**: easysnmp (Python wrapper)
3. **Node.js bindings**: Available but less common

**Command-Line Tools**:
```bash
# GET request
snmpget -v 2c -c public 192.168.1.1 sysDescr.0

# WALK request
snmpwalk -v 2c -c public 192.168.1.1

# SNMPv3 with authentication
snmpget -v 3 -l authPriv -u myUser -a SHA -A myAuthKey -x AES -X myPrivKey 192.168.1.1 sysDescr.0

# MIB translation
snmptranslate -IR sysDescr
# Output: SNMPv2-MIB::sysDescr
```

**Best For**: Enterprise applications, system integration, when C performance is required

---

## 5. Comparison Matrix

### Feature Comparison

| Feature | pysnmp (Python) | net-snmp (Node.js) | snmp2 (Rust) | net-snmp (C) |
|---------|-----------------|---------------------|--------------|--------------|
| SNMPv1 | Yes | Yes | Yes | Yes |
| SNMPv2c | Yes | Yes | Yes | Yes |
| SNMPv3 | Yes | Yes | Yes | Yes |
| USM Auth | MD5/SHA | MD5/SHA | MD5/SHA | MD5/SHA |
| Encryption | DES/AES | DES/AES | DES/AES | DES/AES |
| Async Support | Yes (asyncio) | Yes (EventEmitter) | Yes (tokio) | No (sync) |
| MIB Parsing | Via pysmi | Built-in | Limited | Built-in |
| Agent Support | No | Yes | No | Yes |
| Trap Support | Yes | Yes | Yes | Yes |
| Cross-Platform | Excellent | Excellent | Excellent | Good |

### Community & Maintenance

| Library | Latest Release | Last Updated | Maintenance Status |
|---------|----------------|--------------|-------------------|
| pysnmp | 7.1.26 | 2026 | Active (LeXtudio) |
| net-snmp (npm) | 3.26.3 | 2026-04 | Active |
| snmp-native | 1.2.0 | 2019 | Stable (minimal) |
| snmp2 (Rust) | Active | 2026-03 | Active |
| net-snmp (C) | Active | Ongoing | Industry Standard |

### Performance Ranking

1. **net-snmp (C)** - Highest performance, lowest overhead
2. **snmp2 (Rust)** - High performance, memory safe
3. **net-snmp (Node.js)** - Good performance, event-driven
4. **pysnmp (Python)** - Moderate performance, pure Python

### Ease of Use Ranking

1. **@gibme/snmp (Node.js)** - Modern async/await API
2. **net-snmp (Node.js)** - Comprehensive, well-documented
3. **pysnmp (Python)** - Pythonic API, good docs
4. **snmp2 (Rust)** - Rust learning curve
5. **net-snmp (C)** - Complex C API

---

## 6. Recommendations

### For Electron + React + TypeScript (Recommended)

**Primary**: `net-snmp` (npm)
- Most mature Node.js SNMP library
- Full SNMPv3 support with USM
- TypeScript definitions available (`@types/net-snmp`)
- MIB parsing built-in
- Active maintenance and community

**Secondary**: `@gibme/snmp`
- Modern async/await wrapper
- TypeScript-first
- Simpler API for basic operations

**MIB Parsing**: Built-in `net-snmp` MIB support or `mib-parser` npm package

### For Tauri + React + TypeScript

**Primary**: `snmp2` crate
- Full SNMPv1/v2/v3 support
- Async support (tokio)
- Actively maintained
- Rust performance and safety

**Alternative**: `rasn-snmp` + custom implementation
- More control over implementation
- Type-safe ASN.1 handling
- Requires more development effort

### For Python Backend

**Primary**: `pysnmp` v7.x
- Pure Python, no C dependencies
- Full SNMPv3 support
- Async support (asyncio)
- Companion `pysmi` for MIB parsing

**Alternative**: `easysnmp`
- Higher performance (C backend)
- Requires net-snmp C library installation
- Platform-dependent installation

### For C/C++ Integration

**Primary**: `net-snmp` C library
- Industry standard reference implementation
- Complete feature set
- Extensive tooling
- Complex but powerful

---

## 7. Implementation Considerations

### SNMPv3 Security Configuration

All recommended libraries support SNMPv3 with:
- **Authentication**: MD5 or SHA algorithms
- **Privacy/Encryption**: DES or AES algorithms
- **Security Levels**:
  - noAuthNoPriv: No authentication, no encryption
  - authNoPriv: Authentication only
  - authPriv: Authentication + encryption

### MIB File Handling

For MIB parsing, consider:
1. **Built-in support**: net-snmp (Node.js, C) includes MIB parsing
2. **Companion libraries**: pysmi (Python)
3. **Separate parsers**: mib-parser (npm), snmp-parser (Rust)

### Error Handling

All libraries provide:
- Timeout handling
- Community/credential validation
- OID validation
- Protocol error reporting

### Performance Optimization

For high-volume SNMP operations:
- Use async/concurrent requests
- Implement connection pooling
- Cache MIB definitions
- Batch OID requests where possible

---

## 8. References

### Official Documentation

- pysnmp: https://pysnmp.com/
- net-snmp (npm): https://github.com/markabrahams/node-net-snmp
- net-snmp (C): http://www.net-snmp.org/
- snmp2 (Rust): https://github.com/roboplc/snmp2

### RFCs

- RFC 1155: SMIv1
- RFC 2578: SMIv2
- RFC 3414: USM for SNMPv3
- RFC 3826: AES for SNMP USM

### Package Registries

- PyPI: https://pypi.org/project/pysnmp/
- npm: https://www.npmjs.com/package/net-snmp
- crates.io: https://crates.io/crates/snmp2

---

*Research Date: 2026-05-15*
*Target Application: MIB Browser Desktop Application*
*Recommended Tech Stack: Electron + React + TypeScript + net-snmp*
