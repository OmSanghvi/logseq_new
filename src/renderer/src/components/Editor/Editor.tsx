import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { obsidianTheme } from './cmTheme'
import { livePreview } from './livePreview'
import { wikilinkComplete } from './wikilinkComplete'
import { useVault } from '../../store/vaultStore'

/** CodeMirror 6 markdown editor. `live` enables Obsidian-style inline rendering. */
export default function Editor({ relPath, live }: { relPath: string; live: boolean }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const updateContent = useVault((s) => s.updateContent)
  const saveActive = useVault((s) => s.saveActive)

  useEffect(() => {
    if (!hostRef.current) return
    const initial = useVault.getState().contents[relPath] ?? ''

    const state = EditorState.create({
      doc: initial,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              void saveActive()
              return true
            }
          },
          indentWithTab,
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap
        ]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        obsidianTheme,
        wikilinkComplete(),
        EditorView.lineWrapping,
        ...(live ? [livePreview()] : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) updateContent(relPath, u.state.doc.toString())
        })
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current })
    view.focus()

    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relPath, live])

  return <div className="cm-host" ref={hostRef} />
}
