import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Database, RefreshCw, Send, Sparkles, Trash2 } from 'lucide-react'
import { renderMarkdown } from '../../lib/markdown'
import { useResolvers } from '../../lib/resolvers'
import { useVault } from '../../store/vaultStore'
import { useAi, type ChatTurn } from '../../store/aiStore'

function AssistantMessage({ turn }: { turn: ChatTurn }): JSX.Element {
  const resolvers = useResolvers()
  const openByTitle = useVault((s) => s.openByTitle)
  const openFile = useVault((s) => s.openFile)
  const html = useMemo(
    () => renderMarkdown(turn.content || '…', resolvers),
    [turn.content, resolvers]
  )

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    const href = a?.getAttribute('data-href')
    if (href !== null && href !== undefined) {
      e.preventDefault()
      void openByTitle(href, false)
    }
  }

  return (
    <div className="ai-msg ai-msg-assistant">
      <div className="markdown-rendered" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {turn.sources && turn.sources.length > 0 && (
        <div className="ai-sources">
          {[...new Map(turn.sources.map((s) => [s.relPath, s])).values()].map((s) => (
            <button
              key={s.relPath}
              className="ai-source-chip"
              title={`${s.relPath} (score ${s.score.toFixed(2)})`}
              onClick={() => void openFile(s.relPath, s.relPath.split('/').pop()!)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AiPanel(): JSX.Element {
  const vault = useVault((s) => s.vault)
  const { status, messages, streaming, progress, refreshStatus, reindex, ask, clear } = useAi()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void refreshStatus(vault?.root ?? null)
  }, [vault, refreshStatus])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const send = (): void => {
    const q = input.trim()
    if (!q || !vault || streaming) return
    setInput('')
    void ask(vault.root, q)
  }

  const needsIndex = status && status.indexed === 0
  const embedMissing = status && status.ollamaUp && !status.hasEmbed

  return (
    <aside className="right-sidebar ai-panel">
      <div className="right-sidebar-header">
        <Sparkles size={14} />
        <span style={{ flex: 1 }}>AI Assistant</span>
        <button className="icon-btn" title="Clear chat" onClick={clear}>
          <Trash2 size={14} />
        </button>
        <button
          className="icon-btn"
          title="Re-index vault"
          onClick={() => vault && void reindex(vault.root)}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="ai-status">
        {!status && 'Checking Ollama…'}
        {status && !status.ollamaUp && '⚠️ Ollama not running (start it with: ollama serve)'}
        {status && status.ollamaUp && (
          <span>
            <Database size={11} style={{ verticalAlign: '-1px' }} /> {status.indexed} chunks ·{' '}
            {status.chatModel}
          </span>
        )}
      </div>

      {progress && (
        <div className="ai-progress">
          Indexing… {progress.done}/{progress.total} {progress.file}
        </div>
      )}

      {embedMissing && (
        <div className="ai-warn">
          Embedding model missing. Run <code>ollama pull nomic-embed-text</code>.
        </div>
      )}

      {needsIndex && !progress && status?.hasEmbed && (
        <div className="ai-warn">
          Your vault isn’t indexed yet.{' '}
          <button className="link-btn" onClick={() => vault && void reindex(vault.root)}>
            Index now
          </button>
        </div>
      )}

      <div className="ai-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            Ask anything about your notes. I’ll retrieve the most relevant ones and answer with
            citations.
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ai-msg ai-msg-user">
              {m.content}
            </div>
          ) : (
            <AssistantMessage key={i} turn={m} />
          )
        )}
      </div>

      <div className="ai-input-row">
        <textarea
          className="ai-input"
          placeholder="Ask your vault…"
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button className="icon-btn ai-send" onClick={send} disabled={streaming} title="Send">
          <Send size={16} />
        </button>
      </div>
    </aside>
  )
}
