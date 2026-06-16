import { fileKind } from '../store/vaultStore'
import MarkdownView from './Editor/MarkdownView'
import Editor from './Editor/Editor'
import PdfView from './Viewers/PdfView'
import ImageView from './Viewers/ImageView'

/** Routes the active file to the right view based on its type. */
export default function ContentView({ relPath }: { relPath: string }): JSX.Element {
  const kind = fileKind(relPath)
  switch (kind) {
    case 'markdown':
      return <MarkdownView relPath={relPath} />
    case 'pdf':
      return <PdfView relPath={relPath} />
    case 'image':
      return <ImageView relPath={relPath} />
    case 'text':
      return <Editor key={relPath} relPath={relPath} live={false} />
    default:
      return (
        <div className="empty-state" style={{ flex: 1 }}>
          <h2>Can’t preview this file</h2>
          <p>{relPath}</p>
        </div>
      )
  }
}
