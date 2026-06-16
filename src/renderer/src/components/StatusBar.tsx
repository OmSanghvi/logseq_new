import { useVault } from '../store/vaultStore'

function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

export default function StatusBar(): JSX.Element {
  const activePath = useVault((s) => s.activePath)
  const contents = useVault((s) => s.contents)
  const text = activePath ? (contents[activePath] ?? '') : ''

  return (
    <div className="statusbar">
      {activePath && (
        <>
          <span>{wordCount(text)} words</span>
          <span>{text.length} chars</span>
        </>
      )}
    </div>
  )
}
