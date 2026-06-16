import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { watch, type FSWatcher } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import Store from './store'
import * as vault from './vault'
import { buildIndex, searchVault } from './indexer'
import * as ai from './ai'
import type { VaultMeta } from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A privileged scheme so the renderer can load real PDFs/images from disk
// (with range support, bypassing the page CSP).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vaultfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

let mainWindow: BrowserWindow | null = null
let watcher: FSWatcher | null = null
const store = new Store()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      // electron-vite emits the preload as ESM (.mjs) because package.json is type:module.
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/** Watch the vault root recursively and notify the renderer on any change (debounced). */
function watchVault(root: string): void {
  watcher?.close()
  let timer: NodeJS.Timeout | null = null
  try {
    watcher = watch(root, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => mainWindow?.webContents.send('vault:changed'), 120)
    })
  } catch {
    watcher = null
  }
}

function metaFor(root: string): VaultMeta {
  return { root, name: path.basename(root) }
}

app.whenReady().then(() => {
  // Serve vault files: vaultfile://v/<encoded-abs-path>
  protocol.handle('vaultfile', (request) => {
    try {
      const url = new URL(request.url)
      const abs = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  ipcMain.handle('vault:open', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open vault folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const root = res.filePaths[0]
    store.set('recentVault', root)
    watchVault(root)
    return metaFor(root)
  })

  ipcMain.handle('vault:recent', async () => {
    const root = store.get('recentVault')
    if (!root) return null
    watchVault(root)
    return metaFor(root)
  })

  ipcMain.handle('vault:tree', (_e, root: string) => vault.readTree(root))
  ipcMain.handle('vault:read', (_e, root: string, rel: string) => vault.readFile(root, rel))
  ipcMain.handle('vault:write', (_e, root: string, rel: string, content: string) =>
    vault.writeFile(root, rel, content)
  )
  ipcMain.handle('vault:createFile', (_e, root: string, rel: string) => vault.createFile(root, rel))
  ipcMain.handle('vault:createFolder', (_e, root: string, rel: string) =>
    vault.createFolder(root, rel)
  )
  ipcMain.handle('vault:rename', (_e, root: string, from: string, to: string) =>
    vault.rename(root, from, to)
  )
  ipcMain.handle('vault:delete', (_e, root: string, rel: string) => vault.deletePath(root, rel))
  ipcMain.handle('vault:index', (_e, root: string) => buildIndex(root))
  ipcMain.handle('vault:search', (_e, root: string, query: string) => searchVault(root, query))

  // ---- AI / RAG ----
  ipcMain.handle('ai:status', (_e, root: string | null) => ai.getStatus(root))
  ipcMain.handle('ai:reindex', (e, root: string) =>
    ai.reindex(root, (done, total, file) =>
      e.sender.send('ai:progress', { done, total, file })
    )
  )
  ipcMain.handle(
    'ai:ask',
    (e, reqId: string, root: string, question: string, history: { role: string; content: string }[]) =>
      ai.ask(root, question, history, (token) => e.sender.send('ai:token', { reqId, token }))
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  watcher?.close()
  if (process.platform !== 'darwin') app.quit()
})
