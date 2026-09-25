import { getProvider } from '../../lib/llm/providers'
import { getService } from '../../lib/services'
import type { ProviderId } from '../../lib/types'
import { cn, hexToRgba } from '../../lib/utils'

/** A simple coloured monogram for an AI provider or connected service. */
export function ServiceMark({ id, size = 36, className }: { id: string; size?: number; className?: string }) {
  const provider = ['anthropic', 'openai', 'gemini', 'openrouter', 'groq', 'mistral', 'perplexity', 'deepseek', 'xai', 'ollama', 'custom'].includes(id) ? getProvider(id as ProviderId) : undefined
  const color = provider?.color ?? getService(id).color
  const name = provider?.name ?? getService(id).name
  const letter = name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '?'
  return (
    <div
      className={cn('grid shrink-0 place-items-center rounded-[30%] font-display font-bold', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        color,
        background: `linear-gradient(145deg, ${hexToRgba(color, 0.28)}, ${hexToRgba(color, 0.08)})`,
        boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.35)}`,
      }}
    >
      {letter}
    </div>
  )
}
