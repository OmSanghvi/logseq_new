/**
 * Obsidian-equivalent features for KOVA (Logseq edition).
 * All opencode UI imports replaced with plain HTML/Tailwind.
 *
 *  CommandPalette  — ⌘P
 *  QuickSwitcher   — ⌘O
 *  GraphFilterPanel
 *  BacklinksPanel
 *  TagBrowser
 *  TemplatePicker
 *  createDailyNote
 *  exportVaultAsMarkdown
 */

import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { graph, addNode, projectNodes, projectEdges } from "./store"
import type { KNode, NodeType } from "./types"
import { NODE_ACCENT, NODE_ICON } from "./types"

// ── Fuzzy match ───────────────────────────────────────────────────────────────

function fuzzy(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase(), t = text.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length
}

function score(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase(), t = text.toLowerCase()
  const idx = t.indexOf(q)
  if (idx === 0) return 3
  if (idx > 0)  return 2
  return fuzzy(q, t) ? 1 : 0
}

// ── Command Palette ───────────────────────────────────────────────────────────

export interface Command {
  id:       string
  label:    string
  category: string
  icon?:    string
  keybind?: string
  action:   () => void
}

export const CommandPalette: Component<{ commands: Command[]; onClose: () => void }> = (props) => {
  const [q, setQ]     = createSignal("")
  const [idx, setIdx] = createSignal(0)

  const filtered = createMemo(() =>
    props.commands
      .map(c => ({ cmd: c, s: score(q().trim(), c.label) + score(q().trim(), c.category) }))
      .filter(x => x.s > 0 || !q())
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map(x => x.cmd)
  )

  const run = (cmd: Command) => { cmd.action(); props.onClose() }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered().length - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === "Enter")     { e.preventDefault(); const c = filtered()[idx()]; if (c) run(c) }
    if (e.key === "Escape")    { props.onClose() }
  }

  return (
    <PaletteOverlay onClose={props.onClose}>
      <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span class="opacity-50">⌕</span>
        <input
          value={q()}
          onInput={e => { setQ(e.currentTarget.value); setIdx(0) }}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          class="flex-1 bg-transparent text-sm text-[--kova-text] placeholder:text-[--kova-weaker] outline-none"
          ref={el => requestAnimationFrame(() => el?.focus())}
        />
        <kbd class="text-[11px] text-[--kova-weaker] bg-white/5 border border-white/10 rounded px-1.5 py-0.5">Esc</kbd>
      </div>
      <div class="overflow-y-auto max-h-80 py-1" style={{ "scrollbar-width": "none" }}>
        <Show when={filtered().length === 0}>
          <p class="text-xs text-[--kova-weak] text-center py-6">No commands match "{q()}"</p>
        </Show>
        <For each={filtered()}>{(cmd, i) => (
          <button
            onClick={() => run(cmd)}
            class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
            classList={{ "bg-white/10": i() === idx() }}
            onMouseEnter={() => setIdx(i())}
            style={{ background: i() === idx() ? undefined : "none", border: "none" }}
          >
            <Show when={cmd.icon}>
              <span class="text-sm opacity-70">{cmd.icon}</span>
            </Show>
            <div class="flex-1 min-w-0">
              <div class="text-xs text-[--kova-text]">{cmd.label}</div>
              <div class="text-[11px] text-[--kova-weaker]">{cmd.category}</div>
            </div>
            <Show when={cmd.keybind}>
              <kbd class="text-[11px] text-[--kova-weaker] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 shrink-0">
                {cmd.keybind}
              </kbd>
            </Show>
          </button>
        )}</For>
      </div>
    </PaletteOverlay>
  )
}

// ── Quick Switcher ────────────────────────────────────────────────────────────

