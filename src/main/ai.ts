import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { readTree } from './vault'
import type { VaultNode } from '../shared/types'

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'
export const EMBED_MODEL = 'nomic-embed-text'
export const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3:latest'

const MAX_FILE_BYTES = 256 * 1024
const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200
const MAX_CHUNKS_PER_FILE = 40

export interface Chunk {
  relPath: string
  title: string
  /** Index of this chunk within its note. */
  ord: number
  text: string
  vector: number[]
}

export interface VectorIndex {
  version: number
  builtAt: number
  model: string
  chunks: Chunk[]
}

export interface AiStatus {
  ollamaUp: boolean
  hasEmbed: boolean
  hasChat: boolean
  chatModel: string
  indexed: number
  builtAt: number | null
}

export interface RetrievedChunk {
  relPath: string
  title: string
  text: string
  score: number
}

// ---------- Ollama calls ----------

async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`)
    if (!res.ok) return []
    const data = (await res.json()) as { models?: { name: string }[] }
    return (data.models ?? []).map((m) => m.name)
  } catch {
    return []
  }
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
  })
  if (!res.ok) throw new Error(`embed failed: ${res.status}`)
  const data = (await res.json()) as { embedding: number[] }
  return data.embedding
}

/** Stream a chat completion, invoking onToken for each piece of text. */
export async function chatStream(
  messages: { role: string; content: string }[],
  onToken: (t: string) => void
): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true })
  })
  if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const json = JSON.parse(line) as { message?: { content?: string } }
        const piece = json.message?.content ?? ''
        if (piece) {
          full += piece
          onToken(piece)
        }
      } catch {
        /* ignore partial json */
      }
    }
  }
  return full
}

// ---------- Index storage ----------

function indexPath(root: string): string {
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 16)
  return path.join(app.getPath('userData'), 'ai-index', `${hash}.json`)
}

let cache: { root: string; index: VectorIndex } | null = null

async function loadIndex(root: string): Promise<VectorIndex | null> {
  if (cache && cache.root === root) return cache.index
  try {
    const raw = await fs.readFile(indexPath(root), 'utf8')
    const index = JSON.parse(raw) as VectorIndex
    cache = { root, index }
    return index
  } catch {
    return null
  }
}

async function saveIndex(root: string, index: VectorIndex): Promise<void> {
  const p = indexPath(root)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(index))
  cache = { root, index }
}

// ---------- Chunking ----------

function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, '')
  const chunks: string[] = []
  let i = 0
  while (i < clean.length && chunks.length < MAX_CHUNKS_PER_FILE) {
    let end = Math.min(i + CHUNK_SIZE, clean.length)
    // Prefer to break on a paragraph or newline boundary.
    if (end < clean.length) {
      const nl = clean.lastIndexOf('\n', end)
      if (nl > i + CHUNK_SIZE / 2) end = nl
    }
    const piece = clean.slice(i, end).trim()
    if (piece) chunks.push(piece)
    i = end - CHUNK_OVERLAP
    if (i < 0) i = 0
    if (end === clean.length) break
  }
  return chunks
}

function flatten(nodes: VaultNode[], out: VaultNode[] = []): VaultNode[] {
  for (const n of nodes) {
    if (n.type === 'file') out.push(n)
    else if (n.children) flatten(n.children, out)
  }
  return out
}

// ---------- Public operations ----------

export async function getStatus(root: string | null): Promise<AiStatus> {
  const models = await listModels()
  const index = root ? await loadIndex(root) : null
  const has = (name: string): boolean => models.some((m) => m === name || m.startsWith(name + ':'))
  return {
    ollamaUp: models.length > 0,
    hasEmbed: has(EMBED_MODEL),
    hasChat: has(CHAT_MODEL.split(':')[0]),
    chatModel: CHAT_MODEL,
    indexed: index?.chunks.length ?? 0,
    builtAt: index?.builtAt ?? null
  }
}

/** Rebuild the vector index for the whole vault, reporting progress. */
export async function reindex(
  root: string,
  onProgress: (done: number, total: number, file: string) => void
): Promise<number> {
  const tree = await readTree(root)
  const files = flatten(tree).filter((f) => f.name.toLowerCase().endsWith('.md'))
  const chunks: Chunk[] = []

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi]
    onProgress(fi, files.length, f.name)
    try {
      const stat = await fs.stat(f.path)
      if (stat.size > MAX_FILE_BYTES) continue
      const text = await fs.readFile(f.path, 'utf8')
      const title = f.name.replace(/\.md$/i, '')
      const pieces = chunkText(text)
      for (let ord = 0; ord < pieces.length; ord++) {
        const vector = await embed(`${title}\n\n${pieces[ord]}`)
        chunks.push({ relPath: f.relPath, title, ord, text: pieces[ord], vector })
      }
    } catch {
      /* skip unreadable */
    }
  }

  const index: VectorIndex = {
    version: 1,
    builtAt: Date.now(),
    model: EMBED_MODEL,
    chunks
  }
  await saveIndex(root, index)
  onProgress(files.length, files.length, '')
  return chunks.length
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export async function search(root: string, query: string, k = 6): Promise<RetrievedChunk[]> {
  const index = await loadIndex(root)
  if (!index || index.chunks.length === 0) return []
  const qv = await embed(query)
  return index.chunks
    .map((c) => ({ relPath: c.relPath, title: c.title, text: c.text, score: cosine(qv, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

const SYSTEM_PROMPT = `You are a research assistant embedded in the user's personal markdown note vault.
Answer the user's question using ONLY the provided note excerpts when they are relevant.
Cite the notes you used by their title in the form [[Title]]. If the notes don't contain
the answer, say so and answer from general knowledge, clearly marking that part.`

/** RAG: retrieve context, then stream an answer. Returns the source chunks used. */
export async function ask(
  root: string,
  question: string,
  history: { role: string; content: string }[],
  onToken: (t: string) => void
): Promise<RetrievedChunk[]> {
  const sources = await search(root, question, 6)
  const context = sources
    .map((s, i) => `[${i + 1}] (from "${s.title}")\n${s.text}`)
    .join('\n\n---\n\n')
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-6),
    {
      role: 'user',
      content: context
        ? `Note excerpts:\n\n${context}\n\n---\n\nQuestion: ${question}`
        : `Question: ${question}\n\n(No notes are indexed yet.)`
    }
  ]
  await chatStream(messages, onToken)
  return sources
}
