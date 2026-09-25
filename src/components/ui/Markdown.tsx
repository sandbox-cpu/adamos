import { memo, useMemo } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'

interface Props {
  children: string
  className?: string
  /** Render Obsidian [[wikilinks]] and #tags as interactive chips. */
  obsidian?: boolean
  onWikiLink?: (target: string) => void
  onTag?: (tag: string) => void
}

function preprocess(md: string): string {
  return md
    .replace(/!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => `[${(alias ?? target).trim()}](wikilink:${encodeURIComponent(target.trim())})`)
    .replace(/(^|[\s(])#([\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu, (_m, pre: string, tag: string) => `${pre}[#${tag}](tag:${encodeURIComponent(tag)})`)
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '')
}

export const Markdown = memo(function Markdown({ children, className, obsidian, onWikiLink, onTag }: Props) {
  const navigate = useNavigate()
  const source = useMemo(() => (obsidian ? preprocess(stripFrontmatter(children)) : children), [children, obsidian])

  const components = useMemo<Components>(
    () => ({
      a({ href, children: kids }) {
        const url = href ?? ''
        if (url.startsWith('wikilink:')) {
          const target = decodeURIComponent(url.slice(9))
          return (
            <button type="button" className="wikilink" onClick={() => onWikiLink?.(target)}>
              {kids}
            </button>
          )
        }
        if (url.startsWith('tag:')) {
          const tag = decodeURIComponent(url.slice(4))
          return (
            <button type="button" className="tag hover:underline" onClick={() => onTag?.(tag)}>
              {kids}
            </button>
          )
        }
        if (url.startsWith('#/') || url.startsWith('/')) {
          const path = url.startsWith('#') ? url.slice(1) : url
          return (
            <a
              href={`#${path}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(path)
              }}
            >
              {kids}
            </a>
          )
        }
        return (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {kids}
          </a>
        )
      },
      img({ src, alt }) {
        if (typeof src !== 'string' || !/^(https?:|data:image\/)/i.test(src)) return null
        return <img src={src} alt={alt ?? ''} loading="lazy" className="my-3 max-h-96 rounded-xl" />
      },
      table({ children: kids }) {
        return <table>{kids}</table>
      },
    }),
    [navigate, onWikiLink, onTag],
  )

  return (
    <div className={cn('prose-os', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => (url.startsWith('wikilink:') || url.startsWith('tag:') ? url : defaultUrlTransform(url))}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
})
