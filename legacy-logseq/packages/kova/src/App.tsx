/**
 * KOVA Research IDE — main app shell.
 * Obsidian-style layout: left sidebar (panels) + graph canvas + right node panel.
 * All keyboard shortcuts wired up (⌘P, ⌘O, ⌘K, ⌘N, ⌘G).
 */

import {
  createEffect, createMemo, createSignal,
  onCleanup, Show, For, type Component,
} from "solid-js"

import GraphView              from "./GraphView"
import NodePanel              from "./NodePanel"
import AddNodeDialog          from "./AddNodeDialog"
import {
  CommandPalette, QuickSwitcher, GraphFilterPanel,
  BacklinksPanel, TagBrowser, TemplatePicker,
  createDailyNote, exportVaultAsMarkdown,
  applyFilter, DEFAULT_FILTER, type GraphFilter, type Command, type NoteTemplate,
} from "./obsidian"
import {
  graph, setSelectedId, selectedId,
  searchQ, setSearchQ,
  activePanel, setActivePanel,
  viewMode, setViewMode,
  projectNodes, projectEdges,
  addNode, deleteNode, toggleStar,
  activeProject, addProject, switchProject,
  generateOutline, getThreadSuggestions, importSuggestion,
  log, type Panel,
} from "./store"

import { NODE_ACCENT, NODE_ICON } from "./types"

import {
  discoverConnections, generateInsights, followResearchThread, aiTasks,
} from "./ai-engine"

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar panel IDs and their icons
// ─────────────────────────────────────────────────────────────────────────────

const PANELS: { id: Panel; icon: string; title: string }[] = [
  { id: "files",      icon: "≡",  title: "Nodes"      },
  { id: "search",     icon: "⌕",  title: "Search"     },
  { id: "references", icon: "◈",  title: "Backlinks"  },
  { id: "log",        icon: "⚡",  title: "Activity"   },
  { id: "drafts",     icon: "✦",  title: "Drafts"     },
]

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

