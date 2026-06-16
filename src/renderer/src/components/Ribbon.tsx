import { Files, Search, Share2, Sparkles, Settings, PanelLeft } from 'lucide-react'

export type LeftPanel = 'files' | 'search'

interface RibbonProps {
  panel: LeftPanel
  onSelectPanel: (p: LeftPanel) => void
  onToggleSidebar: () => void
  onOpenGraph: () => void
  onToggleAi: () => void
  aiOpen: boolean
}

/** The thin vertical icon bar on the far left, like Obsidian's ribbon. */
export default function Ribbon({
  panel,
  onSelectPanel,
  onToggleSidebar,
  onOpenGraph,
  onToggleAi,
  aiOpen
}: RibbonProps): JSX.Element {
  return (
    <div className="ribbon">
      <button className="ribbon-btn" title="Toggle sidebar" onClick={onToggleSidebar}>
        <PanelLeft size={18} />
      </button>
      <button
        className={`ribbon-btn ${panel === 'files' ? 'active' : ''}`}
        title="Files"
        onClick={() => onSelectPanel('files')}
      >
        <Files size={18} />
      </button>
      <button
        className={`ribbon-btn ${panel === 'search' ? 'active' : ''}`}
        title="Search"
        onClick={() => onSelectPanel('search')}
      >
        <Search size={18} />
      </button>
      <button className="ribbon-btn" title="Graph view" onClick={onOpenGraph}>
        <Share2 size={18} />
      </button>
      <button
        className={`ribbon-btn ${aiOpen ? 'active' : ''}`}
        title="AI assistant"
        onClick={onToggleAi}
      >
        <Sparkles size={18} />
      </button>
      <div className="ribbon-spacer" />
      <button className="ribbon-btn" title="Settings">
        <Settings size={18} />
      </button>
    </div>
  )
}
