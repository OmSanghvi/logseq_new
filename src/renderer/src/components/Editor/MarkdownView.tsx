import { BookOpen, Code2, PenLine } from 'lucide-react'
import { useVault, type ViewMode } from '../../store/vaultStore'
import Editor from './Editor'
import ReadingView from './ReadingView'

const MODES: { mode: ViewMode; icon: JSX.Element; title: string }[] = [
  { mode: 'live', icon: <PenLine size={15} />, title: 'Live preview' },
  { mode: 'source', icon: <Code2 size={15} />, title: 'Source' },
  { mode: 'reading', icon: <BookOpen size={15} />, title: 'Reading view' }
]

export default function MarkdownView({ relPath }: { relPath: string }): JSX.Element {
  const viewMode = useVault((s) => s.viewMode)
  const setViewMode = useVault((s) => s.setViewMode)
  const title = relPath.split('/').pop()!.replace(/\.md$/i, '')

  return (
    <div className="markdown-view">
      <div className="view-header">
        <span className="view-title">{title}</span>
        <div className="view-mode-toggle">
          {MODES.map((m) => (
            <button
              key={m.mode}
              className={`icon-btn ${viewMode === m.mode ? 'active' : ''}`}
              title={m.title}
              onClick={() => setViewMode(m.mode)}
            >
              {m.icon}
            </button>
          ))}
        </div>
      </div>
      {viewMode === 'reading' ? (
        <ReadingView relPath={relPath} />
      ) : (
        <Editor key={`${relPath}:${viewMode}`} relPath={relPath} live={viewMode === 'live'} />
      )}
    </div>
  )
}
