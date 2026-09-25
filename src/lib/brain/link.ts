import { db } from '../db'
import { FriendlyError } from '../llm/errors'
import { logActivity } from '../ops'
import { useSettings } from '../../stores/settings'
import { demoNotes } from './demo'
import { invalidateBrainIndex } from './search'
import { ensurePermission, forgetVault, getSavedHandle, pickVaultFolder, replaceNotes, scanFolder, scanUploadedFiles, type ScanProgress } from './vault-fs'

/** Asks for the Obsidian vault folder, reads every note and remembers the folder for next time. */
export async function linkVaultFolder(onProgress?: (p: ScanProgress) => void): Promise<{ name: string; count: number }> {
  const handle = await pickVaultFolder()
  const notes = await scanFolder(handle, onProgress)
  if (!notes.length) throw new FriendlyError('That folder has no notes in it.', 'Choose the folder that holds your Obsidian vault (the one containing a .obsidian folder).')
  await replaceNotes(notes)
  await useSettings.getState().update({ brain: { mode: 'fs', name: handle.name, lastSync: Date.now(), noteCount: notes.length } })
  void logActivity('note', `Linked your brain “${handle.name}” with ${notes.length} notes`)
  return { name: handle.name, count: notes.length }
}

/** Re-reads the linked folder. Must run from a click if the browser needs to re-confirm access. */
export async function resyncVaultFolder(onProgress?: (p: ScanProgress) => void): Promise<number> {
  const handle = await getSavedHandle()
  if (!handle) throw new FriendlyError('Your vault folder isn’t linked on this computer.', 'Link it again from the Brain page.')
  if (!(await ensurePermission(handle, 'read'))) throw new FriendlyError('Access to your vault folder was not allowed.', 'Click refresh again and choose “Allow”.')
  const notes = await scanFolder(handle, onProgress)
  await replaceNotes(notes)
  await useSettings.getState().update({ brain: { mode: 'fs', name: handle.name, lastSync: Date.now(), noteCount: notes.length } })
  return notes.length
}

/** Reads a copy of a vault chosen with a folder upload (for browsers that cannot link folders). */
export async function uploadVault(files: FileList | File[], onProgress?: (p: ScanProgress) => void): Promise<{ name: string; count: number }> {
  const { notes, vaultName } = await scanUploadedFiles(files, onProgress)
  if (!notes.length) throw new FriendlyError('No notes were found in that folder.', 'Choose your Obsidian vault folder.')
  await replaceNotes(notes)
  await forgetVault()
  await useSettings.getState().update({ brain: { mode: 'upload', name: vaultName, lastSync: Date.now(), noteCount: notes.length } })
  void logActivity('note', `Loaded your brain “${vaultName}” with ${notes.length} notes`)
  return { name: vaultName, count: notes.length }
}

/** Puts the sample agency brain back so every feature has something to work with. */
export async function loadSampleBrain(): Promise<number> {
  const notes = demoNotes()
  await replaceNotes(notes)
  await forgetVault()
  await useSettings.getState().update({ brain: { mode: 'none', name: undefined, lastSync: undefined, noteCount: notes.length } })
  return notes.length
}

/** Forgets the linked vault and clears its notes from this device. Nothing in the vault itself is touched. */
export async function unlinkVault(): Promise<void> {
  await forgetVault()
  await db.notes.clear()
  invalidateBrainIndex()
  await useSettings.getState().update({ brain: { mode: 'none', name: undefined, lastSync: undefined, noteCount: 0 } })
}
