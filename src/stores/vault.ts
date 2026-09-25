import { create } from 'zustand'
import { db, kvDelete, kvGet, kvSet } from '../lib/db'
import {
  createVault,
  decryptJSON,
  encryptJSON,
  secretHint,
  unlockVault,
  verifyKey,
} from '../lib/crypto'
import type { VaultMeta, VaultSecret } from '../lib/types'
import { uid } from '../lib/utils'

const META_KEY = 'vault.meta'
const DEVICE_KEY = 'vault.deviceKey'
const MANUAL_LOCK_KEY = 'vault.manualLock'

export class VaultLockedError extends Error {
  constructor() {
    super('Your vault is locked. Unlock it to let your agents use their keys.')
    this.name = 'VaultLockedError'
  }
}

export type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked'

interface UnlockRequest {
  reason: string
  resolve: () => void
  reject: (err: Error) => void
}

interface VaultState {
  status: VaultStatus
  key: CryptoKey | null
  remembered: boolean
  autoLockMinutes: number
  unlockRequest: UnlockRequest | null
  init: () => Promise<void>
  setup: (passphrase: string, remember: boolean) => Promise<void>
  unlock: (passphrase: string, remember?: boolean) => Promise<boolean>
  lock: () => Promise<void>
  touch: () => void
  setAutoLock: (minutes: number) => void
  setRemember: (remember: boolean) => Promise<void>
  addSecret: (input: { service: string; label: string; values: Record<string, string> }) => Promise<VaultSecret>
  updateSecret: (id: string, input: { label?: string; values?: Record<string, string> }) => Promise<void>
  deleteSecret: (id: string) => Promise<void>
  reveal: (id: string) => Promise<Record<string, string>>
  getValue: (id: string, field?: string) => Promise<string>
  changePassphrase: (current: string, next: string) => Promise<boolean>
  exportBackup: () => Promise<string>
  importBackup: (json: string, passphrase: string) => Promise<number>
  /** Resolves once the vault is unlocked, prompting the user if needed. */
  requestUnlock: (reason: string) => Promise<void>
  cancelUnlockRequest: () => void
}

let lockTimer: ReturnType<typeof setTimeout> | undefined

function scheduleLock(get: () => VaultState) {
  if (lockTimer) clearTimeout(lockTimer)
  const { autoLockMinutes, remembered, status } = get()
  if (status !== 'unlocked' || remembered || autoLockMinutes <= 0) return
  lockTimer = setTimeout(() => {
    void get().lock()
  }, autoLockMinutes * 60_000)
}

