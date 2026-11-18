# Read/write community split for v1/v2c

## Goal

Device Connection Settings currently exposes a single community string used for
every v1/v2c request. Split it into a read community and a write community so
read operations (GET / GETNEXT / GETBULK / WALK / BULK_WALK) and write
operations (SET) can authenticate with different community strings.

## Requirements

- New `writeCommunity` field on `SnmpConfig`; existing `community` stays the
  read community (saved profiles, last-snmp-config, and IPC contract stay
  backward compatible via `normalizeSnmpConfig`).
- Defaults: read community `public`, write community `private`.
- Read operations use the read community; SET uses the write community. Only
  v1/v2c sessions are affected — SNMPv3 ignores community strings entirely.
- An empty/whitespace write community falls back to the read community.
- Device Connection Settings shows both fields (v1/v2c only): "Read Community"
  and "Write Community".
- `writeCommunity` is encrypted at rest like `community` (profile safeStorage).

## Acceptance Criteria

- [ ] `SnmpConfig` carries `writeCommunity`; typecheck passes.
- [ ] v1/v2c SET creates its net-snmp session with the write community; read
      operations still use the read community (unit-tested via mocked
      `net-snmp.createSession` capturing the community argument).
- [ ] Toolbar renders both inputs with defaults public / private.
- [ ] Saved profiles round-trip `writeCommunity` encrypted; legacy profiles
      without it normalize to `private`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all pass.

## Notes

- Single central switch point: `createSession()` in `src/main/snmp/client.ts`
  gains a read/write purpose so every caller path benefits.
- Trap receiver community config is a separate concern (own config type) and
  is intentionally untouched.
