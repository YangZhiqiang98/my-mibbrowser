import { describe, expect, it } from 'vitest'
import { decryptProfileConfig, encryptProfileConfig } from './profileCrypto'
import type { SafeStorageLike } from './profileCrypto'
import type { SnmpConfig } from '../snmp/types'

/**
 * Reversible fake so tests never touch the native safeStorage module.
 * encrypt prefixes "enc:"; decrypt strips it.
 */
function createFakeStorage(available: boolean): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf-8'),
    decryptString: (encrypted: Buffer) => encrypted.toString('utf-8').replace(/^enc:/, '')
  }
}

function baseConfig(overrides: Partial<SnmpConfig> = {}): SnmpConfig {
  return {
    host: '127.0.0.1',
    port: 161,
    version: 'v2c',
    community: 'secret-community',
    securityLevel: 'authPriv',
    username: 'admin',
    authProtocol: 'sha',
    authPassword: 'auth-pass',
    privProtocol: 'aes',
    privPassword: 'priv-pass',
    timeout: 5000,
    retries: 1,
    transport: 'udp4',
    bulkMaxRepetitions: 10,
    bulkNonRepeaters: 0,
    ...overrides
  }
}

describe('encryptProfileConfig', () => {
  it('encrypts sensitive fields and flags the record when storage is available', () => {
    // Arrange
    const storage = createFakeStorage(true)
    const config = baseConfig()

    // Act
    const result = encryptProfileConfig(config, storage)

    // Assert
    expect(result.encrypted).toBe(true)
    expect(result.config.community).not.toBe('secret-community')
    expect(result.config.community).toBe(Buffer.from('enc:secret-community', 'utf-8').toString('base64'))
    // Non-sensitive fields are untouched.
    expect(result.config.host).toBe('127.0.0.1')
  })

  it('stores plaintext and flags encrypted false when storage is unavailable', () => {
    // Arrange
    const storage = createFakeStorage(false)
    const config = baseConfig()

    // Act
    const result = encryptProfileConfig(config, storage)

    // Assert
    expect(result.encrypted).toBe(false)
    expect(result.config.community).toBe('secret-community')
  })

  it('leaves empty sensitive fields untouched', () => {
    const storage = createFakeStorage(true)
    const config = baseConfig({ authPassword: '', privPassword: '' })
    const result = encryptProfileConfig(config, storage)
    expect(result.config.authPassword).toBe('')
    expect(result.config.privPassword).toBe('')
  })
})

describe('decryptProfileConfig', () => {
  it('round-trips encrypted fields back to plaintext', () => {
    // Arrange
    const storage = createFakeStorage(true)
    const { config: encrypted } = encryptProfileConfig(baseConfig(), storage)

    // Act
    const decrypted = decryptProfileConfig(encrypted, true, storage)

    // Assert
    expect(decrypted.community).toBe('secret-community')
    expect(decrypted.authPassword).toBe('auth-pass')
    expect(decrypted.privPassword).toBe('priv-pass')
  })

  it('returns a legacy plaintext profile unchanged when not flagged encrypted', () => {
    // Arrange
    const storage = createFakeStorage(true)
    const config = baseConfig()

    // Act
    const decrypted = decryptProfileConfig(config, false, storage)

    // Assert
    expect(decrypted.community).toBe('secret-community')
  })

  it('keeps stored values when decryption throws for a field', () => {
    const throwingStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (plain) => Buffer.from(plain),
      decryptString: () => {
        throw new Error('bad ciphertext')
      }
    }
    const config = baseConfig({ community: 'not-base64-cipher' })
    const decrypted = decryptProfileConfig(config, true, throwingStorage)
    expect(decrypted.community).toBe('not-base64-cipher')
  })
})
