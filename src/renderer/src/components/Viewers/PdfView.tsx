import { useVault } from '../../store/vaultStore'

/** Renders a real PDF using Chromium's built-in viewer via the vaultfile:// protocol. */
export default function PdfView({ relPath }: { relPath: string }): JSX.Element {
  const absPath = useVault((s) => s.absPath)
  const url = window.vault.fileUrl(absPath(relPath))
  return (
    <div className="file-viewer pdf-viewer">
      <iframe className="pdf-frame" src={url} title={relPath} />
    </div>
  )
}
