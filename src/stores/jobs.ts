import { create } from 'zustand'

export interface Job {
  id: string
  kind: 'deck' | 'site' | 'research' | 'content' | 'image' | 'mastermind' | 'brief' | 'task'
  title: string
  stage: string
  agentId?: string
  link?: string
  startedAt: number
  status: 'running' | 'done' | 'error'
  error?: string
}

interface JobsState {
  jobs: Job[]
  start: (job: Omit<Job, 'startedAt' | 'status'>) => void
  update: (id: string, patch: Partial<Job>) => void
  finish: (id: string, patch?: Partial<Job>) => void
  dismiss: (id: string) => void
}

export const useJobs = create<JobsState>((set, get) => ({
  jobs: [],
  start: (job) => set((s) => ({ jobs: [{ ...job, startedAt: Date.now(), status: 'running' as const }, ...s.jobs.filter((j) => j.id !== job.id)].slice(0, 20) })),
  update: (id, patch) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
  finish: (id, patch) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'done' as const, ...patch } : j)) }))
    // Completed jobs fade from the tray after a while.
    setTimeout(() => {
      const job = get().jobs.find((j) => j.id === id)
      if (job && job.status !== 'running') get().dismiss(id)
    }, 60_000)
  },
  dismiss: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
}))

/** Wraps a background job so it always reports its outcome to the tray. */
export async function trackJob<T>(job: Omit<Job, 'startedAt' | 'status'>, fn: (setStage: (stage: string) => void) => Promise<T>): Promise<T> {
  const store = useJobs.getState()
  store.start(job)
  try {
    const result = await fn((stage) => useJobs.getState().update(job.id, { stage }))
    useJobs.getState().finish(job.id, { stage: 'Ready' })
    return result
  } catch (err) {
    useJobs.getState().finish(job.id, { status: 'error', stage: 'Failed', error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