export const QuickSwitcher: Component<{ onSelect: (id: string) => void; onClose: () => void }> = (props) => {
  const [q, setQ]     = createSignal("")
  const [idx, setIdx] = createSignal(0)

  const results = createMemo(() =>
    projectNodes()
      .map(n => ({ node: n, s: score(q().trim(), n.title) + score(q().trim(), n.tags.join(" ")) }))
      .filter(x => x.s > 0 || !q())
      .sort((a, b) => {
        if (b.s !== a.s) return b.s - a.s
        if (a.node.starred && !b.node.starred) return -1
        if (b.node.starred && !a.node.starred) return 1
        return b.node.updatedAt - a.node.updatedAt
      })
      .slice(0, 15)
      .map(x => x.node)
  )

  const select = (id: string) => { props.onSelect(id); props.onClose() }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, results().length - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === "Enter")     { e.preventDefault(); const n = results()[idx()]; if (n) select(n.id) }
    if (e.key === "Escape")    { props.onClose() }
  }

  return (
    <PaletteOverlay onClose={props.onClose}>
      <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span class="opacity-50">⌕</span>
        <input
          value={q()}
          onInput={e => { setQ(e.currentTarget.value); setIdx(0) }}
          onKeyDown={onKeyDown}
          placeholder="Open note…"
          class="flex-1 bg-transparent text-sm text-[--kova-text] placeholder:text-[--kova-weaker] outline-none"
          ref={el => requestAnimationFrame(() => el?.focus())}
        />
      </div>
      <div class="overflow-y-auto max-h-80 py-1" style={{ "scrollbar-width": "none" }}>
        <For each={results()}>{(n, i) => (
          <button
            onClick={() => select(n.id)}
            class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
            classList={{ "bg-white/10": i() === idx() }}
            onMouseEnter={() => setIdx(i())}
            style={{ background: i() === idx() ? undefined : "none", border: "none" }}
          >
            <span class="shrink-0 text-[12px]" style={{ color: NODE_ACCENT[n.type] }}>{NODE_ICON[n.type]}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <Show when={n.starred}><span class="text-yellow-400 text-[10px]">★</span></Show>
                <span class="text-xs text-[--kova-text] truncate">{n.title}</span>
                <Show when={n.year}><span class="text-[11px] text-[--kova-weaker] shrink-0">{n.year}</span></Show>
              </div>
              <Show when={n.authors?.length}>
                <div class="text-[11px] text-[--kova-weaker] truncate">{n.authors!.slice(0, 2).join(", ")}</div>
              </Show>
            </div>
            <span class="text-[9px] text-[--kova-weaker] shrink-0 uppercase tracking-wide">{n.type.slice(0, 3)}</span>
          </button>
        )}</For>
        <Show when={results().length === 0 && q()}>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/10 transition-colors"
            style={{ background: "none", border: "none" }}
            onClick={() => {
              const n = addNode({ type: "text", title: q(), content: "", tags: [], source: "user" })
              props.onSelect(n.id)
              props.onClose()
            }}
          >
            <span class="text-green-400 text-sm">+</span>
            <span class="text-xs text-[--kova-text]">Create "{q()}"</span>
          </button>
        </Show>
      </div>
    </PaletteOverlay>
  )
}

// ── Graph Filter Panel ────────────────────────────────────────────────────────

export interface GraphFilter {
  types:    Set<NodeType>
  tags:     Set<string>
  starred:  boolean
  minConns: number
  search:   string
}

const ALL_TYPES: NodeType[] = ["paper", "text", "pdf", "url", "synthesis", "query", "annotation", "image"]

export const DEFAULT_FILTER: GraphFilter = {
  types:    new Set<NodeType>(ALL_TYPES),
  tags:     new Set<string>(),
  starred:  false,
  minConns: 0,
  search:   "",
}

