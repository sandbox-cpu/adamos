import { create } from 'zustand'
import { generateAndSaveImage } from '../lib/media/generate'
import { logActivity, MINUTES_SAVED } from '../lib/ops'
import { errorMessage, truncate, uid } from '../lib/utils'
import { useSettings } from './settings'

export interface ImageJob {
  id: string
  status: 'queued' | 'working' | 'done' | 'error'
  mediaId?: string
  error?: string
  /** When a waiting picture gets its turn with the free service. */
  startsAt?: number
}

export interface ImageBatch {
  id: string
  prompt: string
  styleId: string
  aspectId: string
  projectId?: string
  createdAt: number
  jobs: ImageJob[]
}

interface MediaJobsState {
  batches: ImageBatch[]
  /** Starts making pictures in the background and returns the batch id. */
  create: (input: { prompt: string; styleId: string; aspectId: string; count: number; projectId?: string }) => string
  retry: (batchId: string, jobId: string) => void
  dismiss: (batchId: string) => void
}

function patchJob(batchId: string, jobId: string, patch: Partial<ImageJob>) {
  useMediaJobs.setState((s) => ({
    batches: s.batches.map((b) => (b.id === batchId ? { ...b, jobs: b.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) } : b)),
  }))
}

async function runJob(batch: ImageBatch, jobId: string): Promise<boolean> {
  patchJob(batch.id, jobId, { status: 'working', error: undefined, startsAt: undefined })
  try {
    const media = await generateAndSaveImage({
      prompt: batch.prompt,
      styleId: batch.styleId,
      aspectId: batch.aspectId,
      projectId: batch.projectId,
      log: false,
      onWait: (ms) => patchJob(batch.id, jobId, { status: 'queued', startsAt: Date.now() + ms }),
    })
    patchJob(batch.id, jobId, { status: 'done', mediaId: media.id, startsAt: undefined })
    return true
  } catch (err) {
    patchJob(batch.id, jobId, { status: 'error', error: errorMessage(err), startsAt: undefined })
    return false
  }
}

async function runBatch(batch: ImageBatch, jobIds: string[]) {
  // The free service takes turns by itself; paid services get two pictures at a time.
  const limit = useSettings.getState().settings.media.provider === 'pollinations' ? jobIds.length : 2
  const queue = [...jobIds]
  let made = 0
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!
      if (await runJob(batch, id)) made++
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker))
  if (made)
    void logActivity('content', `${made} new picture${made === 1 ? '' : 's'}: “${truncate(batch.prompt, 50)}”`, {
      minutesSaved: Math.round((MINUTES_SAVED.content / 2) * made),
      link: '/media',
    })
}

export const useMediaJobs = create<MediaJobsState>((set, get) => ({
  batches: [],
  create: (input) => {
    const batch: ImageBatch = {
      id: uid(),
      prompt: input.prompt.trim(),
      styleId: input.styleId,
      aspectId: input.aspectId,
      projectId: input.projectId,
      createdAt: Date.now(),
      jobs: Array.from({ length: Math.max(1, Math.min(4, input.count)) }, () => ({ id: uid(), status: 'queued' as const })),
    }
    set({ batches: [batch, ...get().batches].slice(0, 8) })
    void runBatch(
      batch,
      batch.jobs.map((j) => j.id),
    )
    return batch.id
  },
  retry: (batchId, jobId) => {
    const batch = get().batches.find((b) => b.id === batchId)
    if (batch) void runBatch(batch, [jobId])
  },
  dismiss: (batchId) => set({ batches: get().batches.filter((b) => b.id !== batchId) }),
}))
