/**
 * NodePanel — rich node detail panel for KOVA (Logseq edition).
 * All opencode-specific UI imports replaced with plain Tailwind/HTML.
 */

import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import type { KNode, KEdge, KInsight } from "./types"
import { NODE_ACCENT, EDGE_ACCENT, NODE_BADGE } from "./types"
import { graph, addEdge, updateNode, pushLog } from "./store"

interface Props {
  node:              KNode
  aiRunning?:        boolean
  onClose:           () => void
  onNavigate:        (id: string) => void
  onAiInsights?:     () => void
  onAddToSelection?: () => void
  isSelected?:       boolean
}

const NodePanel: Component<Props> = (props) => {
  const [editMode,     setEditMode]     = createSignal(false)
  const [editContent,  setEditContent]  = createSignal(props.node.content)
  const [linkQ,        setLinkQ]        = createSignal("")
  const [linkFocused,  setLinkFocused]  = createSignal(false)

  const accent = () => NODE_ACCENT[props.node.type] ?? "#c4c4c4"

  const connections = createMemo(() =>
    graph.edges
      .filter(e => e.source === props.node.id || e.target === props.node.id)
      .map(e => {
        const otherId = e.source === props.node.id ? e.target : e.source
        const other = graph.nodes.find(n => n.id === otherId)
        return other ? { edge: e, node: other } : null
      })
      .filter(Boolean) as { edge: KEdge; node: KNode }[]
  )

  const insights = createMemo(() =>
    graph.insights
      .filter(i => i.nodeId === props.node.id)
      .sort((a, b) => b.confidence - a.confidence)
  )

  const linkSuggestions = createMemo(() => {
    const q = linkQ().toLowerCase().trim()
    if (!q) return []
    return graph.nodes
      .filter(n => n.id !== props.node.id && n.title.toLowerCase().includes(q))
      .slice(0, 6)
  })

  const saveEdit = () => {
    updateNode(props.node.id, { content: editContent() })
    setEditMode(false)
    pushLog({ type: "analysis", message: `Updated: "${props.node.title}"`, nodeId: props.node.id })
  }

  const createLink = (targetId: string) => {
    addEdge({
      source: props.node.id, target: targetId,
      type: "user_created", strength: 0.8,
      confidence: 1, reasoning: "User-created link",
      discoveredBy: "user",
    })
    setLinkQ("")
    setLinkFocused(false)
  }

  return (
    <div class="flex flex-col h-full overflow-hidden bg-[--kova-bg]">

      {/* Header */}
      <div class="shrink-0 px-4 pt-4 pb-3 border-b border-white/10">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider"
              style={{ background: `${accent()}22`, color: accent(), border: `1px solid ${accent()}44` }}
            >
              {NODE_BADGE[props.node.type] ?? props.node.type}
            </span>
            <Show when={props.node.confidence != null}>
              <span class="text-xs text-[--kova-weak]">
                {Math.round(props.node.confidence! * 100)}% confidence
              </span>
            </Show>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <Show when={props.onAiInsights}>
              <IconBtn label="✦" title="Generate AI insights" disabled={props.aiRunning} onClick={props.onAiInsights!} />
            </Show>
            <Show when={props.onAddToSelection}>
              <IconBtn label={props.isSelected ? "✓" : "+"} title={props.isSelected ? "In selection" : "Add to selection"} onClick={props.onAddToSelection!} />
            </Show>
            <IconBtn label={editMode() ? "✕" : "✎"} title={editMode() ? "Cancel" : "Edit"} onClick={() => {
              if (editMode()) setEditMode(false)
              else { setEditContent(props.node.content); setEditMode(true) }
            }} />
            <IconBtn label="✕" title="Close" onClick={props.onClose} />
          </div>
        </div>
        <h2 class="text-sm font-medium text-[--kova-text] leading-snug">{props.node.title}</h2>
      </div>

      {/* Scrollable body */}
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4" style={{ "scrollbar-width": "none" }}>

        {/* Metadata */}
        <Section title="Metadata">
          <div class="flex flex-col gap-1.5">
            <Show when={props.node.authors?.length}>
              <Row label="Authors" value={props.node.authors!.join(", ")} />
            </Show>
            <Show when={props.node.year}>
              <Row label="Year" value={String(props.node.year)} />
            </Show>
            <Show when={props.node.venue}>
              <Row label="Venue" value={props.node.venue!} />
            </Show>
            <Show when={props.node.doi}>
              <Row label="DOI" value={props.node.doi!} />
            </Show>
            <Show when={props.node.url}>
              <div class="flex gap-2">
                <span class="text-xs text-[--kova-weak] min-w-[52px] shrink-0">URL</span>
                <a href={props.node.url} target="_blank" rel="noopener noreferrer"
                   class="text-xs text-blue-400 truncate hover:underline">
                  {props.node.url}
                </a>
              </div>
            </Show>
            <Row label="Source" value={props.node.source} />
            <Show when={props.node.tags.length > 0}>
              <div class="flex gap-2 items-start">
                <span class="text-xs text-[--kova-weak] min-w-[52px] shrink-0 mt-0.5">Tags</span>
                <div class="flex flex-wrap gap-1">
                  <For each={props.node.tags}>{tag => (
                    <span class="text-[11px] text-[--kova-weak] bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                      #{tag}
                    </span>
                  )}</For>
                </div>
              </div>
            </Show>
          </div>
        </Section>

        {/* Content */}
        <Section title="Content">
          <Show
            when={!editMode()}
            fallback={
              <div class="flex flex-col gap-2">
                <textarea
                  value={editContent()}
                  onInput={e => setEditContent(e.currentTarget.value)}
                  rows={10}
                  class="w-full px-3 py-2 rounded bg-black/30 border border-white/10 text-xs text-[--kova-text] resize-y focus:outline-none focus:border-white/30 font-mono"
                />
                <div class="flex gap-2 justify-end">
                  <button class="kova-btn" onClick={() => setEditMode(false)}>Cancel</button>
                  <button class="kova-btn kova-btn-primary" onClick={saveEdit}>Save</button>
                </div>
              </div>
            }
          >
            <div class="text-xs text-[--kova-text] leading-relaxed whitespace-pre-wrap">
              {props.node.content}
            </div>
          </Show>
        </Section>

        {/* Connections */}
        <Section title={`Connections (${connections().length})`}>
          <Show when={connections().length === 0}>
            <p class="text-xs text-[--kova-weak]">No connections yet.</p>
          </Show>
          <div class="flex flex-col gap-2">
            <For each={connections()}>{({ edge, node }) => {
              const ec = EDGE_ACCENT[edge.type] ?? "#4b4b5a"
              return (
                <button
                  onClick={() => props.onNavigate(node.id)}
                  class="w-full text-left rounded border border-white/10 bg-white/5 p-2.5 flex flex-col gap-1.5 hover:bg-white/10 transition-colors"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-medium text-[--kova-text] flex-1 truncate">{node.title}</span>
                    <span class="shrink-0 px-1.5 py-0.5 rounded uppercase text-[9px] tracking-wide"
                          style={{ background: `${ec}22`, color: ec, border: `1px solid ${ec}44` }}>
                      {edge.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div class="h-0.5 rounded-full bg-white/10 overflow-hidden">
                    <div class="h-full rounded-full" style={{ width: `${edge.confidence * 100}%`, background: ec }} />
                  </div>
                  <Show when={edge.reasoning}>
                    <p class="text-[11px] text-[--kova-weak] leading-snug">{edge.reasoning}</p>
                  </Show>
                </button>
              )
            }}</For>
          </div>

          {/* Link creator */}
          <div class="mt-2 relative">
            <input
              value={linkQ()}
              onInput={e => setLinkQ(e.currentTarget.value)}
              onFocus={() => setLinkFocused(true)}
              onBlur={() => setTimeout(() => setLinkFocused(false), 150)}
              placeholder="Link to node…"
              class="w-full px-3 py-1.5 rounded bg-black/30 border border-white/10 text-xs text-[--kova-text] placeholder:text-[--kova-weaker] focus:outline-none focus:border-white/30 transition-colors"
            />
            <Show when={linkFocused() && linkSuggestions().length > 0}>
              <div class="absolute top-full left-0 right-0 mt-1 z-50 rounded border border-white/20 bg-[--kova-surface] shadow-xl overflow-hidden">
                <For each={linkSuggestions()}>{n => (
                  <button
                    onClick={() => createLink(n.id)}
                    class="w-full text-left px-3 py-2 text-xs text-[--kova-text] hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <span class="opacity-60">+</span> {n.title}
                  </button>
                )}</For>
              </div>
            </Show>
          </div>
        </Section>

        {/* AI Insights */}
        <Show when={insights().length > 0}>
          <Section title="AI Insights">
            <div class="flex flex-col gap-2">
              <For each={insights()}>{ins => {
                const [open, setOpen] = createSignal(false)
                const c = "#9dbefe"
                return (
                  <div class="rounded border p-2.5 flex flex-col gap-1.5"
                       style={{ "border-color": `${c}33`, background: `${c}0a` }}>
                    <div class="flex items-center justify-between gap-2">
                      <span class="px-1.5 py-0.5 rounded uppercase text-[9px] tracking-wide"
                            style={{ background: `${c}22`, color: c, border: `1px solid ${c}44` }}>
                        {ins.type.replace(/_/g, " ")}
                      </span>
                      <span class="text-xs text-[--kova-weak] shrink-0">{Math.round(ins.confidence * 100)}%</span>
                    </div>
                    <p class="text-xs text-[--kova-text] leading-snug">{ins.content}</p>
                    <Show when={ins.evidence.length > 0}>
                      <button onClick={() => setOpen(v => !v)}
                              class="text-xs text-[--kova-weak] hover:text-[--kova-text] text-left transition-colors">
                        {open() ? "▾ Hide evidence" : "▸ Show evidence"} ({ins.evidence.length})
                      </button>
                      <Show when={open()}>
                        <ul class="pl-3 flex flex-col gap-0.5">
                          <For each={ins.evidence}>{ev => <li class="text-[11px] text-[--kova-weak] list-disc">{ev}</li>}</For>
                        </ul>
                      </Show>
                    </Show>
                  </div>
                )
              }}</For>
            </div>
          </Section>
        </Show>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const Section: Component<{ title: string; children: any }> = (props) => (
  <div class="flex flex-col gap-2">
    <h3 class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-widest">
      {props.title}
    </h3>
    <div class="rounded-lg bg-white/5 border border-white/10 p-3">
      {props.children}
    </div>
  </div>
)

const Row: Component<{ label: string; value: string }> = (props) => (
  <div class="flex gap-2">
    <span class="text-xs text-[--kova-weak] min-w-[52px] shrink-0">{props.label}</span>
    <span class="text-xs text-[--kova-text]">{props.value}</span>
  </div>
)

const IconBtn: Component<{ label: string; title: string; disabled?: boolean; onClick: () => void }> = (p) => (
  <button
    title={p.title}
    disabled={p.disabled}
    onClick={p.onClick}
    class="w-6 h-6 flex items-center justify-center rounded text-[--kova-weak] hover:text-[--kova-text] hover:bg-white/10 transition-colors text-sm disabled:opacity-40"
  >
    {p.label}
  </button>
)

export default NodePanel
