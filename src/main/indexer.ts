import { promises as fs } from 'fs'
import path from 'path'
import { readTree } from './vault'
import type { VaultNode } from '../shared/types'

export interface NoteIndexEntry {
  relPath: string
  /** File name without extension — the wikilink target. */
  title: string
  /** Outgoing `[[wikilink]]` targets (raw, without brackets, alias stripped). */
  links: string[]
  /** `#tags` found in the note. */
  tags: string[]
}

export interface VaultIndex {
  notes: NoteIndexEntry[]
}

/** Files larger than this are skipped for link scanning (e.g. pasted PDF dumps). */
const MAX_SCAN_BYTES = 512 * 1024

const WIKILINK_RE = /\[\[([^\]]+?)\]\]/g
const TAG_RE = /(?:^|\s)#([A-Za-z0-9_/-]+)/g

function flatten(nodes: VaultNode[], out: VaultNode[] = []): VaultNode[] {
  for (const n of nodes) {
    if (n.type === 'file') out.push(n)
    else if (n.children) flatten(n.children, out)
  }
  return out
}

/** Walk the vault, parse every markdown note for links + tags, return the index. */
export async function buildIndex(root: string): Promise<VaultIndex> {
  const tree = await readTree(root)
  const files = flatten(tree).filter((f) => f.name.toLowerCase().endsWith('.md'))

  const notes = await Promise.all(
    files.map(async (f): Promise<NoteIndexEntry> => {
      const title = f.name.replace(/\.md$/i, '')
      const entry: NoteIndexEntry = { relPath: f.relPath, title, links: [], tags: [] }
      try {
        const stat = await fs.stat(f.path)
        if (stat.size > MAX_SCAN_BYTES) return entry
        const text = await fs.readFile(f.path, 'utf8')
        const links = new Set<string>()
        const tags = new Set<string>()
        let m: RegExpExecArray | null
        while ((m = WIKILINK_RE.exec(text))) {
          // Strip an alias ("Note|alias") and a heading ("Note#heading").
          const target = m[1].split('|')[0].split('#')[0].trim()
          if (target) links.add(target)
        }
        while ((m = TAG_RE.exec(text))) tags.add(m[1])
        entry.links = [...links]
        entry.tags = [...tags]
      } catch {
        /* unreadable file — leave entry empty */
      }
      return entry
    })
  )

  return { notes }
}

export interface SearchMatch {
  relPath: string
  title: string
  lines: { n: number; text: string }[]
}

/** Plain-text, case-insensitive search across markdown notes. */
export async function searchVault(root: string, query: string): Promise<SearchMatch[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const tree = await readTree(root)
  const files = flatten(tree).filter((f) => f.name.toLowerCase().endsWith('.md'))
  const results: SearchMatch[] = []

  for (const f of files) {
    try {
      const stat = await fs.stat(f.path)
      if (stat.size > MAX_SCAN_BYTES) continue
      const text = await fs.readFile(f.path, 'utf8')
      if (!text.toLowerCase().includes(q)) continue
      const lines: { n: number; text: string }[] = []
      text.split('\n').forEach((line, i) => {
        if (line.toLowerCase().includes(q) && lines.length < 5) {
          lines.push({ n: i + 1, text: line.trim().slice(0, 200) })
        }
      })
      results.push({ relPath: f.relPath, title: f.name.replace(/\.md$/i, ''), lines })
    } catch {
      /* skip unreadable */
    }
  }
  return results.slice(0, 100)
}

export { path }
