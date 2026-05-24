# Expand SNMPv3 security and transport support

## Goal

Expand the app's SNMPv3 connection support within the practical limits of the current `net-snmp` dependency, while keeping all existing v1/v2c/v3 profiles compatible and making unsupported advanced capabilities explicit instead of pretending they work.

This task follows the confirmed conservative MVP strategy from `goal.md`: prefer stable capabilities exposed by `net-snmp`, add adapter/helper boundaries for future growth, and avoid a full SNMP stack rewrite.

## What I Already Know

- SNMP config types live in `src/main/snmp/types.ts`.
- SNMP session creation and protocol mapping live in `src/main/snmp/client.ts`.
- Connection UI and profile save/load flows live in `src/renderer/src/components/Toolbar.tsx` and `src/renderer/src/stores/appStore.ts`.
- Preload and renderer global API types carry `SnmpConfig` across process boundaries.
- Current support is v1/v2c/v3, v3 security levels, MD5/SHA, DES/AES, UDP IPv4 transport.

## Requirements

- Inspect the locally installed `net-snmp` package to determine actual supported auth protocols, privacy protocols, and transport options.
- Expose supported SNMPv3 auth and privacy options through a single mapping/helper layer.
- Preserve old `SnmpConfig` compatibility through normalization defaults.
- Add type structure for transport selection and IP family where supported or needed for future extension.
- Add IPv6 support if `net-snmp` supports it through current session options.
- Clearly mark or reject unsupported options instead of silently falling back to weaker security.
- Connection settings UI must show available options clearly without making the dialog chaotic.
- Profile save/load must remain compatible with old profiles.
- Error messages should distinguish at least:
  - unsupported auth protocol
  - unsupported privacy protocol
  - unsupported transport or IP family
  - ordinary SNMP timeout / auth / privacy failures from the underlying library

## Acceptance Criteria

- [ ] Existing v1/v2c/v3 profiles continue to load through `normalizeSnmpConfig`.
- [ ] SNMPv3 auth/priv options are generated from a central capability/mapping definition.
- [ ] Session creation validates unsupported auth/priv/transport selections before creating a session.
- [ ] Supported SHA-2 / AES-192 / AES-256 / 3DES options are exposed if the installed `net-snmp` package provides them.
- [ ] IPv6 transport is supported if the installed package supports it.
- [ ] UI can save and load new security/transport settings in profiles.
- [ ] Tests cover config normalization, protocol mapping, and unsupported option failures.
- [ ] Existing SNMP GET / SET / WALK / BULK WALK code paths do not regress.

## Definition Of Done

- Tests added or updated for config normalization and SNMP option mapping.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes because SNMP config types cross main/preload/renderer.
- Trellis quality check is run after implementation.
- Work is committed before `trellis-finish-work`.
- `trellis-finish-work` is run after the work commit.
- Commits are pushed to GitHub, using temporary `127.0.0.1:7897` Git proxy only if network push fails.

## Technical Approach

1. Inspect local `net-snmp` exports and package code for protocol constants and transport support.
2. Create a small SNMP options/capabilities helper in the main SNMP layer.
3. Extend `SnmpConfig` with conservative transport/IP-family fields while preserving old profile compatibility.
4. Update `createSession` to validate and map options through the helper.
5. Update `normalizeSnmpConfig` and Toolbar controls.
6. Add targeted tests for supported and unsupported option mapping.
7. Keep unsupported TLS/DTLS/TSM/DOCSIS features out of the UI unless represented as disabled/future-only text.

## Decision (ADR-lite)

**Context**: Professional MIB browsers support many SNMPv3 security and transport variants, but this project currently relies on the Node `net-snmp` package.

**Decision**: Expand only the stable capabilities exposed by the installed library and introduce an adapter/helper boundary for future transport/security expansion. Unsupported capabilities get explicit validation errors or are omitted from the selectable UI.

**Consequences**:

- Existing SNMP functionality remains low-risk.
- Users get clearer SNMPv3 options where the library supports them.
- Future replacement or augmentation of `net-snmp` is easier because mapping logic is centralized.
- TLS/DTLS/TSM and other advanced enterprise features remain future work.

## Out Of Scope

- SNMPv3 TSM.
- TLS / DTLS.
- DOCSIS Diffie-Hellman.
- A self-written SNMP protocol stack.
- Cross-platform certificate management.
- Trap/Inform console, Agent Simulator, realtime graphs, or global UI redesign.

## Technical Notes

- Do not silently downgrade unsupported auth/priv protocols to MD5/DES.
- Use explicit validation errors for unsupported config values.
- Keep SNMP operation cancellation/session cleanup behavior unchanged.
- Follow `.trellis/spec/backend/snmp-guidelines.md` for SNMP operation contracts.
