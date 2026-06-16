/** Types shared between the Electron main process, preload bridge, and renderer. */

export interface VaultNode {
  /** Absolute path on disk. */
  path: string
  /** Path relative to the vault root, using POSIX separators. */
  relPath: string
  /** Display name (file or folder name, with extension for files). */
  name: string
  type: 'file' | 'folder'
  /** Populated only for folders. */
  children?: VaultNode[]
}

export interface VaultMeta {
  /** Absolute path to the vault root folder. */
  root: string
  /** Folder name, used as the vault display name. */
  name: string
}

export interface FileContent {
  relPath: string
  content: string
}

export interface NoteIndexEntry {
  relPath: string
  title: string
  links: string[]
  tags: string[]
}

export interface VaultIndex {
  notes: NoteIndexEntry[]
}

export interface SearchMatch {
  relPath: string
  title: string
  lines: { n: number; text: string }[]
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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiApi {
  status: (root: string | null) => Promise<AiStatus>
  reindex: (root: string) => Promise<number>
  ask: (
    reqId: string,
    root: string,
    question: string,
    history: ChatMessage[]
  ) => Promise<RetrievedChunk[]>
  onToken: (cb: (reqId: string, token: string) => void) => () => void
  onProgress: (cb: (done: number, total: number, file: string) => void) => () => void
}

/** The API surface exposed to the renderer through the preload context bridge. */
export interface VaultApi {
  openVault: () => Promise<VaultMeta | null>
  getRecentVault: () => Promise<VaultMeta | null>
  readTree: (root: string) => Promise<VaultNode[]>
  readFile: (root: string, relPath: string) => Promise<string>
  writeFile: (root: string, relPath: string, content: string) => Promise<void>
  createFile: (root: string, relPath: string) => Promise<void>
  createFolder: (root: string, relPath: string) => Promise<void>
  rename: (root: string, fromRel: string, toRel: string) => Promise<void>
  deletePath: (root: string, relPath: string) => Promise<void>
  buildIndex: (root: string) => Promise<VaultIndex>
  search: (root: string, query: string) => Promise<SearchMatch[]>
  /** Build a vaultfile:// URL the renderer can use as an <img>/<iframe> src. */
  fileUrl: (absPath: string) => string
  /** Subscribe to file-system changes inside the vault. Returns an unsubscribe fn. */
  onVaultChanged: (cb: () => void) => () => void
}

declare global {
  interface Window {
    vault: VaultApi
    ai: AiApi
  }
}
