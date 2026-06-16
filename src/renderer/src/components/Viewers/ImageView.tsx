import { useVault } from '../../store/vaultStore'

export default function ImageView({ relPath }: { relPath: string }): JSX.Element {
  const absPath = useVault((s) => s.absPath)
  const url = window.vault.fileUrl(absPath(relPath))
  return (
    <div className="file-viewer image-viewer">
      <img src={url} alt={relPath} />
    </div>
  )
}
