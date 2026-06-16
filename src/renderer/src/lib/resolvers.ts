import { fileKind, useVault } from '../store/vaultStore'
import type { EmbedResolution, LinkResolution, RenderOptions } from './markdown'

/** Build link/embed resolvers from current vault state (call inside render). */
export function useResolvers(): RenderOptions {
  const files = useVault((s) => s.files)
  const resolveTitle = useVault((s) => s.resolveTitle)
  const absPath = useVault((s) => s.absPath)

  const resolveLink = (target: string): LinkResolution => {
    const rel = resolveTitle(target)
    return { href: rel ?? '', exists: !!rel }
  }

  const resolveEmbed = (target: string): EmbedResolution => {
    const want = target.toLowerCase()
    const hit =
      files.find((f) => f.relPath.toLowerCase() === want) ??
      files.find((f) => f.name.toLowerCase() === want) ??
      files.find((f) => f.relPath.replace(/\.md$/i, '').toLowerCase() === want)
    if (!hit) return { kind: 'missing', target }
    const kind = fileKind(hit.relPath)
    if (kind === 'image') return { kind: 'image', url: window.vault.fileUrl(absPath(hit.relPath)), target }
    if (kind === 'pdf') return { kind: 'pdf', url: window.vault.fileUrl(absPath(hit.relPath)), target }
    return { kind: 'note', target }
  }

  return { resolveLink, resolveEmbed }
}
