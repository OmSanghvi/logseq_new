import Palette, { type PaletteItem } from './Palette'

export interface Command {
  id: string
  title: string
  run: () => void
}

/** Cmd+P — run a command. */
export default function CommandPalette({
  commands,
  onClose
}: {
  commands: Command[]
  onClose: () => void
}): JSX.Element {
  const items: PaletteItem[] = commands.map((c) => ({
    id: c.id,
    title: c.title,
    haystack: c.title.toLowerCase(),
    run: c.run
  }))
  return <Palette placeholder="Run a command…" items={items} onClose={onClose} />
}
