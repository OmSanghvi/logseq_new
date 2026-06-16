import { useMemo, type MouseEvent } from 'react'
import { renderMarkdown } from '../../lib/markdown'
import { useResolvers } from '../../lib/resolvers'
import { useVault } from '../../store/vaultStore'

/** Fully-rendered markdown (Obsidian "Reading view"). */
export default function ReadingView({ relPath }: { relPath: string }): JSX.Element {
  const content = useVault((s) => s.contents[relPath] ?? '')
  const openByTitle = useVault((s) => s.openByTitle)
  const resolvers = useResolvers()

  const html = useMemo(() => renderMarkdown(content, resolvers), [content, resolvers])

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const el = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (!el) return
    const href = el.getAttribute('data-href')
    const pdf = el.getAttribute('data-embed-pdf')
    if (href !== null) {
      e.preventDefault()
      void openByTitle(href)
    } else if (pdf !== null) {
      e.preventDefault()
      void openByTitle(pdf, false)
    }
  }

  return (
    <div className="markdown-reading-view markdown-rendered" onClick={onClick}>
      <div className="markdown-preview-sizer" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
