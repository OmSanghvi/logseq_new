import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import type { VaultNode } from '../../../../shared/types'
import { useVault } from '../../store/vaultStore'

function TreeRow({ node, depth }: { node: VaultNode; depth: number }): JSX.Element {
  const expanded = useVault((s) => s.expanded)
  const activePath = useVault((s) => s.activePath)
  const toggleFolder = useVault((s) => s.toggleFolder)
  const openFile = useVault((s) => s.openFile)

  const isFolder = node.type === 'folder'
  const isOpen = expanded.has(node.relPath)
  const isActive = activePath === node.relPath
  const pad = 4 + depth * 14

  const onClick = (): void => {
    if (isFolder) toggleFolder(node.relPath)
    else void openFile(node.relPath, node.name)
  }

  // Hide ".md" in the displayed label, like Obsidian.
  const label = isFolder ? node.name : node.name.replace(/\.md$/i, '')

  return (
    <>
      <div
        className={`tree-row ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: pad }}
        onClick={onClick}
        title={node.relPath}
      >
        {isFolder ? (
          <span className={`twirl ${isOpen ? 'open' : ''}`}>
            <ChevronRight size={14} />
          </span>
        ) : (
          <span className="twirl" />
        )}
        <span className="tree-icon">
          {isFolder ? (
            isOpen ? (
              <FolderOpen size={15} />
            ) : (
              <Folder size={15} />
            )
          ) : (
            <FileText size={15} />
          )}
        </span>
        <span className="tree-label">{label}</span>
      </div>
      {isFolder &&
        isOpen &&
        node.children?.map((child) => (
          <TreeRow key={child.relPath} node={child} depth={depth + 1} />
        ))}
    </>
  )
}

export default function FileTree(): JSX.Element {
  const tree = useVault((s) => s.tree)
  return (
    <div className="file-tree">
      {tree.map((node) => (
        <TreeRow key={node.relPath} node={node} depth={0} />
      ))}
    </div>
  )
}