const App: Component = () => {
  const [showCmdPalette,   setShowCmdPalette]   = createSignal(false)
  const [showQuickSwitcher,setShowQuickSwitcher] = createSignal(false)
  const [showAddNode,      setShowAddNode]       = createSignal(false)
  const [showTemplatePicker,setShowTemplatePicker] = createSignal(false)
  const [showFilterPanel,  setShowFilterPanel]   = createSignal(false)
  const [selection,        setSelection]         = createSignal<Set<string>>(new Set())
  const [filter,           setFilter]            = createSignal<GraphFilter>({ ...DEFAULT_FILTER, types: new Set(DEFAULT_FILTER.types) })
  const [activeTag,        setActiveTag]         = createSignal<string | undefined>()
  const [aiRunning,        setAiRunning]         = createSignal(false)

  // Filtered nodes for the graph
  const visibleNodes = createMemo(() => applyFilter(projectNodes(), projectEdges(), filter()))
  const visibleEdges = createMemo(() => {
    const ids = new Set(visibleNodes().map(n => n.id))
    return projectEdges().filter(e => ids.has(e.source) && ids.has(e.target))
  })

  const selectedNode = createMemo(() =>
    graph.nodes.find(n => n.id === selectedId())
  )

  // ── Commands ────────────────────────────────────────────────────────────────
  const commands: Command[] = [
    { id: "new-node",      label: "New node",            category: "Create",   icon: "+",  keybind: "⌘N", action: () => setShowAddNode(true) },
    { id: "new-template",  label: "New from template",   category: "Create",   icon: "◈",  action: () => setShowTemplatePicker(true) },
    { id: "daily-note",    label: "Open today's log",    category: "Create",   icon: "📅", action: () => { const n = createDailyNote(); setSelectedId(n.id) } },
    { id: "quick-switch",  label: "Quick switcher",      category: "Navigate", icon: "⌕",  keybind: "⌘O", action: () => setShowQuickSwitcher(true) },
    { id: "filter-graph",  label: "Filter graph",        category: "View",     icon: "⚙",  action: () => setShowFilterPanel(true) },
    { id: "view-graph",    label: "Graph view",          category: "View",     action: () => setViewMode("graph") },
    { id: "view-outline",  label: "Outline view",        category: "View",     action: () => setViewMode("outline") },
    { id: "export-vault",  label: "Export vault as Markdown", category: "Export", icon: "⬇", action: exportVaultAsMarkdown },
    { id: "new-project",   label: "New project",         category: "Project",  icon: "+",  action: () => { const name = prompt("Project name:"); if (name) { const p = addProject(name); switchProject(p.id) } } },
    { id: "ai-discover",   label: "AI: Discover connections", category: "AI", icon: "✦",
      action: async () => {
        const ids = selection().size > 0 ? [...selection()] : projectNodes().slice(0, 8).map(n => n.id)
        setAiRunning(true)
        try { await discoverConnections(ids) } finally { setAiRunning(false) }
      }
    },
    { id: "ai-insights",   label: "AI: Generate insights for selected", category: "AI", icon: "✦",
      action: async () => {
        const id = selectedId()
        if (!id) return alert("Select a node first")
        setAiRunning(true)
        try { await generateInsights(id) } finally { setAiRunning(false) }
      }
    },
    { id: "ai-thread",     label: "AI: Follow research threads", category: "AI", icon: "→",
      action: async () => {
        const ids = selection().size > 0 ? [...selection()] : (selectedId() ? [selectedId()!] : [])
        if (!ids.length) return alert("Select nodes first")
        setAiRunning(true)
        try {
          const results = await followResearchThread(ids)
          results.forEach(r => importSuggestion(r))
        } finally { setAiRunning(false) }
      }
    },
    { id: "delete-node",   label: "Delete selected node", category: "Edit",
      action: () => { const id = selectedId(); if (id && confirm("Delete this node?")) { deleteNode(id); setSelectedId(undefined) } }
    },
    { id: "star-node",     label: "Star/unstar selected node", category: "Edit",
      action: () => { const id = selectedId(); if (id) toggleStar(id) }
    },
    { id: "generate-outline", label: "Generate paper outline from selection", category: "Write",
      action: () => {
        const ids = selection().size > 0 ? [...selection()] : projectNodes().slice(0, 5).map(n => n.id)
        const title = prompt("Outline title:") ?? "Research Outline"
        generateOutline(title, ids)
      }
    },
  ]

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key === "p") { e.preventDefault(); setShowCmdPalette(v => !v) }
    if (meta && e.key === "o") { e.preventDefault(); setShowQuickSwitcher(v => !v) }
    if (meta && e.key === "n") { e.preventDefault(); setShowAddNode(true) }
    if (meta && e.key === "g") { e.preventDefault(); setViewMode(v => v === "graph" ? "outline" : "graph") }
    if (e.key === "Escape") {
      setShowCmdPalette(false)
      setShowQuickSwitcher(false)
      setShowAddNode(false)
      setShowTemplatePicker(false)
      setShowFilterPanel(false)
    }
  }

  window.addEventListener("keydown", onKeyDown)
  onCleanup(() => window.removeEventListener("keydown", onKeyDown))

  // ── Template handler ─────────────────────────────────────────────────────────
  const onTemplateSelect = (t: NoteTemplate) => {
    const n = addNode({ type: t.type, title: `New ${t.label} — ${new Date().toLocaleDateString()}`, content: t.content, tags: t.tags, source: "user" })
    setSelectedId(n.id)
  }

  // ── Tag filter shortcut ───────────────────────────────────────────────────────
  const onTagClick = (tag: string) => {
    setActiveTag(tag)
    setFilter(f => ({ ...f, tags: new Set([tag]) }))
    setActivePanel("search")
  }

  return (
    <div class="kova-app flex h-screen overflow-hidden select-none">

      {/* ── Activity icon rail ── */}
      <div class="kova-rail flex flex-col items-center py-3 gap-1 w-10 shrink-0 border-r border-white/10">
        <For each={PANELS}>{p => (
          <button
            title={p.title}
            onClick={() => setActivePanel(ap => ap === p.id ? "files" : p.id)}
            class="w-8 h-8 flex items-center justify-center rounded transition-colors text-sm"
            classList={{
              "bg-white/15 text-[--kova-text]": activePanel() === p.id,
              "text-[--kova-weak] hover:text-[--kova-text] hover:bg-white/10": activePanel() !== p.id,
            }}
          >
            {p.icon}
          </button>
        )}</For>
        <div class="flex-1" />
        <button
          title="AI Discover (⌘D)"
          disabled={aiRunning()}
          onClick={async () => {
            const ids = selection().size > 0 ? [...selection()] : projectNodes().slice(0, 8).map(n => n.id)
            setAiRunning(true)
            try { await discoverConnections(ids) } finally { setAiRunning(false) }
          }}
          class="w-8 h-8 flex items-center justify-center rounded text-sm transition-colors"
          classList={{ "animate-pulse text-purple-400": aiRunning(), "text-[--kova-weak] hover:text-purple-400 hover:bg-purple-400/10": !aiRunning() }}
        >
          ✦
        </button>
      </div>

      {/* ── Left panel ── */}
      <div class="kova-left-panel w-56 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        <div class="shrink-0 px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
          <span class="text-[11px] font-medium text-[--kova-weak] uppercase tracking-wider">
            {PANELS.find(p => p.id === activePanel())?.title ?? "Nodes"}
          </span>
          <div class="flex gap-1">
            <button title="Add node (⌘N)" onClick={() => setShowAddNode(true)}
                    class="w-5 h-5 flex items-center justify-center rounded text-[--kova-weak] hover:text-[--kova-text] hover:bg-white/10 text-sm transition-colors"
                    style={{ background: "none", border: "none" }}>+</button>
            <button title="Filter graph" onClick={() => setShowFilterPanel(true)}
                    class="w-5 h-5 flex items-center justify-center rounded text-[--kova-weak] hover:text-[--kova-text] hover:bg-white/10 text-xs transition-colors"
                    style={{ background: "none", border: "none" }}>⚙</button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto" style={{ "scrollbar-width": "none" }}>
          {/* Files panel */}
          <Show when={activePanel() === "files"}>
            <NodeList onSelect={id => setSelectedId(id)} selectedId={selectedId()} selection={selection()} onToggleSelection={id => setSelection(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })} />
          </Show>

          {/* Search panel */}
          <Show when={activePanel() === "search"}>
            <div class="p-2">
              <input
                value={searchQ()}
                onInput={e => setSearchQ(e.currentTarget.value)}
                placeholder="Search nodes…"
                class="kova-input w-full"
              />
            </div>
            <Show when={activeTag()}>
              <TagBrowser activeTag={activeTag()} onTagClick={onTagClick} onClear={() => { setActiveTag(undefined); setFilter(f => ({ ...f, tags: new Set() })) }} />
            </Show>
            <NodeList
              onSelect={id => setSelectedId(id)}
              selectedId={selectedId()}
              selection={selection()}
              onToggleSelection={id => setSelection(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })}
              filterFn={n => !searchQ() || n.title.toLowerCase().includes(searchQ().toLowerCase()) || n.tags.some(t => t.includes(searchQ().toLowerCase()))}
            />
          </Show>

          {/* Backlinks panel */}
          <Show when={activePanel() === "references"}>
            <Show when={selectedId()} fallback={<p class="text-xs text-[--kova-weaker] p-4 text-center">Select a node to see links</p>}>
              <BacklinksPanel nodeId={selectedId()!} onSelect={id => setSelectedId(id)} />
            </Show>
          </Show>

          {/* Activity log */}
          <Show when={activePanel() === "log"}>
            <ActivityLog />
          </Show>

          {/* Drafts */}
          <Show when={activePanel() === "drafts"}>
            <DraftsList onSelect={id => setSelectedId(id)} />
          </Show>
        </div>

        {/* Project switcher at bottom */}
        <ProjectBar />
      </div>

      {/* ── Main area: graph or outline ── */}
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div class="kova-toolbar shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
          {/* View toggle */}
          <div class="flex rounded bg-white/5 border border-white/10 overflow-hidden">
            <ToolbarBtn label="◉ Graph"   active={viewMode() === "graph"}   onClick={() => setViewMode("graph")} />
            <ToolbarBtn label="≡ Outline" active={viewMode() === "outline"} onClick={() => setViewMode("outline")} />
          </div>

          {/* Selection badge */}
          <Show when={selection().size > 0}>
            <span class="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded px-2 py-0.5">
              {selection().size} selected
            </span>
            <button class="text-xs text-[--kova-weak] hover:text-[--kova-text]"
                    style={{ background: "none", border: "none" }}
                    onClick={() => setSelection(new Set())}>
              Clear
            </button>
          </Show>

          <div class="flex-1" />

          {/* AI tasks */}
          <Show when={aiTasks().some(t => t.status === "running")}>
            <span class="text-xs text-purple-300 animate-pulse">✦ AI running…</span>
          </Show>

          {/* Command palette trigger */}
          <button title="Command palette (⌘P)"
                  onClick={() => setShowCmdPalette(true)}
                  class="text-xs text-[--kova-weak] hover:text-[--kova-text] bg-white/5 border border-white/10 rounded px-2 py-1 transition-colors">
            ⌘P
          </button>
        </div>

        {/* Graph */}
        <Show when={viewMode() === "graph"}>
          <div class="flex-1 min-h-0">
            <GraphView
              nodes={visibleNodes()}
              edges={visibleEdges()}
              selected={selectedId()}
              onSelect={id => setSelectedId(id)}
            />
          </div>
        </Show>

        {/* Outline */}
        <Show when={viewMode() === "outline"}>
          <div class="flex-1 overflow-y-auto p-4" style={{ "scrollbar-width": "thin" }}>
            <OutlineView onSelect={id => setSelectedId(id)} selectedId={selectedId()} />
          </div>
        </Show>
      </div>

      {/* ── Right: node detail panel ── */}
      <Show when={selectedNode()}>
        <div class="w-72 shrink-0 border-l border-white/10 flex flex-col overflow-hidden">
          <NodePanel
            node={selectedNode()!}
            aiRunning={aiRunning()}
            onClose={() => setSelectedId(undefined)}
            onNavigate={id => setSelectedId(id)}
            isSelected={selection().has(selectedNode()!.id)}
            onAddToSelection={() => setSelection(s => { const n = new Set(s); n.has(selectedNode()!.id) ? n.delete(selectedNode()!.id) : n.add(selectedNode()!.id); return n })}
            onAiInsights={async () => {
              setAiRunning(true)
              try { await generateInsights(selectedNode()!.id) } finally { setAiRunning(false) }
            }}
          />
        </div>
      </Show>

      {/* ── Overlays ── */}
      <Show when={showCmdPalette()}>
        <CommandPalette commands={commands} onClose={() => setShowCmdPalette(false)} />
      </Show>
      <Show when={showQuickSwitcher()}>
        <QuickSwitcher onSelect={id => setSelectedId(id)} onClose={() => setShowQuickSwitcher(false)} />
      </Show>
      <Show when={showAddNode()}>
        <AddNodeDialog onClose={() => setShowAddNode(false)} />
      </Show>
      <Show when={showTemplatePicker()}>
        <TemplatePicker onSelect={onTemplateSelect} onClose={() => setShowTemplatePicker(false)} />
      </Show>
      <Show when={showFilterPanel()}>
        <div class="fixed inset-0 z-40 flex" onClick={e => { if (e.target === e.currentTarget) setShowFilterPanel(false) }}>
          <div class="absolute inset-0 bg-black/30" />
          <div class="absolute top-10 left-64 w-72 bg-[--kova-surface] border border-white/15 rounded-xl shadow-2xl z-50 overflow-hidden">
            <GraphFilterPanel filter={filter()} onChange={setFilter} onClose={() => setShowFilterPanel(false)} />
          </div>
        </div>
      </Show>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const NodeList: Component<{
  onSelect:           (id: string) => void
  selectedId?:        string
  selection:          Set<string>
  onToggleSelection:  (id: string) => void
  filterFn?:          (n: ReturnType<typeof projectNodes>[0]) => boolean
}> = (props) => {
  const nodes = createMemo(() => {
    const all = projectNodes()
    const filtered = props.filterFn ? all.filter(props.filterFn) : all
    return filtered.sort((a, b) => {
      if (a.starred && !b.starred) return -1
      if (b.starred && !a.starred) return 1
      return b.updatedAt - a.updatedAt
    })
  })

  return (
    <div class="flex flex-col py-1">
      <For each={nodes()}>{n => {
        const accent = NODE_ACCENT[n.type] ?? "#c4c4c4"
        return (
          <button
            onClick={() => props.onSelect(n.id)}
            onDblClick={() => props.onToggleSelection(n.id)}
            class="w-full text-left flex items-center gap-2 px-3 py-1.5 transition-colors group"
            classList={{ "bg-white/10": props.selectedId === n.id, "hover:bg-white/5": props.selectedId !== n.id }}
            style={{ background: props.selectedId === n.id ? undefined : "none", border: "none" }}
          >
            <span class="shrink-0 text-[11px]" style={{ color: accent }}>{NODE_ICON[n.type]}</span>
            <span class="flex-1 text-xs text-[--kova-text] truncate">{n.title}</span>
            <Show when={n.starred}><span class="text-yellow-400 text-[10px] shrink-0">★</span></Show>
            <Show when={props.selection.has(n.id)}><span class="text-purple-400 text-[10px] shrink-0">✓</span></Show>
          </button>
        )
      }}</For>
      <Show when={nodes().length === 0}>
        <p class="text-xs text-[--kova-weaker] text-center py-6 px-3">No nodes match.</p>
      </Show>
    </div>
  )
}

