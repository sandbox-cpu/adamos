import { useRef, useState } from 'react'
import { ArrowRight, Brain, Check, ChevronDown, FolderSync, Sparkles, Upload } from 'lucide-react'
import { canLinkFolders } from '../../lib/brain/vault-fs'
import { linkVaultFolder, loadSampleBrain, uploadVault } from '../../lib/brain/link'
import { cn, errorMessage, formatNumber, isAbortError } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { ProgressBar } from '../../components/ui/bits'
import { toast } from '../../components/ui/Toast'

/** The three ways to bring an Obsidian vault in: link the folder, upload a copy, or use the sample. */
export function LinkVaultOptions({ onLinked }: { onLinked?: () => void }) {
  const brain = useSettings((s) => s.settings.brain)
  const [busy, setBusy] = useState<'fs' | 'upload' | 'sample' | null>(null)
  const [progress, setProgress] = useState<{ found: number; read: number } | null>(null)
  const [help, setHelp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const linked = brain.mode !== 'none'

  const run = async (kind: 'fs' | 'upload' | 'sample', fn: () => Promise<{ name: string; count: number } | number>) => {
    setBusy(kind)
    setProgress(null)
    try {
      const r = await fn()
      if (typeof r === 'number') toast.success('Sample brain ready', `${formatNumber(r)} example notes to explore.`)
      else toast.success(`“${r.name}” linked`, `${formatNumber(r.count)} notes are ready for your team.`)
      onLinked?.()
    } catch (err) {
      if (!isAbortError(err)) toast.error('Couldn’t read your vault', errorMessage(err))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const options = [
    ...(canLinkFolders()
      ? [
          {
            id: 'fs' as const,
            icon: <FolderSync />,
            title: 'Link my vault folder',
            body: 'Stays up to date, and agents can save new notes into it. They never change your existing notes.',
            tag: 'Best',
            onClick: () => void run('fs', () => linkVaultFolder(setProgress)),
          },
        ]
      : []),
    {
      id: 'upload' as const,
      icon: <Upload />,
      title: canLinkFolders() ? 'Upload a copy instead' : 'Upload my vault',
      body: 'Works in any browser. Upload again whenever you want to refresh it.',
      onClick: () => fileRef.current?.click(),
    },
    {
      id: 'sample' as const,
      icon: <Sparkles />,
      title: 'Try the sample brain first',
      body: 'Explore with example notes from a fictional PR agency. Link your own whenever you like.',
      onClick: () => void run('sample', loadSampleBrain),
    },
  ]

  return (
    <>
      {linked && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-good/25 bg-good/10 px-4 py-3">
          <Brain className="size-5 text-good" />
          <div className="flex-1 text-sm">
            <span className="font-semibold">{brain.name}</span> is linked · {formatNumber(brain.noteCount ?? 0)} notes
          </div>
          <Check className="size-4 text-good" />
        </div>
      )}
      <div className="grid gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={o.onClick}
            disabled={!!busy}
            className="group flex items-start gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] disabled:opacity-60"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_30%,transparent),color-mix(in_oklab,var(--accent-2)_18%,transparent))] text-fg [&_svg]:size-5">
              {o.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                {o.title}
                {'tag' in o && o.tag && <span className="rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-good uppercase">{o.tag}</span>}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">{o.body}</span>
              {busy === o.id && (
                <span className="mt-3 block">
                  <ProgressBar value={progress && progress.found ? (progress.read / progress.found) * 100 : 8} />
                  <span className="mt-1.5 block text-[12px] text-muted">
                    {progress?.found ? `Reading notes… ${formatNumber(progress.read)} of ${formatNumber(progress.found)}` : 'Waiting for you to choose a folder…'}
                  </span>
                </span>
              )}
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
          </button>
        ))}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          const files = e.target.files
          if (files?.length) void run('upload', () => uploadVault(files, setProgress))
          e.target.value = ''
        }}
      />
      <div className="mt-5 text-center">
        <button onClick={() => setHelp((v) => !v)} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          Where’s my vault? <ChevronDown className={cn('size-4 transition', help && 'rotate-180')} />
        </button>
        {help && (
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-soft">
            In Obsidian, click your vault’s name at the bottom left and choose <b>Manage vaults</b>. The folder location is shown under each vault. It’s the folder with all your
            notes in it.
          </p>
        )}
      </div>
    </>
  )
}
