import { useState } from 'react'
import { ImageOff, Images, Upload } from 'lucide-react'
import { mediaSrc, uploadImage } from '../../lib/media/generate'
import type { MediaItem } from '../../lib/types'
import { cn, errorMessage } from '../../lib/utils'
import { useMedia } from '../../hooks/data'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

/** A picture from the media library, with a calm placeholder if it can't be shown. */
export function MediaImg({ item, className, alt }: { item: Pick<MediaItem, 'id' | 'blob' | 'url' | 'title'>; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false)
  const src = mediaSrc(item)
  if (!src || failed)
    return (
      <div className={cn('grid place-items-center bg-[linear-gradient(135deg,rgb(255_255_255/0.06),rgb(255_255_255/0.02))] text-faint', className)}>
        <ImageOff className="size-5" />
      </div>
    )
  return <img src={src} alt={alt ?? item.title} loading="lazy" draggable={false} onError={() => setFailed(true)} className={cn('object-cover', className)} />
}

/** Choose a picture from the media library, or add one from the computer. */
export function MediaPicker({ open, onClose, onPick, projectId }: { open: boolean; onClose: () => void; onPick: (item: MediaItem) => void; projectId?: string }) {
  const media = useMedia()
  const pick = (item: MediaItem) => {
    onPick(item)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Images />} title="Choose a picture" subtitle="Everything you’ve made or uploaded in the Media Studio.">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.14] text-[12.5px] text-muted transition hover:border-white/[0.3] hover:text-fg">
          <Upload className="size-5" />
          Upload a picture
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                pick(await uploadImage(f, projectId))
              } catch (err) {
                toast.error('Couldn’t add that picture', errorMessage(err))
              }
            }}
          />
        </label>
        {media.map((m) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            title={m.title}
            className="group relative aspect-square overflow-hidden rounded-2xl border border-white/[0.07] transition hover:border-white/[0.25] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <MediaImg item={m} className="size-full transition duration-300 group-hover:scale-[1.04]" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-left text-[11.5px] text-white opacity-0 transition group-hover:opacity-100">
              {m.title}
            </span>
          </button>
        ))}
      </div>
      {!media.length && <p className="mt-4 text-center text-[13px] text-muted">Your library is empty for now. Pictures you create or upload will appear here.</p>}
    </Modal>
  )
}