const ActivityLog: Component = () => (
  <div class="flex flex-col py-1">
    <For each={[...log()].reverse().slice(0, 50)}>{entry => {
      const color = entry.type === "error" ? "#f48383" : entry.type === "discovery" ? "#7fd88f" : entry.type === "synthesis" ? "#fbb73c" : entry.type === "connection" ? "#56b6c2" : "#d4d4d4"
      return (
        <div class="px-3 py-1.5 flex items-start gap-2 border-b border-white/5">
          <span class="text-[10px] shrink-0 mt-0.5" style={{ color }}>●</span>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] text-[--kova-text] leading-snug">{entry.message}</p>
            <Show when={entry.confidence != null}>
              <span class="text-[10px] text-[--kova-weaker]">{Math.round(entry.confidence! * 100)}% confidence</span>
            </Show>
          </div>
        </div>
      )
    }}</For>
    <Show when={log().length === 0}>
      <p class="text-xs text-[--kova-weaker] text-center py-6">No activity yet.</p>
    </Show>
  </div>
)

const DraftsList: Component<{ onSelect: (id: string) => void }> = (props) => (
  <div class="flex flex-col py-1">
    <For each={graph.drafts}>{d => (
      <button onClick={() => props.onSelect(d.nodeId)}
              class="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/5"
              style={{ background: "none", border: "none" }}>
        <p class="text-xs text-[--kova-text] truncate">{d.title}</p>
        <p class="text-[10px] text-[--kova-weaker] mt-0.5">{d.sections.length} sections · {d.format}</p>
      </button>
    )}</For>
    <Show when={graph.drafts.length === 0}>
      <p class="text-xs text-[--kova-weaker] text-center py-6">No drafts yet.</p>
    </Show>
  </div>
)

