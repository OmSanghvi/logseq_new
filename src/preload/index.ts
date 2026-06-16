import { contextBridge, ipcRenderer } from 'electron'
import type { AiApi, VaultApi } from '../shared/types'

const api: VaultApi = {
  openVault: () => ipcRenderer.invoke('vault:open'),
  getRecentVault: () => ipcRenderer.invoke('vault:recent'),
  readTree: (root) => ipcRenderer.invoke('vault:tree', root),
  readFile: (root, rel) => ipcRenderer.invoke('vault:read', root, rel),
  writeFile: (root, rel, content) => ipcRenderer.invoke('vault:write', root, rel, content),
  createFile: (root, rel) => ipcRenderer.invoke('vault:createFile', root, rel),
  createFolder: (root, rel) => ipcRenderer.invoke('vault:createFolder', root, rel),
  rename: (root, from, to) => ipcRenderer.invoke('vault:rename', root, from, to),
  deletePath: (root, rel) => ipcRenderer.invoke('vault:delete', root, rel),
  buildIndex: (root) => ipcRenderer.invoke('vault:index', root),
  search: (root, query) => ipcRenderer.invoke('vault:search', root, query),
  fileUrl: (absPath) => `vaultfile://v/${encodeURIComponent(absPath)}`,
  onVaultChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  }
}

const aiApi: AiApi = {
  status: (root) => ipcRenderer.invoke('ai:status', root),
  reindex: (root) => ipcRenderer.invoke('ai:reindex', root),
  ask: (reqId, root, question, history) =>
    ipcRenderer.invoke('ai:ask', reqId, root, question, history),
  onToken: (cb) => {
    const listener = (_e: unknown, p: { reqId: string; token: string }): void =>
      cb(p.reqId, p.token)
    ipcRenderer.on('ai:token', listener)
    return () => ipcRenderer.removeListener('ai:token', listener)
  },
  onProgress: (cb) => {
    const listener = (_e: unknown, p: { done: number; total: number; file: string }): void =>
      cb(p.done, p.total, p.file)
    ipcRenderer.on('ai:progress', listener)
    return () => ipcRenderer.removeListener('ai:progress', listener)
  }
}

contextBridge.exposeInMainWorld('vault', api)
contextBridge.exposeInMainWorld('ai', aiApi)
