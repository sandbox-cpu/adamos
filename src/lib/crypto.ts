import type { EncryptedBlob, VaultMeta } from './types'

/**
 * Vault cryptography.
 *
 * A master passphrase is stretched with PBKDF2-SHA256 into a non-extractable
 * AES-256-GCM key. Every secret is encrypted with a fresh 96-bit IV. The key
 * only ever lives in memory (or, when the user opts into "remember this
 * device", as a non-extractable CryptoKey in IndexedDB).
 */

export const PBKDF2_ITERATIONS = 600_000
const VERIFIER_TEXT = 'agentic-os-vault-v1'

const enc = new TextEncoder()
const dec = new TextDecoder()

function getCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c?.subtle) throw new Error('Secure storage needs a modern browser served over https or localhost.')
  return c
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n)
  getCrypto().getRandomValues(out)
  return out
}

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const subtle = getCrypto().subtle
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const iv = randomBytes(12)
  const ct = await getCrypto().subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) }
}

export async function decryptString(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const pt = await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(blob.iv) }, key, fromBase64(blob.ct))
  return dec.decode(pt)
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  return encryptString(key, JSON.stringify(value))
}

export async function decryptJSON<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  return JSON.parse(await decryptString(key, blob)) as T
}

/** Creates fresh vault metadata and the key that unlocks it. */
export async function createVault(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt, iterations)
  const verifier = await encryptString(key, VERIFIER_TEXT)
  return { meta: { salt: toBase64(salt), iterations, verifier, createdAt: Date.now() }, key }
}

/** Returns the unlocked key, or null when the passphrase is wrong. */
export async function unlockVault(meta: VaultMeta, passphrase: string): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, fromBase64(meta.salt), meta.iterations)
  return (await verifyKey(meta, key)) ? key : null
}

export async function verifyKey(meta: VaultMeta, key: CryptoKey): Promise<boolean> {
  try {
    return (await decryptString(key, meta.verifier)) === VERIFIER_TEXT
  } catch {
    return false
  }
}

export type PassphraseStrength = { score: 0 | 1 | 2 | 3 | 4; label: string }

export function passphraseStrength(p: string): PassphraseStrength {
  if (!p) return { score: 0, label: 'Too short' }
  let pool = 0
  if (/[a-z]/.test(p)) pool += 26
  if (/[A-Z]/.test(p)) pool += 26
  if (/[0-9]/.test(p)) pool += 10
  if (/[^a-zA-Z0-9]/.test(p)) pool += 33
  const bits = p.length * Math.log2(Math.max(pool, 1))
  const words = p.trim().split(/\s+/).length
  const boost = words >= 4 ? 12 : 0
  const total = bits + boost
  if (p.length < 8) return { score: 0, label: 'Too short' }
  if (total < 40) return { score: 1, label: 'Weak' }
  if (total < 60) return { score: 2, label: 'Fair' }
  if (total < 80) return { score: 3, label: 'Strong' }
  return { score: 4, label: 'Excellent' }
}

/** Last four characters for a masked preview such as "••••a1B2". */
export function secretHint(secret: string): string {
  const trimmed = secret.trim()
  return trimmed.length <= 4 ? '••••' : trimmed.slice(-4)
}
