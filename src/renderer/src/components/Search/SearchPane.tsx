import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { SearchMatch } from '../../../../shared/types'
import { useVault } from '../../store/vaultStore'

/** Left-sidebar full-text search panel. */
export default function SearchPane(): JSX.Element {
  const vault = useVault((s) => s.vault)
  const openFile = useVault((s) => s.openFile)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchMatch[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    if (!vault || query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await window.vault.search(vault.root, query)
      if (!cancelled) {
        setResults(r)
        setSearching(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, vault])

  return (
    <div className="search-pane">
      <div className="sidebar-header">
        <div className="search-input-wrap">
          <Search size={14} />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="search-results">
        {searching && <div className="pane-empty">Searching…</div>}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <div className="pane-empty">No results</div>
        )}
        {results.map((r) => (
          <div key={r.relPath} className="search-result">
            <div
              className="search-result-title"
              onClick={() => void openFile(r.relPath, r.relPath.split('/').pop()!)}
            >
              {r.title}
            </div>
            {r.lines.map((l) => (
              <div key={l.n} className="search-result-line">
                {l.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
