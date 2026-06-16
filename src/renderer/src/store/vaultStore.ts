import { create } from 'zustand'
import type { VaultIndex, VaultMeta, VaultNode } from '../../../shared/types'

export interface OpenTab {
  relPath: string
  name: string
}

export type ViewMode = 'live' | 'reading' | 'source'

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif']
const TEXT_EXT = ['md', 'markdown', 'txt', 'text', 'csv', 'json', 'yaml', 'yml', 'js', 'ts', 'css']

export function extOf(relPath: string): string {
  const i = relPath.lastIndexOf('.')
  return i < 0 ? '' : relPath.slice(i + 1).toLowerCase()
}
export function fileKind(relPath: string): 'markdown' | 'image' | 'pdf' | 'text' | 'binary' {
  const e = extOf(relPath)
  if (e === 'md' || e === 'markdown') return 'markdown'
  if (e === 'pdf') return 'pdf'
  if (IMAGE_EXT.includes(e)) return 'image'
  if (TEXT_EXT.includes(e)) return 'text'
  return 'binary'
}

function flatten(nodes: VaultNode[], out: VaultNode[] = []): VaultNode[] {
  for (const n of nodes) {
    if (n.type === 'file') out.push(n)
    else if (n.children) flatten(n.children, out)
  }
  return out
}

interface VaultState {
  vault: VaultMeta | null
  tree: VaultNode[]
  files: VaultNode[]
  index: VaultIndex | null
  expanded: Set<string>
  tabs: OpenTab[]
  activePath: string | null
  contents: Record<string, string>
  /** Last saved/loaded content, used as the baseline for the dirty check. */
  saved: Record<string, string>
  dirty: Set<string>
  viewMode: ViewMode

  setVault: (vault: VaultMeta | null) => void
  refreshTree: () => Promise<void>
  refreshIndex: () => Promise<void>
  toggleFolder: (relPath: string) => void
  openFile: (relPath: string, name: string) => Promise<void>
  openByTitle: (title: string, createIfMissing?: boolean) => Promise<void>
  closeTab: (relPath: string) => void
  setActive: (relPath: string) => void
  updateContent: (relPath: string, content: string) => void
  saveActive: () => Promise<void>
  setViewMode: (m: ViewMode) => void
  /** Resolve a wikilink target (title or rel path, no extension) to a relPath. */
  resolveTitle: (target: string) => string | null
  /** Absolute path for a vault-relative path. */
  absPath: (relPath: string) => string
}

export const useVault = create<VaultState>((set, get) => ({
  vault: null,
  tree: [],
  files: [],
  index: null,
  expanded: new Set<string>(),
  tabs: [],
  activePath: null,
  contents: {},
  saved: {},
  dirty: new Set<string>(),
  viewMode: 'live',

  setVault: (vault) => {
    set({
      vault,
      tree: [],
      files: [],
      index: null,
      tabs: [],
      activePath: null,
      contents: {},
      saved: {},
      dirty: new Set()
    })
    if (vault) {
      void get().refreshTree()
      void get().refreshIndex()
    }
  },

  refreshTree: async () => {
    const { vault } = get()
    if (!vault) return
    const tree = await window.vault.readTree(vault.root)
    set({ tree, files: flatten(tree) })
  },

  refreshIndex: async () => {
    const { vault } = get()
    if (!vault) return
    const index = await window.vault.buildIndex(vault.root)
    set({ index })
  },

  toggleFolder: (relPath) =>
    set((s) => {
      const next = new Set(s.expanded)
      next.has(relPath) ? next.delete(relPath) : next.add(relPath)
      return { expanded: next }
    }),

  openFile: async (relPath, name) => {
    const { vault, tabs, contents } = get()
    if (!vault) return
    const kind = fileKind(relPath)
    // Only load text-ish files into the editor cache; viewers read binaries by URL.
    if ((kind === 'markdown' || kind === 'text') && !(relPath in contents)) {
      const content = await window.vault.readFile(vault.root, relPath)
      set((s) => ({
        contents: { ...s.contents, [relPath]: content },
        saved: { ...s.saved, [relPath]: content }
      }))
    }
    if (!tabs.find((t) => t.relPath === relPath)) {
      set((s) => ({ tabs: [...s.tabs, { relPath, name }] }))
    }
    set({ activePath: relPath })
  },

  openByTitle: async (target, createIfMissing = true) => {
    const { vault, resolveTitle, openFile, refreshTree, refreshIndex } = get()
    if (!vault) return
    const existing = resolveTitle(target)
    if (existing) {
      const name = existing.split('/').pop()!
      await openFile(existing, name)
      return
    }
    if (!createIfMissing) return
    const rel = target.endsWith('.md') ? target : `${target}.md`
    try {
      await window.vault.createFile(vault.root, rel)
    } catch {
      /* may already exist with different case */
    }
    await refreshTree()
    void refreshIndex()
    await openFile(rel, rel.split('/').pop()!)
  },

  closeTab: (relPath) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.relPath !== relPath)
      let activePath = s.activePath
      if (activePath === relPath) activePath = tabs.length ? tabs[tabs.length - 1].relPath : null
      return { tabs, activePath }
    }),

  setActive: (relPath) => set({ activePath: relPath }),

  updateContent: (relPath, content) =>
    set((s) => {
      const dirty = new Set(s.dirty)
      // Only dirty if it actually differs from what's on disk (avoids false flags).
      if (content === s.saved[relPath]) dirty.delete(relPath)
      else dirty.add(relPath)
      return { contents: { ...s.contents, [relPath]: content }, dirty }
    }),

  saveActive: async () => {
    const { vault, activePath, contents, dirty, refreshIndex } = get()
    if (!vault || !activePath || !dirty.has(activePath)) return
    const content = contents[activePath] ?? ''
    await window.vault.writeFile(vault.root, activePath, content)
    set((s) => {
      const next = new Set(s.dirty)
      next.delete(activePath)
      return { dirty: next, saved: { ...s.saved, [activePath]: content } }
    })
    void refreshIndex()
  },

  setViewMode: (m) => set({ viewMode: m }),

  resolveTitle: (target) => {
    const { files } = get()
    const want = target.replace(/\.md$/i, '').toLowerCase()
    // 1) exact relative-path match (folder/Note)
    let hit = files.find((f) => f.relPath.replace(/\.md$/i, '').toLowerCase() === want)
    // 2) bare filename match anywhere in the vault
    if (!hit) hit = files.find((f) => f.name.replace(/\.md$/i, '').toLowerCase() === want)
    return hit ? hit.relPath : null
  },

  absPath: (relPath) => {
    const { vault } = get()
    return vault ? `${vault.root}/${relPath}` : relPath
  }
}))
