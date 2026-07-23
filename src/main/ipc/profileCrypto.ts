import { safeStorage } from 'electron'
import type { SnmpConfig } from '../snmp/types'

/**
 * Minimal surface of Electron's `safeStorage` used for profile encryption.
 * Declared as an interface so unit tests can inject a fake without pulling in
 * the native module.
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

/**
 * SnmpConfig fields that hold secrets and must be encrypted at rest. All three
 * are `string`, which keeps indexed reads/writes below well-typed.
 */
type SensitiveField = 'community' | 'authPassword' | 'privPassword'
const SENSITIVE_FIELDS: SensitiveField[] = ['community', 'authPassword', 'privPassword']

/**
 * Encrypt the sensitive fields of an SNMP config for on-disk storage.
 *
 * When OS-backed encryption is unavailable, the config is stored as plaintext
 * and `encrypted: false` is returned so the loader knows not to attempt
 * decryption (graceful degradation, not a hard failure).
 *
 * Empty fields are left untouched — there is no secret to protect.
 */
export function encryptProfileConfig(
  config: SnmpConfig,
  storage: SafeStorageLike = safeStorage
): { config: SnmpConfig; encrypted: boolean } {
  if (!storage.isEncryptionAvailable()) {
    return { config, encrypted: false }
  }

  const next: SnmpConfig = { ...config }
  for (const field of SENSITIVE_FIELDS) {
    const value = config[field]
    if (typeof value === 'string' && value.length > 0) {
      next[field] = storage.encryptString(value).toString('base64')
    }
  }

  return { config: next, encrypted: true }
}

/**
 * Decrypt the sensitive fields of a stored SNMP config.
 *
 * - `encrypted === false` (or a legacy record without the flag): the config is
 *   plaintext and returned as-is (backward compatibility).
 * - `encrypted === true` but decryption is unavailable or a field fails to
 *   decode: the affected field is left as stored rather than throwing, so a
 *   profile list never becomes unreadable.
 */
export function decryptProfileConfig(
  config: SnmpConfig,
  encrypted: boolean | undefined,
  storage: SafeStorageLike = safeStorage
): SnmpConfig {
  if (!encrypted) {
    return config
  }
  if (!storage.isEncryptionAvailable()) {
    return config
  }

  const next: SnmpConfig = { ...config }
  for (const field of SENSITIVE_FIELDS) {
    const value = config[field]
    if (typeof value === 'string' && value.length > 0) {
      try {
        next[field] = storage.decryptString(Buffer.from(value, 'base64'))
      } catch {
        // Corrupt or foreign ciphertext — keep the stored value untouched.
      }
    }
  }

  return next
}
