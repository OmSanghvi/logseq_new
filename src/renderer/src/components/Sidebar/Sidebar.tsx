import { FilePlus, FolderPlus, RefreshCw } from 'lucide-react'
import { useVault } from '../../store/vaultStore'
import FileTree from './FileTree'
import SearchPane from '../Search/SearchPane'
import type { LeftPanel } from '../Ribbon'

export default function Sidebar({
  collapsed,
  panel
}: {
  collapsed: boolean
  panel: LeftPanel
}): JSX.Element {
  const vault = useVault((s) => s.vault)
  const refreshTree = useVault((s) => s.refreshTree)
  const openFile = useVault((s) => s.openFile)

  const newFile = async (): Promise<void> => {
    if (!vault) return
    const base = window.prompt('New note name', 'Untitled')
    if (!base) return
    const rel = base.endsWith('.md') ? base : `${base}.md`
    try {
      await window.vault.createFile(vault.root, rel)
      await refreshTree()
      await openFile(rel, rel.split('/').pop()!)
    } catch {
      window.alert('A note with that name already exists.')
    }
  }

  const newFolder = async (): Promise<void> => {
    if (!vault) return
    const name = window.prompt('New folder name', 'Folder')
    if (!name) return
    await window.vault.createFolder(vault.root, name)
    await refreshTree()
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {panel === 'search' ? (
        <SearchPane />
      ) : (
        <>
          <div className="sidebar-header">
            <span className="sidebar-vault-name">{vault?.name ?? 'No vault'}</span>
            <button className="icon-btn" title="New note" onClick={newFile}>
              <FilePlus size={16} />
            </button>
            <button className="icon-btn" title="New folder" onClick={newFolder}>
              <FolderPlus size={16} />
            </button>
            <button className="icon-btn" title="Refresh" onClick={() => void refreshTree()}>
              <RefreshCw size={15} />
            </button>
          </div>
          <FileTree />
        </>
      )}
    </aside>
  )
}