export const GraphFilterPanel: Component<{ filter: GraphFilter; onChange: (f: GraphFilter) => void; onClose: () => void }> = (props) => {
  const allTags = createMemo(() => {
    const t = new Set<string>()
    for (const n of projectNodes()) for (const tag of n.tags) t.add(tag)
    return [...t].sort()
  })

  const toggle = <T,>(set: Set<T>, item: T): Set<T> => {
    const n = new Set(set); n.has(item) ? n.delete(item) : n.add(item); return n
  }

  return (
    <div class="flex flex-col gap-3 p-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-[--kova-text]">Graph filters</span>
        <button class="text-xs text-blue-400 hover:underline"
                style={{ background: "none", border: "none" }}
                onClick={() => props.onChange({ ...DEFAULT_FILTER, types: new Set(ALL_TYPES) })}>
          Reset
        </button>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-wider">Node types</span>
        <div class="flex flex-wrap gap-1">
          <For each={ALL_TYPES}>{t => {
            const active = () => props.filter.types.has(t)
            return (
              <button
                onClick={() => props.onChange({ ...props.filter, types: toggle(props.filter.types, t) })}
                class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                style={{
                  border: "none",
                  background: active() ? NODE_ACCENT[t] + "22" : "rgba(255,255,255,0.05)",
                  color: active() ? NODE_ACCENT[t] : "var(--kova-weak)",
                }}
              >
                {NODE_ICON[t]} {t}
              </button>
            )
          }}</For>
        </div>
      </div>

      <Show when={allTags().length > 0}>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-wider">Tags</span>
          <div class="flex flex-wrap gap-1">
            <For each={allTags()}>{tag => {
              const active = () => props.filter.tags.has(tag)
              return (
                <button
                  onClick={() => props.onChange({ ...props.filter, tags: toggle(props.filter.tags, tag) })}
                  class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                  classList={{ "text-blue-400 bg-blue-400/20": active(), "text-[--kova-weak] bg-white/5 hover:bg-white/10": !active() }}
                  style={{ border: "none" }}
                >#{tag}</button>
              )
            }}</For>
          </div>
        </div>
      </Show>

      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-wider">Options</span>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={props.filter.starred}
                 onChange={e => props.onChange({ ...props.filter, starred: e.currentTarget.checked })} />
          <span class="text-xs text-[--kova-text]">Starred only</span>
        </label>
        <div class="flex items-center gap-2">
          <span class="text-xs text-[--kova-weak] shrink-0">Min connections:</span>
          <input type="range" min="0" max="10" step="1"
                 value={props.filter.minConns}
                 onInput={e => props.onChange({ ...props.filter, minConns: parseInt(e.currentTarget.value) })}
                 class="flex-1" />
          <span class="text-[11px] text-[--kova-weak] w-4 text-right">{props.filter.minConns}</span>
        </div>
      </div>
    </div>
  )
}

export function applyFilter(nodes: KNode[], edges: ReturnType<typeof projectEdges>, filter: GraphFilter): KNode[] {
  return nodes.filter(n => {
    if (!filter.types.has(n.type)) return false
    if (filter.starred && !n.starred) return false
    if (filter.tags.size > 0 && !n.tags.some(t => filter.tags.has(t))) return false
    if (filter.minConns > 0) {
      const conns = edges.filter(e => e.source === n.id || e.target === n.id).length
      if (conns < filter.minConns) return false
    }
    if (filter.search) {
      const q = filter.search.toLowerCase()
      if (!n.title.toLowerCase().includes(q) && !n.content.toLowerCase().includes(q)) return false
    }
    return true
  })
}

// ── Backlinks Panel ───────────────────────────────────────────────────────────

export const BacklinksPanel: Component<{ nodeId: string; onSelect: (id: string) => void }> = (props) => {
  const inbound = createMemo(() =>
    projectEdges()
      .filter(e => e.target === props.nodeId)
      .map(e => {
        const src = projectNodes().find(n => n.id === e.source)
        return src ? { edge: e, node: src } : null
      }).filter(Boolean) as any[]
  )
  const outbound = createMemo(() =>
    projectEdges()
      .filter(e => e.source === props.nodeId)
      .map(e => {
        const tgt = projectNodes().find(n => n.id === e.target)
        return tgt ? { edge: e, node: tgt } : null
      }).filter(Boolean) as any[]
  )

  const LinkRow: Component<{ node: KNode; edgeType: string }> = (p) => (
    <button onClick={() => props.onSelect(p.node.id)}
            class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 transition-colors text-left"
            style={{ background: "none", border: "none" }}>
      <span style={{ color: NODE_ACCENT[p.node.type], "font-size": "10px" }}>{NODE_ICON[p.node.type]}</span>
      <span class="flex-1 text-xs text-[--kova-text] truncate">{p.node.title}</span>
      <span class="text-[10px] text-[--kova-weaker] shrink-0 uppercase tracking-wide">{p.edgeType.replace(/_/g, " ")}</span>
    </button>
  )

  return (
    <div class="flex flex-col">
      <div class="px-3 pt-2 pb-1">
        <span class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-wider">
          Linked here ({inbound().length})
        </span>
      </div>
      <Show when={inbound().length > 0} fallback={<p class="text-xs text-[--kova-weaker] px-3 pb-2">No inbound links</p>}>
        <For each={inbound()}>{({ edge, node }) => <LinkRow node={node} edgeType={edge.type} />}</For>
      </Show>
      <div class="h-px bg-white/10 mx-3 my-2" />
      <div class="px-3 pb-1">
        <span class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-wider">
          Links from here ({outbound().length})
        </span>
      </div>
      <Show when={outbound().length > 0} fallback={<p class="text-xs text-[--kova-weaker] px-3 pb-2">No outbound links</p>}>
        <For each={outbound()}>{({ edge, node }) => <LinkRow node={node} edgeType={edge.type} />}</For>
      </Show>
    </div>
  )
}

