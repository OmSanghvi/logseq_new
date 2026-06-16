import { X } from 'lucide-react'
import { useVault } from '../store/vaultStore'

export default function TabBar(): JSX.Element | null {
  const tabs = useVault((s) => s.tabs)
  const activePath = useVault((s) => s.activePath)
  const dirty = useVault((s) => s.dirty)
  const setActive = useVault((s) => s.setActive)
  const closeTab = useVault((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.relPath}
          className={`tab ${activePath === tab.relPath ? 'active' : ''}`}
          onClick={() => setActive(tab.relPath)}
        >
          <span className="tab-label">
            {dirty.has(tab.relPath) ? '• ' : ''}
            {tab.name.replace(/\.md$/i, '')}
          </span>
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.relPath)
            }}
          >
            <X size={13} />
          </span>
        </div>
      ))}
    </div>
  )
}
