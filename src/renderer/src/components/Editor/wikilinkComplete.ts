import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { useVault } from '../../store/vaultStore'

/** Autocomplete note titles after typing `[[`. */
function wikilinkSource(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/\[\[([^\]\n]*)$/)
  if (!before) return null
  const query = before.text.slice(2).toLowerCase()
  const files = useVault.getState().files.filter((f) => f.name.toLowerCase().endsWith('.md'))

  const options = files
    .map((f) => f.name.replace(/\.md$/i, ''))
    .filter((title) => title.toLowerCase().includes(query))
    .slice(0, 50)
    .map((title) => ({ label: title, type: 'text', apply: `${title}]]` }))

  return { from: before.from + 2, options, validFor: /^[^\]\n]*$/ }
}

export function wikilinkComplete(): Extension {
  return autocompletion({ override: [wikilinkSource], icons: false })
}
