import { useEffect, useRef, useState } from 'react'

export interface PaletteItem {
  id: string
  title: string
  subtitle?: string
  /** Lowercased text used for filtering. */
  haystack: string
  run: () => void
}

interface PaletteProps {
  placeholder: string
  items: PaletteItem[]
  onClose: () => void
}

/** A centered command-palette / quick-switcher modal with fuzzy-ish filtering. */
export default function Palette({ placeholder, items, onClose }: PaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const q = query.toLowerCase().trim()
  const filtered = q
    ? items.filter((it) => q.split(/\s+/).every((part) => it.haystack.includes(part)))
    : items
  const shown = filtered.slice(0, 50)
  const clampedSel = Math.min(sel, Math.max(0, shown.length - 1))

  const choose = (it?: PaletteItem): void => {
    if (!it) return
    onClose()
    it.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(shown[clampedSel])
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSel(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {shown.length === 0 && <div className="palette-empty">No matches</div>}
          {shown.map((it, i) => (
            <div
              key={it.id}
              className={`palette-item ${i === clampedSel ? 'selected' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(it)}
            >
              <span className="palette-item-title">{it.title}</span>
              {it.subtitle && <span className="palette-item-sub">{it.subtitle}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