// ── Tag Browser ───────────────────────────────────────────────────────────────

export const TagBrowser: Component<{ activeTag?: string; onTagClick: (t: string) => void; onClear: () => void }> = (props) => {
  const tagCounts = createMemo(() => {
    const map = new Map<string, number>()
    for (const n of projectNodes()) for (const t of n.tags) map.set(t, (map.get(t) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  })

  return (
    <div class="p-2 flex flex-col gap-1">
      <Show when={props.activeTag}>
        <button onClick={props.onClear}
                class="flex items-center gap-1.5 text-xs text-blue-400 hover:underline px-1 mb-1"
                style={{ background: "none", border: "none" }}>
          ✕ Clear: #{props.activeTag}
        </button>
      </Show>
      <For each={tagCounts()}>{([tag, count]) => (
        <button onClick={() => props.onTagClick(tag)}
                class="flex items-center justify-between px-2 py-1 rounded-md transition-colors text-left"
                classList={{ "bg-blue-500/20 text-blue-400": props.activeTag === tag, "hover:bg-white/10 text-[--kova-text]": props.activeTag !== tag }}
                style={{ background: props.activeTag === tag ? undefined : "none", border: "none" }}>
          <span class="text-xs">#{tag}</span>
          <span class="text-[11px] text-[--kova-weaker]">{count}</span>
        </button>
      )}</For>
      <Show when={tagCounts().length === 0}>
        <p class="text-xs text-[--kova-weak] text-center py-4">No tags yet.</p>
      </Show>
    </div>
  )
}

// ── Daily Note ────────────────────────────────────────────────────────────────

export function createDailyNote() {
  const date  = new Date().toISOString().slice(0, 10)
  const title = `Research Log — ${date}`
  const existing = projectNodes().find(n => n.title === title)
  if (existing) return existing
  return addNode({
    type: "text", title,
    content: `# Research Log — ${date}\n\n## What I worked on\n\n*[Write here]*\n\n## Papers read\n\n- \n\n## Key insights\n\n- \n\n## Questions / next steps\n\n- `,
    tags: ["daily-log", date.slice(0, 7)],
    source: "user",
  })
}

// ── Note Templates ────────────────────────────────────────────────────────────

export interface NoteTemplate {
  id: string; label: string; icon: string; type: NodeType; content: string; tags: string[]
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "paper-review", label: "Paper review", icon: "◈", type: "paper",
    content: `# Paper Review\n\n## Citation\n\n*[Add citation here]*\n\n## Summary\n\n*[1-3 sentences]*\n\n## Key contributions\n\n1. \n2. \n3. \n\n## Methodology\n\n*[How did they do it?]*\n\n## Results\n\n*[Main findings]*\n\n## Strengths\n\n- \n\n## Weaknesses\n\n- \n\n## Relevance to my research\n\n*[Why does this matter?]*\n\n## Follow-up papers\n\n- `,
    tags: ["paper-review"],
  },
  {
    id: "research-question", label: "Research question", icon: "◎", type: "query",
    content: `# Research Question\n\n## Question\n\n*[State clearly]*\n\n## Why it matters\n\n*[Significance and motivation]*\n\n## Current state of the field\n\n*[What's known? What's the gap?]*\n\n## Hypothesis\n\n*[Your proposed answer]*\n\n## Approach\n\n1. \n2. \n3. \n\n## Success criteria\n\n*[How would you know you've answered it?]*`,
    tags: ["research-question"],
  },
  {
    id: "synthesis", label: "Literature synthesis", icon: "✦", type: "synthesis",
    content: `# Literature Synthesis\n\n## Topic\n\n*[What topic?]*\n\n## Key themes\n\n### Theme 1:\n\n*[Description]*\n\n### Theme 2:\n\n*[Description]*\n\n## Consensus view\n\n*[What does the field agree on?]*\n\n## Open debates\n\n*[What is contested?]*\n\n## Gaps\n\n*[What hasn't been studied?]*\n\n## Implications\n\n*[So what?]*`,
    tags: ["synthesis", "literature-review"],
  },
  {
    id: "experiment", label: "Experiment plan", icon: "≡", type: "text",
    content: `# Experiment Plan\n\n## Hypothesis\n\n*[What are you testing?]*\n\n## Variables\n\n- **Independent:** \n- **Dependent:** \n- **Controlled:** \n\n## Method\n\n1. \n2. \n3. \n\n## Expected results\n\n*[What do you predict?]*\n\n## Metrics\n\n*[How will you measure success?]*`,
    tags: ["experiment"],
  },
  {
    id: "meeting", label: "Meeting notes", icon: "✎", type: "annotation",
    content: `# Meeting Notes — ${new Date().toISOString().slice(0, 10)}\n\n## Attendees\n\n- \n\n## Discussion\n\n*[Key points]*\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] \n\n## Next steps\n\n- `,
    tags: ["meeting"],
  },
]

export const TemplatePicker: Component<{ onSelect: (t: NoteTemplate) => void; onClose: () => void }> = (props) => (
  <PaletteOverlay onClose={props.onClose} narrow>
    <div class="px-3 py-2 border-b border-white/10">
      <p class="text-xs font-medium text-[--kova-text]">Choose template</p>
    </div>
    <div class="py-1">
      <For each={NOTE_TEMPLATES}>{t => (
        <button
          onClick={() => { props.onSelect(t); props.onClose() }}
          class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 transition-colors text-left"
          style={{ background: "none", border: "none" }}
        >
          <span class="text-base shrink-0">{t.icon}</span>
          <div>
            <div class="text-xs text-[--kova-text]">{t.label}</div>
            <div class="text-[11px] text-[--kova-weaker] mt-0.5">{t.tags.map(tag => `#${tag}`).join("  ")}</div>
          </div>
        </button>
      )}</For>
      <button onClick={() => props.onClose()}
              class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 transition-colors text-left"
              style={{ background: "none", border: "none" }}>
        <span class="text-base shrink-0">∅</span>
        <span class="text-xs text-[--kova-text]">Blank note</span>
      </button>
    </div>
  </PaletteOverlay>
)

// ── Export Vault ──────────────────────────────────────────────────────────────

export function exportVaultAsMarkdown() {
  const nodes = projectNodes()
  const parts: string[] = []
  for (const n of nodes) {
    const front = [
      `---`,
      `title: "${n.title.replace(/"/g, '\\"')}"`,
      `type: ${n.type}`,
      `tags: [${n.tags.map(t => `"${t}"`).join(", ")}]`,
      n.authors?.length ? `authors: [${n.authors.map(a => `"${a}"`).join(", ")}]` : "",
      n.year  ? `year: ${n.year}` : "",
      n.doi   ? `doi: "${n.doi}"` : "",
      n.url   ? `url: "${n.url}"` : "",
      n.starred ? `starred: true` : "",
      `created: "${new Date(n.createdAt).toISOString()}"`,
      `---`, "",
    ].filter(Boolean)
    parts.push(front.join("\n") + n.content)
    parts.push("\n---\n")
  }
  const blob = new Blob([parts.join("\n")], { type: "text/markdown" })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement("a"), { href: url, download: `kova-vault-${new Date().toISOString().slice(0,10)}.md` })
  a.click()
  URL.revokeObjectURL(url)
}

// ── Shared overlay ────────────────────────────────────────────────────────────

const PaletteOverlay: Component<{ children: any; onClose: () => void; narrow?: boolean }> = (props) => (
  <div class="fixed inset-0 z-50 flex items-start justify-center pt-24"
       onClick={e => { if (e.target === e.currentTarget) props.onClose() }}>
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />
    <div class="relative rounded-xl bg-[--kova-surface] border border-white/15 shadow-2xl overflow-hidden z-10"
         style={{ width: props.narrow ? "320px" : "480px", "max-height": "70vh" }}>
      {props.children}
    </div>
  </div>
)
