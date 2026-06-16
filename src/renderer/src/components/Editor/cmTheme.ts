import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/** Obsidian-flavored markdown highlighting for CodeMirror 6 source mode. */
const obsidianHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.8em', fontWeight: '700', color: '#dadada', lineHeight: '1.3' },
  { tag: t.heading2, fontSize: '1.5em', fontWeight: '700', color: '#dadada' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '600', color: '#dadada' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600', color: '#dadada' },
  { tag: t.strong, fontWeight: '700', color: '#e8e8e8' },
  { tag: t.emphasis, fontStyle: 'italic', color: '#e8e8e8' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#888' },
  { tag: t.link, color: '#8a5cf6', textDecoration: 'underline' },
  { tag: t.url, color: '#7aa2f7' },
  { tag: t.monospace, fontFamily: 'var(--font-editor)', color: '#e5c07b', background: 'rgba(255,255,255,0.06)' },
  { tag: t.quote, color: '#999', fontStyle: 'italic' },
  // Note: t.list in lezer-markdown spans the whole list item, so don't color it
  // (that tinted all list text). The bullet glyph is styled in live preview instead.
  { tag: t.meta, color: '#666' },
  { tag: t.processingInstruction, color: '#666' },
  { tag: t.contentSeparator, color: '#555' }
])

const obsidianEditorTheme = EditorView.theme(
  {
    '&': { color: 'var(--text-normal)', backgroundColor: 'var(--bg-primary)' },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' }
  },
  { dark: true }
)

export const obsidianTheme = [obsidianEditorTheme, syntaxHighlighting(obsidianHighlight)]
