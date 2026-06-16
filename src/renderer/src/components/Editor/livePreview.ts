import { syntaxTree } from '@codemirror/language'
import { RangeSet, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { useVault } from '../../store/vaultStore'

const hide = Decoration.replace({})

/** Clickable rendered wikilink. */
class WikilinkWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly label: string,
    readonly exists: boolean
  ) {
    super()
  }
  eq(o: WikilinkWidget): boolean {
    return o.target === this.target && o.label === this.label && o.exists === this.exists
  }
  toDOM(): HTMLElement {
    const a = document.createElement('span')
    a.className = 'cm-internal-link internal-link' + (this.exists ? '' : ' is-unresolved')
    a.textContent = this.label
    a.dataset.href = this.target
    return a
  }
  ignoreEvent(): boolean {
    return false
  }
}

/** A rendered list bullet replacing the raw `-`/`*`/`+` marker. */
class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const s = document.createElement('span')
    s.className = 'cm-list-bullet'
    s.textContent = '•'
    return s
  }
}

/** Interactive task checkbox. */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number
  ) {
    super()
  }
  eq(o: CheckboxWidget): boolean {
    return o.checked === this.checked && o.pos === this.pos
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task-checkbox'
    box.checked = this.checked
    box.onmousedown = (e) => {
      e.preventDefault()
      const ch = this.checked ? ' ' : 'x'
      view.dispatch({ changes: { from: this.pos, to: this.pos + 1, insert: ch } })
    }
    return box
  }
  ignoreEvent(): boolean {
    return false
  }
}

const WIKILINK_RE = /(!?)\[\[([^\]]+?)\]\]/g
const TASK_RE = /^(\s*)([-*+])(\s)\[([ xX])\]/
const LIST_RE = /^(\s*)([-*+])(\s)/

interface Deco {
  from: number
  to: number
  deco: Decoration
}

function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number
    const b = view.state.doc.lineAt(r.to).number
    for (let l = a; l <= b; l++) lines.add(l)
  }
  return lines
}

function buildDecorations(view: EditorView): { deco: DecorationSet; atomic: DecorationSet } {
  const active = activeLines(view)
  const marks: Deco[] = []
  const atomics: Deco[] = []
  const resolveTitle = useVault.getState().resolveTitle

  for (const { from, to } of view.visibleRanges) {
    // 1) Hide markdown syntax markers via the parse tree (headings, emphasis, code…).
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        if (!name.endsWith('Mark')) return
        if (name === 'ListMark' || name === 'QuoteMark') return // handled separately / kept
        const lineNo = view.state.doc.lineAt(node.from).number
        if (active.has(lineNo)) return
        if (node.to > node.from) marks.push({ from: node.from, to: node.to, deco: hide })
      }
    })

    // 2) Per-line pass for list bullets, task checkboxes, and wikilinks.
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      const text = line.text
      const onActive = active.has(line.number)

      const task = TASK_RE.exec(text)
      if (task) {
        // Hide the "- " marker and render "[x]" as a checkbox.
        const markerFrom = line.from + task[1].length
        marks.push({ from: markerFrom, to: markerFrom + 2, deco: hide })
        const boxFrom = markerFrom + 2
        const checked = task[4].toLowerCase() === 'x'
        const box = Decoration.replace({ widget: new CheckboxWidget(checked, boxFrom + 1) })
        marks.push({ from: boxFrom, to: boxFrom + 3, deco: box })
        atomics.push({ from: boxFrom, to: boxFrom + 3, deco: box })
      } else if (!onActive) {
        const list = LIST_RE.exec(text)
        if (list) {
          // Replace the raw marker char with a rendered bullet.
          const markerFrom = line.from + list[1].length
          const bullet = Decoration.replace({ widget: new BulletWidget() })
          marks.push({ from: markerFrom, to: markerFrom + 1, deco: bullet })
        }
      }

      if (!onActive) {
        WIKILINK_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = WIKILINK_RE.exec(text))) {
          if (m[1] === '!') continue // embeds shown raw in live preview for now
          const [target, alias] = m[2].split('|')
          const label = (alias ?? target).trim()
          const cleanTarget = target.split('#')[0].trim()
          const start = line.from + m.index
          const w = Decoration.replace({
            widget: new WikilinkWidget(cleanTarget, label, !!resolveTitle(cleanTarget))
          })
          marks.push({ from: start, to: start + m[0].length, deco: w })
          atomics.push({ from: start, to: start + m[0].length, deco: w })
        }
      }

      if (line.to + 1 > to) break
      pos = line.to + 1
    }
  }

  const sort = (a: Deco, b: Deco): number => a.from - b.from || a.to - b.to
  marks.sort(sort)
  atomics.sort(sort)
  return {
    deco: RangeSet.of(
      marks.map((d) => d.deco.range(d.from, d.to)),
      true
    ),
    atomic: RangeSet.of(
      atomics.map((d) => d.deco.range(d.from, d.to)),
      true
    )
  }
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    atomic: DecorationSet
    constructor(view: EditorView) {
      const built = buildDecorations(view)
      this.decorations = built.deco
      this.atomic = built.atomic
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        const built = buildDecorations(u.view)
        this.decorations = built.deco
        this.atomic = built.atomic
      }
    }
  },
  { decorations: (v) => v.decorations }
)

// Keep the cursor from landing inside rendered widgets (links / checkboxes).
const livePreviewAtomic = EditorView.atomicRanges.of((view) => {
  const plugin = view.plugin(livePreviewPlugin)
  return plugin ? plugin.atomic : RangeSet.empty
})

/** Navigate when a rendered wikilink is clicked in the editor. */
const wikilinkClicks = EditorView.domEventHandlers({
  mousedown: (e) => {
    const el = (e.target as HTMLElement).closest('.cm-internal-link') as HTMLElement | null
    if (el?.dataset.href) {
      e.preventDefault()
      void useVault.getState().openByTitle(el.dataset.href)
      return true
    }
    return false
  }
})

export function livePreview(): Extension {
  return [livePreviewPlugin, livePreviewAtomic, wikilinkClicks]
}
