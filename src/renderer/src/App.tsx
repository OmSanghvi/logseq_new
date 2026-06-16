import { useCallback, useEffect, useState } from 'react'
import Ribbon, { type LeftPanel } from './components/Ribbon'
import Sidebar from './components/Sidebar/Sidebar'
import TabBar from './components/TabBar'
import ContentView from './components/ContentView'
import StatusBar from './components/StatusBar'
import BacklinksPane from './components/Backlinks/BacklinksPane'
import AiPanel from './components/AI/AiPanel'
import GraphView from './components/Graph/GraphView'
import QuickSwitcher from './components/Palette/QuickSwitcher'
import CommandPalette, { type Command } from './components/Palette/CommandPalette'
import { fileKind, useVault } from './store/vaultStore'
import { useAi } from './store/aiStore'

type Modal = 'none' | 'switcher' | 'commands'

export default function App(): JSX.Element {
  const vault = useVault((s) => s.vault)
  const activePath = useVault((s) => s.activePath)
  const setVault = useVault((s) => s.setVault)
  const refreshTree = useVault((s) => s.refreshTree)
  const refreshIndex = useVault((s) => s.refreshIndex)
  const setViewMode = useVault((s) => s.setViewMode)

  const [leftPanel, setLeftPanel] = useState<LeftPanel>('files')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [modal, setModal] = useState<Modal>('none')
  const [graphOpen, setGraphOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const bridgeReady = typeof window.vault !== 'undefined'

  useEffect(() => {
    if (!bridgeReady) return
    void window.vault.getRecentVault().then((meta) => meta && setVault(meta))
    useAi.getState().init()
  }, [bridgeReady, setVault])

  useEffect(() => {
    if (!bridgeReady) return
    return window.vault.onVaultChanged(() => {
      void refreshTree()
      void refreshIndex()
    })
  }, [bridgeReady, refreshTree, refreshIndex])

  const openVault = async (): Promise<void> => {
    const meta = await window.vault.openVault()
    if (meta) setVault(meta)
  }

  const newNote = useCallback(async () => {
    const v = useVault.getState().vault
    if (!v) return
    const base = window.prompt('New note name', 'Untitled')
    if (!base) return
    const rel = base.endsWith('.md') ? base : `${base}.md`
    try {
      await window.vault.createFile(v.root, rel)
      await useVault.getState().refreshTree()
      void useVault.getState().refreshIndex()
      await useVault.getState().openFile(rel, rel.split('/').pop()!)
    } catch {
      window.alert('A note with that name already exists.')
    }
  }, [])

  const commands: Command[] = [
    { id: 'new', title: 'New note', run: () => void newNote() },
    { id: 'switch', title: 'Quick switcher: open note', run: () => setModal('switcher') },
    { id: 'search', title: 'Search in all notes', run: () => setLeftPanel('search') },
    { id: 'graph', title: 'Open graph view', run: () => setGraphOpen(true) },
    { id: 'ai', title: 'Toggle AI assistant', run: () => setAiOpen((v) => !v) },
    { id: 'live', title: 'Editing mode: Live preview', run: () => setViewMode('live') },
    { id: 'source', title: 'Editing mode: Source', run: () => setViewMode('source') },
    { id: 'reading', title: 'Reading view', run: () => setViewMode('reading') },
    { id: 'toggle-right', title: 'Toggle backlinks pane', run: () => setRightCollapsed((v) => !v) }
  ]

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'o') {
        e.preventDefault()
        setModal('switcher')
      } else if (mod && e.key === 'p') {
        e.preventDefault()
        setModal('commands')
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setLeftPanel('search')
      } else if (mod && e.key === 'g') {
        e.preventDefault()
        setGraphOpen((v) => !v)
      } else if (mod && e.key === 'j') {
        e.preventDefault()
        setAiOpen((v) => !v)
      } else if (mod && e.key === 'e') {
        e.preventDefault()
        const cur = useVault.getState().viewMode
        setViewMode(cur === 'reading' ? 'live' : 'reading')
      } else if (e.key === 'Escape') {
        setGraphOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setViewMode])

  if (!bridgeReady) {
    return (
      <div className="app">
        <div className="empty-state" style={{ height: '100vh' }}>
          <h2>Bridge not loaded</h2>
          <p>The preload script didn’t load, so the app can’t reach the filesystem.</p>
        </div>
      </div>
    )
  }

  const showRight = activePath && fileKind(activePath) === 'markdown' && !rightCollapsed

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title">{vault ? vault.name : 'Obsidian Clone'}</span>
      </div>
      <div className="body">
        <Ribbon
          panel={leftPanel}
          onSelectPanel={(p) => {
            setLeftPanel(p)
            setSidebarCollapsed(false)
          }}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          onOpenGraph={() => setGraphOpen(true)}
          onToggleAi={() => setAiOpen((v) => !v)}
          aiOpen={aiOpen}
        />
        <Sidebar collapsed={sidebarCollapsed} panel={leftPanel} />
        <main className="main">
          <TabBar />
          <div className="editor-area">
            {!vault ? (
              <div className="empty-state">
                <h2>No vault open</h2>
                <p>Open a folder to use it as your vault.</p>
                <button className="primary-btn" onClick={openVault}>
                  Open folder as vault
                </button>
              </div>
            ) : activePath ? (
              <ContentView key={activePath} relPath={activePath} />
            ) : (
              <div className="empty-state">
                <h2>No note open</h2>
                <p>
                  Select a note, press <kbd>⌘O</kbd> to jump to one, or <kbd>⌘P</kbd> for commands.
                </p>
              </div>
            )}
          </div>
        </main>
        {aiOpen ? <AiPanel /> : showRight && <BacklinksPane />}
      </div>
      <StatusBar />

      {modal === 'switcher' && <QuickSwitcher onClose={() => setModal('none')} />}
      {modal === 'commands' && (
        <CommandPalette commands={commands} onClose={() => setModal('none')} />
      )}
      {graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}
    </div>
  )
}
