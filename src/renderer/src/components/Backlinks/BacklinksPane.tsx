import { useMemo } from 'react'
import { Link2 } from 'lucide-react'
import { useVault } from '../../store/vaultStore'

/** Right-sidebar pane listing notes that link to the active note. */
export default function BacklinksPane(): JSX.Element {
  const activePath = useVault((s) => s.activePath)
  const index = useVault((s) => s.index)
  const resolveTitle = useVault((s) => s.resolveTitle)
  const openFile = useVault((s) => s.openFile)

  const backlinks = useMemo(() => {
    if (!activePath || !index) return []
    return index.notes.filter(
      (n) => n.relPath !== activePath && n.links.some((l) => resolveTitle(l) === activePath)
    )
  }, [activePath, index, resolveTitle])

  return (
    <aside className="right-sidebar">
      <div className="right-sidebar-header">
        <Link2 size={14} />
        <span>Backlinks</span>
      </div>
      <div className="backlinks-list">
        {!activePath && <div className="pane-empty">No note open</div>}
        {activePath && backlinks.length === 0 && (
          <div className="pane-empty">No backlinks found</div>
        )}
        {backlinks.map((n) => (
          <div
            key={n.relPath}
            className="backlink-item"
            onClick={() => void openFile(n.relPath, n.relPath.split('/').pop()!)}
            title={n.relPath}
          >
            {n.title}
          </div>
        ))}
      </div>
    </aside>
  )
}