const ProjectBar: Component = () => (
  <div class="shrink-0 border-t border-white/10 px-3 py-2">
    <div class="flex items-center justify-between">
      <span class="text-[11px] text-[--kova-weak] truncate flex-1">
        {graph.projects.find(p => p.id === graph.activeProjectId)?.name ?? "No project"}
      </span>
      <Show when={graph.projects.length > 1}>
        <select
          value={graph.activeProjectId ?? ""}
          onChange={e => switchProject(e.currentTarget.value)}
          class="text-[10px] bg-transparent border-none text-[--kova-weak] outline-none cursor-pointer max-w-[80px]"
        >
          <For each={graph.projects}>{p => <option value={p.id}>{p.name}</option>}</For>
        </select>
      </Show>
    </div>
  </div>
)

const OutlineView: Component<{ onSelect: (id: string) => void; selectedId?: string }> = (props) => {
  const nodes = createMemo(() =>
    projectNodes().sort((a, b) => {
      const typeOrder: Record<string, number> = { query: 0, synthesis: 1, paper: 2, pdf: 3, url: 4, text: 5, annotation: 6, image: 7 }
      return (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || b.updatedAt - a.updatedAt
    })
  )

  const byType = createMemo(() => {
    const map = new Map<string, typeof nodes extends () => infer R ? R : never>()
    for (const n of nodes()) {
      const arr = map.get(n.type) ?? []
      arr.push(n)
      map.set(n.type, arr)
    }
    return [...map.entries()]
  })

  return (
    <div class="flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <For each={byType()}>{([type, nodes]) => (
        <div>
          <h3 class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span style={{ color: NODE_ACCENT[type as keyof typeof NODE_ACCENT] }}>{NODE_ICON[type as keyof typeof NODE_ICON]}</span>
            {type} <span class="text-[--kova-weaker]">({nodes.length})</span>
          </h3>
          <div class="flex flex-col gap-1">
            <For each={nodes}>{n => (
              <button
                onClick={() => props.onSelect(n.id)}
                class="w-full text-left rounded-lg border border-white/10 bg-white/3 p-3 hover:bg-white/8 hover:border-white/20 transition-colors group"
                classList={{ "border-white/20 bg-white/8": props.selectedId === n.id }}
                style={{ background: "none", border: props.selectedId === n.id ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.1)" }}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-[--kova-text] truncate font-medium">{n.title}</p>
                    <Show when={n.authors?.length || n.year}>
                      <p class="text-[11px] text-[--kova-weaker] mt-0.5">
                        {n.authors?.slice(0, 2).join(", ")}{n.year ? ` (${n.year})` : ""}
                      </p>
                    </Show>
                    <p class="text-[11px] text-[--kova-weaker] mt-1 line-clamp-2 leading-relaxed">
                      {n.content.slice(0, 140)}…
                    </p>
                  </div>
                  <Show when={n.starred}><span class="text-yellow-400 text-xs shrink-0 mt-0.5">★</span></Show>
                </div>
                <Show when={n.tags.length > 0}>
                  <div class="flex gap-1 mt-2 flex-wrap">
                    <For each={n.tags.slice(0, 4)}>{tag => (
                      <span class="text-[10px] text-[--kova-weaker] bg-white/5 rounded px-1.5 py-0.5">#{tag}</span>
                    )}</For>
                  </div>
                </Show>
              </button>
            )}</For>
          </div>
        </div>
      )}</For>
    </div>
  )
}

const ToolbarBtn: Component<{ label: string; active: boolean; onClick: () => void }> = (p) => (
  <button
    onClick={p.onClick}
    class="px-2.5 py-1 text-[11px] transition-colors"
    classList={{ "bg-white/15 text-[--kova-text]": p.active, "text-[--kova-weak] hover:text-[--kova-text]": !p.active }}
    style={{ background: p.active ? undefined : "none", border: "none" }}
  >
    {p.label}
  </button>
)

export default App