export const useVault = create<VaultState>((set, get) => ({
  status: 'loading',
  key: null,
  remembered: false,
  autoLockMinutes: 30,
  unlockRequest: null,

  init: async () => {
    const meta = await kvGet<VaultMeta>(META_KEY)
    if (!meta) {
      set({ status: 'uninitialized' })
      return
    }
    const deviceKey = await kvGet<CryptoKey>(DEVICE_KEY)
    const manualLock = await kvGet<boolean>(MANUAL_LOCK_KEY)
    if (deviceKey && !manualLock && (await verifyKey(meta, deviceKey))) {
      set({ status: 'unlocked', key: deviceKey, remembered: true })
      return
    }
    set({ status: 'locked', remembered: !!deviceKey })
  },

  setup: async (passphrase, remember) => {
    const { meta, key } = await createVault(passphrase)
    await kvSet(META_KEY, meta)
    if (remember) await kvSet(DEVICE_KEY, key)
    await kvDelete(MANUAL_LOCK_KEY)
    set({ status: 'unlocked', key, remembered: remember })
    scheduleLock(get)
  },

  unlock: async (passphrase, remember) => {
    const meta = await kvGet<VaultMeta>(META_KEY)
    if (!meta) return false
    const key = await unlockVault(meta, passphrase)
    if (!key) return false
    const keepOnDevice = remember ?? get().remembered
    if (keepOnDevice) await kvSet(DEVICE_KEY, key)
    await kvDelete(MANUAL_LOCK_KEY)
    set({ status: 'unlocked', key, remembered: keepOnDevice })
    scheduleLock(get)
    const req = get().unlockRequest
    if (req) {
      set({ unlockRequest: null })
      req.resolve()
    }
    return true
  },

  lock: async () => {
    if (lockTimer) clearTimeout(lockTimer)
    if (get().remembered) await kvSet(MANUAL_LOCK_KEY, true)
    set({ status: (await kvGet<VaultMeta>(META_KEY)) ? 'locked' : 'uninitialized', key: null })
  },

  touch: () => {
    if (get().status === 'unlocked') scheduleLock(get)
  },

  setAutoLock: (minutes) => {
    set({ autoLockMinutes: minutes })
    scheduleLock(get)
  },

  setRemember: async (remember) => {
    const { key } = get()
    if (remember && key) await kvSet(DEVICE_KEY, key)
    if (!remember) await kvDelete(DEVICE_KEY)
    set({ remembered: remember })
    scheduleLock(get)
  },

  addSecret: async ({ service, label, values }) => {
    const key = requireKey(get)
    const main = values.apiKey ?? values.clientId ?? Object.values(values)[0] ?? ''
    const secret: VaultSecret = {
      id: uid(),
      service,
      label: label.trim() || service,
      data: await encryptJSON(key, values),
      hint: secretHint(main),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.secrets.put(secret)
    get().touch()
    return secret
  },

  updateSecret: async (id, { label, values }) => {
    const existing = await db.secrets.get(id)
    if (!existing) return
    const patch: Partial<VaultSecret> = { updatedAt: Date.now() }
    if (label !== undefined) patch.label = label
    if (values) {
      const key = requireKey(get)
      patch.data = await encryptJSON(key, values)
      patch.hint = secretHint(values.apiKey ?? values.clientId ?? Object.values(values)[0] ?? '')
    }
    await db.secrets.update(id, patch)
  },

  deleteSecret: async (id) => {
    await db.secrets.delete(id)
    const linked = await db.profiles.filter((p) => p.keyId === id).toArray()
    await Promise.all(linked.map((p) => db.profiles.update(p.id, { keyId: undefined })))
  },

  reveal: async (id) => {
    const key = requireKey(get)
    const secret = await db.secrets.get(id)
    if (!secret) throw new Error('That key no longer exists.')
    get().touch()
    return decryptJSON<Record<string, string>>(key, secret.data)
  },

  getValue: async (id, field = 'apiKey') => {
    if (get().status !== 'unlocked') await get().requestUnlock('Your agents need a key from the vault.')
    const values = await get().reveal(id)
    void db.secrets.update(id, { lastUsed: Date.now() })
    const value = values[field] ?? Object.values(values)[0]
    if (!value) throw new Error('That vault entry is empty.')
    return value.trim()
  },

  changePassphrase: async (current, next) => {
    const meta = await kvGet<VaultMeta>(META_KEY)
    if (!meta) return false
    const oldKey = await unlockVault(meta, current)
    if (!oldKey) return false
    const secrets = await db.secrets.toArray()
    const plain = await Promise.all(secrets.map((s) => decryptJSON<Record<string, string>>(oldKey, s.data)))
    const { meta: nextMeta, key: nextKey } = await createVault(next)
    const reEncrypted = await Promise.all(
      secrets.map(async (s, i) => ({ ...s, data: await encryptJSON(nextKey, plain[i]), updatedAt: Date.now() })),
    )
    await db.transaction('rw', db.kv, db.secrets, async () => {
      await db.secrets.bulkPut(reEncrypted)
      await db.kv.put({ key: META_KEY, value: nextMeta })
      if (get().remembered) await db.kv.put({ key: DEVICE_KEY, value: nextKey })
    })
    set({ key: nextKey, status: 'unlocked' })
    scheduleLock(get)
    return true
  },

  exportBackup: async () => {
    const meta = await kvGet<VaultMeta>(META_KEY)
    const secrets = await db.secrets.toArray()
    return JSON.stringify({ format: 'agentic-os-vault', version: 1, exportedAt: new Date().toISOString(), meta, secrets }, null, 2)
  },

  importBackup: async (json, passphrase) => {
    const parsed = JSON.parse(json) as { format?: string; meta?: VaultMeta; secrets?: VaultSecret[] }
    if (parsed.format !== 'agentic-os-vault' || !parsed.meta || !Array.isArray(parsed.secrets)) {
      throw new Error('That file is not a vault backup.')
    }
    const backupKey = await unlockVault(parsed.meta, passphrase)
    if (!backupKey) throw new Error('That passphrase does not open this backup.')
    const key = requireKey(get)
    let count = 0
    for (const s of parsed.secrets) {
      const values = await decryptJSON<Record<string, string>>(backupKey, s.data)
      await db.secrets.put({ ...s, data: await encryptJSON(key, values), updatedAt: Date.now() })
      count++
    }
    return count
  },

  requestUnlock: (reason) => {
    const { status } = get()
    if (status === 'unlocked') return Promise.resolve()
    if (status === 'uninitialized') {
      return Promise.reject(new Error('Set up your vault and add an API key to bring your agents to life.'))
    }
    return new Promise<void>((resolve, reject) => {
      const existing = get().unlockRequest
      if (existing) existing.reject(new VaultLockedError())
      set({ unlockRequest: { reason, resolve, reject } })
    })
  },

  cancelUnlockRequest: () => {
    const req = get().unlockRequest
    if (req) {
      set({ unlockRequest: null })
      req.reject(new VaultLockedError())
    }
  },
}))

function requireKey(get: () => VaultState): CryptoKey {
  const { key, status } = get()
  if (status !== 'unlocked' || !key) throw new VaultLockedError()
  return key
}
