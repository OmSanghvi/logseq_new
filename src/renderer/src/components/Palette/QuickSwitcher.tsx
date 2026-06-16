import Palette, { type PaletteItem } from './Palette'
import { useVault } from '../../store/vaultStore'

/** Cmd+O — jump to any note by name. */
export default function QuickSwitcher({ onClose }: { onClose: () => void }): JSX.Element {
  const files = useVault((s) => s.files)
  const openFile = useVault((s) => s.openFile)

  const items: PaletteItem[] = files
    .filter((f) => f.name.toLowerCase().endsWith('.md'))
    .map((f) => ({
      id: f.relPath,
      title: f.name.replace(/\.md$/i, ''),
      subtitle: f.relPath.includes('/') ? f.relPath : undefined,
      haystack: f.relPath.toLowerCase(),
      run: () => void openFile(f.relPath, f.name)
    }))

  return <Palette placeholder="Find or open a note…" items={items} onClose={onClose} />
}
