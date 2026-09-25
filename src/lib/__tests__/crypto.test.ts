import { describe, expect, it } from 'vitest'
import { createVault, decryptJSON, encryptJSON, passphraseStrength, secretHint, unlockVault } from '../crypto'

describe('vault crypto', () => {
  it('encrypts and decrypts secrets with the passphrase-derived key', async () => {
    const { meta, key } = await createVault('correct horse battery staple', 1000)
    const blob = await encryptJSON(key, { apiKey: 'sk-ant-secret-1234' })
    expect(blob.ct).not.toContain('secret')
    const again = await unlockVault(meta, 'correct horse battery staple')
    expect(again).not.toBeNull()
    expect(await decryptJSON(again!, blob)).toEqual({ apiKey: 'sk-ant-secret-1234' })
  })

  it('rejects a wrong passphrase', async () => {
    const { meta } = await createVault('right passphrase here', 1000)
    expect(await unlockVault(meta, 'wrong passphrase here')).toBeNull()
  })

  it('uses a fresh IV for every encryption', async () => {
    const { key } = await createVault('another good passphrase', 1000)
    const a = await encryptJSON(key, { v: 1 })
    const b = await encryptJSON(key, { v: 1 })
    expect(a.iv).not.toEqual(b.iv)
    expect(a.ct).not.toEqual(b.ct)
  })

  it('rates passphrase strength and masks secrets', () => {
    expect(passphraseStrength('short').score).toBe(0)
    expect(passphraseStrength('four random words together').score).toBeGreaterThanOrEqual(3)
    expect(secretHint('sk-ant-abcdWXYZ')).toBe('WXYZ')
  })
})
