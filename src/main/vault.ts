import { promises as fs } from 'fs'
import path from 'path'
import type { VaultNode } from '../shared/types'

/** Folders we never show in the file explorer. */
const IGNORED = new Set(['.git', '.obsidian', 'node_modules', '.trash', '.DS_Store'])

/** Resolve a vault-relative path to an absolute one, guarding against escapes. */
export function resolveInVault(root: string, relPath: string): string {
  const abs = path.resolve(root, relPath)
  const normalizedRoot = path.resolve(root)
  if (abs !== normalizedRoot && !abs.startsWith(normalizedRoot + path.sep)) {
    throw new Error(`Path escapes vault: ${relPath}`)
  }
  return abs
}

function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

/** Recursively read the vault into a sorted tree (folders first, then files, A-Z). */
export async function readTree(root: string): Promise<VaultNode[]> {
  async function walk(dir: string): Promise<VaultNode[]> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const nodes: VaultNode[] = []
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        nodes.push({
          path: abs,
          relPath: toRel(root, abs),
          name: entry.name,
          type: 'folder',
          children: await walk(abs)
        })
      } else if (entry.isFile()) {
        nodes.push({
          path: abs,
          relPath: toRel(root, abs),
          name: entry.name,
          type: 'file'
        })
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return nodes
  }
  return walk(root)
}

export async function readFile(root: string, relPath: string): Promise<string> {
  return fs.readFile(resolveInVault(root, relPath), 'utf8')
}

export async function writeFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = resolveInVault(root, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
}

export async function createFile(root: string, relPath: string): Promise<void> {
  const abs = resolveInVault(root, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  // Fail if it already exists so we never clobber a note.
  await fs.writeFile(abs, '', { flag: 'wx' })
}

export async function createFolder(root: string, relPath: string): Promise<void> {
  await fs.mkdir(resolveInVault(root, relPath), { recursive: true })
}

export async function rename(root: string, fromRel: string, toRel_: string): Promise<void> {
  const from = resolveInVault(root, fromRel)
  const to = resolveInVault(root, toRel_)
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to)
}

export async function deletePath(root: string, relPath: string): Promise<void> {
  await fs.rm(resolveInVault(root, relPath), { recursive: true, force: true })
}
