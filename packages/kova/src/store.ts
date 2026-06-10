/**
 * KOVA research platform store — with LocalStorage persistence,
 * multi-project support, and research-specific mutations.
 */

import { createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { KNode, KEdge, KInsight, KProject, KDraft } from "./types"

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "kova-graph-v2"

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
}

// ── Seed research data ────────────────────────────────────────────────────────

const NOW = Date.now()

const SEED_NODES: KNode[] = [
  {
    id: "n1", type: "query", title: "Research question: transformer attention efficiency",
    content: "Core research question exploring efficient variants of transformer attention.\n\nWhat are the computational trade-offs between standard attention and linear attention approximations?\n\nSee also [[Attention Is All You Need]]",
    tags: ["research-question", "transformer"], source: "user", starred: true, createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "n2", type: "paper", title: "Attention Is All You Need",
    content: "Vaswani et al. 2017 — foundational transformer paper.\n\n## Abstract\nThe dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism.\n\n## Key Contributions\n- Multi-head attention mechanism\n- Positional encoding\n- Encoder-decoder architecture without recurrence\n- State-of-the-art on WMT translation tasks",
    abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
    tags: ["transformer", "nlp", "attention", "foundational"],
    source: "arxiv", doi: "1706.03762", arxivId: "1706.03762",
    authors: ["Vaswani, A.", "Shazeer, N.", "Parmar, N.", "Uszkoreit, J.", "Jones, L.", "Gomez, A.N.", "Kaiser, Ł.", "Polosukhin, I."],
    venue: "NeurIPS 2017", year: 2017, citedBy: 104000,
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "n3", type: "synthesis", title: "Transformer Attention: Research Synthesis",
    content: "## AI-Generated Synthesis\n\nThis synthesis covers the evolution of transformer attention mechanisms from the original Vaswani et al. paper through modern efficient variants.\n\n### Core Insight\nStandard attention has O(n²) complexity. Research has bifurcated into:\n1. **Sparse attention** — only attend to relevant positions (Longformer, BigBird)\n2. **Linear attention** — approximate softmax attention with kernel functions (Performers)\n3. **Flash Attention** — IO-aware exact attention (Dao et al.)\n\n### Gap Analysis\nThe field lacks comprehensive benchmarks comparing these approaches across diverse sequence lengths and tasks.",
    tags: ["synthesis", "attention", "efficiency"], source: "ai",
    confidence: 0.91, starred: true, createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "n4", type: "url", title: "The Illustrated Transformer — Jay Alammar",
    content: "Jay Alammar's visual guide to transformer architecture.\n\n> Highly recommended as an intuition-building resource before reading the original paper.\n\nCovers:\n- Self-attention step-by-step\n- Multi-head attention visualisation\n- Encoder-decoder attention patterns",
    tags: ["tutorial", "visual", "reference"], source: "web",
    url: "https://jalammar.github.io/illustrated-transformer/",
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "n5", type: "annotation", title: "Reading notes: Attention complexity",
    content: "Key points from reading session — 2024-06-05\n\n**From Vaswani et al.:**\n- Self-attention: O(n²·d) per layer\n- Recurrent: O(n·d²) — better for long sequences?\n\n**Open questions:**\n- At what sequence length does attention become the bottleneck?\n- How do sparse methods handle out-of-distribution positions?\n\n**Follow-up papers to read:**\n- Longformer (Beltagy et al. 2020)\n- Flash Attention (Dao et al. 2022)\n- Mamba (Gu & Dao 2023)\n\nSee also [[Attention Is All You Need]]",
    tags: ["notes", "reading-log", "complexity"], source: "user",
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "n6", type: "paper", title: "BERT: Pre-training Deep Bidirectional Transformers",
    content: "Devlin et al. 2019 — bidirectional transformer pre-training.\n\n## Key Contribution\nBidirectional Encoder Representations from Transformers (BERT) pre-trains deep bidirectional representations by jointly conditioning on both left and right context.\n\n## Methods\n- Masked Language Modeling (MLM): 15% of tokens masked, model predicts them\n- Next Sentence Prediction (NSP): binary classification task\n- Pre-training on BooksCorpus + English Wikipedia (3.3B words)\n\n## Results\n- 11 NLP tasks improved, often by large margins\n- GLUE: 80.5% (7.7% improvement)\n- SQuAD 1.1: 93.2 F1 (1.5% improvement)",
    abstract: "We introduce BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text.",
    tags: ["bert", "nlp", "pre-training", "foundational"],
    source: "arxiv", doi: "1810.04805", arxivId: "1810.04805",
    authors: ["Devlin, J.", "Chang, M.", "Lee, K.", "Toutanova, K."],
    venue: "NAACL 2019", year: 2019, citedBy: 89000,
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "n7", type: "paper", title: "FlashAttention: Fast and Memory-Efficient Exact Attention",
    content: "Dao et al. 2022 — IO-aware exact attention algorithm.\n\n## Problem\nStandard attention implementations are slow and memory-hungry due to materializing the N×N attention matrix in GPU HBM.\n\n## Solution\nFlashAttention uses tiling to split Q, K, V into blocks and computes attention incrementally, avoiding storing the full attention matrix.\n\n## Results\n- 2-4× faster than PyTorch baseline\n- Up to 20× memory reduction\n- Enables training with sequences 10-20× longer",
    abstract: "We propose an IO-aware exact attention algorithm using tiling to reduce the number of memory reads/writes between GPU high bandwidth memory and on-chip SRAM.",
    tags: ["attention", "efficiency", "gpu", "implementation"],
    source: "arxiv", doi: "2205.14135", arxivId: "2205.14135",
    authors: ["Dao, T.", "Fu, D.Y.", "Ermon, S.", "Rudra, A.", "Ré, C."],
    venue: "NeurIPS 2022", year: 2022, citedBy: 8200,
    createdAt: NOW, updatedAt: NOW,
  },
]

const SEED_EDGES: KEdge[] = [
  { id: "e1", source: "n1", target: "n2", type: "cites",        strength: 0.9,  confidence: 0.95, reasoning: "Research question directly investigates this paper's mechanisms",    discoveredBy: "ai",   createdAt: NOW },
  { id: "e2", source: "n2", target: "n3", type: "supports",     strength: 0.85, confidence: 0.9,  reasoning: "Original paper is the primary source for this synthesis",            discoveredBy: "ai",   createdAt: NOW },
  { id: "e3", source: "n4", target: "n3", type: "supports",     strength: 0.7,  confidence: 0.8,  reasoning: "Tutorial provides intuition referenced in synthesis",                discoveredBy: "ai",   createdAt: NOW },
  { id: "e4", source: "n6", target: "n2", type: "cites",        strength: 0.95, confidence: 0.99, reasoning: "BERT directly builds on the transformer architecture",               discoveredBy: "ai",   createdAt: NOW },
  { id: "e5", source: "n5", target: "n4", type: "inspired_by",  strength: 0.6,  confidence: 0.75, reasoning: "Annotation notes taken while reading this tutorial",               discoveredBy: "user", createdAt: NOW },
  { id: "e6", source: "n7", target: "n2", type: "expands",      strength: 0.88, confidence: 0.94, reasoning: "FlashAttention improves computational efficiency of original attention", discoveredBy: "ai", createdAt: NOW },
  { id: "e7", source: "n7", target: "n1", type: "ai_discovered",strength: 0.72, confidence: 0.82, reasoning: "FlashAttention directly addresses the efficiency research question", discoveredBy: "ai",  createdAt: NOW },
  { id: "e8", source: "n5", target: "n2", type: "cites",        strength: 0.8,  confidence: 0.9,  reasoning: "Notes reference the original paper extensively",                    discoveredBy: "user", createdAt: NOW },
]

const SEED_INSIGHTS: KInsight[] = [
  {
    id: "i1", nodeId: "n2", type: "summary", confidence: 0.97,
    content: "Foundational paper proposing the transformer architecture. The self-attention mechanism is the core innovation that enabled parallelisation previously impossible with RNNs. Has ~104k citations, considered one of the most impactful ML papers of the decade.",
    evidence: ["104,000+ citations as of 2024", "All major LLMs (GPT, BERT, T5, LLaMA) use this architecture"],
    relatedNodes: ["n3", "n6", "n7"],
  },
  {
    id: "i2", nodeId: "n7", type: "key_finding", confidence: 0.95,
    content: "FlashAttention solves a critical implementation bottleneck: standard attention is slow not due to FLOPs but due to memory bandwidth. By keeping attention computation in fast SRAM rather than writing to slow HBM, it achieves 2-4× speedup with identical numerical output.",
    evidence: ["HBM bandwidth is 20-40× slower than SRAM bandwidth", "2-4× wall-clock speedup demonstrated on A100 GPUs"],
    relatedNodes: ["n1", "n2"],
  },
  {
    id: "i3", nodeId: "n3", type: "synthesis_opportunity", confidence: 0.88,
    content: "The synthesis currently covers standard attention and FlashAttention but misses the sparse attention branch (Longformer, BigBird) and state-space model alternatives (Mamba). A comprehensive comparison across all efficiency approaches would strengthen the research.",
    evidence: ["Longformer: O(n) attention with sliding window", "Mamba (2023): state-space alternative achieving parity with transformers at fraction of cost"],
    relatedNodes: ["n1", "n7"],
  },
  {
    id: "i4", nodeId: "n1", type: "research_direction", confidence: 0.82,
    content: "Research question could be narrowed to a falsifiable hypothesis: 'FlashAttention enables training on sequences >16k tokens that were previously infeasible.' This would make for a cleaner paper structure with concrete benchmarks.",
    evidence: ["Current transformers limited to ~4k tokens in practice", "FlashAttention paper demonstrates 64k token sequences"],
    relatedNodes: ["n7", "n2"],
  },
  {
    id: "i5", nodeId: "n6", type: "contradiction", confidence: 0.71,
    content: "Potential contradiction: BERT uses NSP (Next Sentence Prediction) as a pre-training objective, but later work (RoBERTa, Liu et al. 2019) found NSP harmful to downstream performance. This challenges BERT's original design choices.",
    evidence: ["RoBERTa removes NSP and outperforms BERT on all benchmarks", "XLNet also removes NSP with improved results"],
    relatedNodes: ["n2"],
  },
]

const SEED_PROJECT: KProject = {
  id: "p1", name: "Transformer Efficiency Research",
  description: "Investigating efficient transformer attention mechanisms for processing long sequences in scientific literature.",
  tags: ["nlp", "transformer", "efficiency", "deep-learning"],
  createdAt: NOW, updatedAt: NOW,
  nodeIds: SEED_NODES.map(n => n.id),
  edgeIds: SEED_EDGES.map(e => e.id),
}

// ── Stored state shape ────────────────────────────────────────────────────────

interface PersistedState {
  nodes:    KNode[]
  edges:    KEdge[]
  insights: KInsight[]
  projects: KProject[]
  drafts:   KDraft[]
  activeProjectId: string | null
}

function defaultState(): PersistedState {
  return {
    nodes:    SEED_NODES,
    edges:    SEED_EDGES,
    insights: SEED_INSIGHTS,
    projects: [SEED_PROJECT],
    drafts:   [],
    activeProjectId: "p1",
  }
}

// Load from localStorage (or use defaults on first run)
const persisted = load<PersistedState>(STORAGE_KEY, defaultState())

// ── Reactive store ────────────────────────────────────────────────────────────

export const [graph, setGraph] = createStore<PersistedState>(persisted)

// Autosave on every change (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(STORAGE_KEY, graph), 500)
}

// Wrap setGraph to also schedule save
function persist<T>(fn: () => T): T {
  const result = fn()
  scheduleSave()
  return result
}

// ── UI state (not persisted) ──────────────────────────────────────────────────

export const [selectedId,   setSelectedId]   = createSignal<string | undefined>()
export const [searchQ,      setSearchQ]      = createSignal("")
export const [activePanel,  setActivePanel]  = createSignal<Panel>("files")
export const [viewMode,     setViewMode]     = createSignal<ViewMode>("graph")

export type Panel    = "files" | "search" | "log" | "references" | "drafts"
export type ViewMode = "graph" | "outline" | "timeline"

// Activity log
export interface LogEntry {
  id:          string
  type:        "info" | "discovery" | "analysis" | "connection" | "synthesis" | "error" | "thread"
  message:     string
  confidence?: number
  nodeId?:     string
  ts:          number
}

const [_log, _setLog] = createSignal<LogEntry[]>([])
export const log = _log

export function pushLog(entry: Omit<LogEntry, "id" | "ts">) {
  _setLog(prev => {
    const next: LogEntry = { ...entry, id: `l-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, ts: Date.now() }
    return [...prev.slice(-99), next]
  })
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export const activeProject = () =>
  graph.projects.find(p => p.id === graph.activeProjectId) ?? graph.projects[0]

export const projectNodes = () => {
  const proj = activeProject()
  if (!proj) return graph.nodes
  const ids = new Set(proj.nodeIds)
  return graph.nodes.filter(n => ids.has(n.id))
}

export const projectEdges = () => {
  const proj = activeProject()
  if (!proj) return graph.edges
  const ids = new Set(proj.edgeIds)
  return graph.edges.filter(e => ids.has(e.id))
}

// ── Counters (survive reload by scanning existing IDs) ────────────────────────

let nodeCounter = Math.max(0, ...graph.nodes.map(n => parseInt(n.id.replace(/\D/g, "")) || 0))
let edgeCounter = Math.max(0, ...graph.edges.map(e => parseInt(e.id.replace(/\D/g, "")) || 0))

// ── Mutations ─────────────────────────────────────────────────────────────────

export function addNode(node: Omit<KNode, "id" | "createdAt" | "updatedAt">): KNode {
  const n: KNode = { ...node, id: `n${++nodeCounter}`, createdAt: Date.now(), updatedAt: Date.now() }
  persist(() => {
    setGraph("nodes", nodes => [...nodes, n])
    // Add to active project
    const pid = graph.activeProjectId
    if (pid) {
      const idx = graph.projects.findIndex(p => p.id === pid)
      if (idx >= 0) setGraph("projects", idx, "nodeIds", ids => [...ids, n.id])
    }
  })
  pushLog({ type: "discovery", message: `Added: "${n.title}"`, nodeId: n.id })
  return n
}

export function updateNode(id: string, patch: Partial<KNode>) {
  persist(() =>
    setGraph("nodes", n => n.id === id, { ...patch, updatedAt: Date.now() })
  )
}

export function deleteNode(id: string) {
  persist(() => {
    setGraph("nodes", nodes => nodes.filter(n => n.id !== id))
    setGraph("edges", edges => edges.filter(e => e.source !== id && e.target !== id))
    setGraph("insights", ins => ins.filter(i => i.nodeId !== id))
    // Remove from all projects
    setGraph("projects", produce(projects => {
      for (const p of projects) {
        p.nodeIds = p.nodeIds.filter(nid => nid !== id)
      }
    }))
  })
  pushLog({ type: "info", message: `Deleted node ${id}` })
}

export function addEdge(edge: Omit<KEdge, "id" | "createdAt">): KEdge | undefined {
  if (graph.edges.some(e =>
    (e.source === edge.source && e.target === edge.target) ||
    (e.source === edge.target && e.target === edge.source)
  )) return undefined

  const e: KEdge = { ...edge, id: `e${++edgeCounter}`, createdAt: Date.now() }
  persist(() => {
    setGraph("edges", edges => [...edges, e])
    const pid = graph.activeProjectId
    if (pid) {
      const idx = graph.projects.findIndex(p => p.id === pid)
      if (idx >= 0) setGraph("projects", idx, "edgeIds", ids => [...ids, e.id])
    }
  })
  const src = graph.nodes.find(n => n.id === edge.source)?.title ?? edge.source
  const tgt = graph.nodes.find(n => n.id === edge.target)?.title ?? edge.target
  pushLog({ type: "connection", message: `Linked "${src}" → "${tgt}"`, confidence: edge.confidence, nodeId: edge.source })
  return e
}

export function deleteEdge(id: string) {
  persist(() => {
    setGraph("edges", edges => edges.filter(e => e.id !== id))
    setGraph("projects", produce(projects => {
      for (const p of projects) p.edgeIds = p.edgeIds.filter(eid => eid !== id)
    }))
  })
}

export function toggleStar(id: string) {
  const node = graph.nodes.find(n => n.id === id)
  if (!node) return
  updateNode(id, { starred: !node.starred })
}

export function addInsight(insight: Omit<KInsight, "id">) {
  const ins: KInsight = { ...insight, id: `i${Date.now()}` }
  persist(() => setGraph("insights", list => [...list, ins]))
  return ins
}

export function addProject(name: string, description = "") {
  const p: KProject = {
    id: `p${Date.now()}`, name, description, tags: [],
    createdAt: Date.now(), updatedAt: Date.now(),
    nodeIds: [], edgeIds: [],
  }
  persist(() => setGraph("projects", projects => [...projects, p]))
  return p
}

export function switchProject(id: string) {
  persist(() => setGraph("activeProjectId", id))
  setSelectedId(undefined)
  pushLog({ type: "info", message: `Switched to project: ${graph.projects.find(p => p.id === id)?.name}` })
}

export function addDraft(draft: Omit<KDraft, "id" | "createdAt" | "updatedAt">): KDraft {
  const d: KDraft = { ...draft, id: `d${Date.now()}`, createdAt: Date.now(), updatedAt: Date.now() }
  persist(() => setGraph("drafts", list => [...list, d]))
  pushLog({ type: "synthesis", message: `Draft created: "${d.title}"`, nodeId: d.nodeId })
  return d
}

export function updateDraft(id: string, patch: Partial<Omit<KDraft, "id" | "createdAt">>) {
  persist(() =>
    setGraph("drafts", d => d.id === id, { ...patch, updatedAt: Date.now() })
  )
}

// ── Research thread simulation ────────────────────────────────────────────────
// In a real app this would call an LLM/search API. Here we return plausible suggestions.

export interface ThreadSuggestion {
  title:   string
  authors: string[]
  year:    number
  venue:   string
  doi?:    string
  reason:  string
}

const THREAD_DB: ThreadSuggestion[] = [
  { title: "Longformer: The Long-Document Transformer", authors: ["Beltagy, I.", "Peters, M.E.", "Cohan, A."], year: 2020, venue: "arXiv", doi: "2004.05150", reason: "Sparse attention for long sequences — directly relevant to efficiency research question" },
  { title: "Linformer: Self-Attention with Linear Complexity", authors: ["Wang, S.", "Li, B.", "Khabsa, M.", "Fang, H.", "Ma, H."], year: 2020, venue: "arXiv", doi: "2006.04768", reason: "Linear attention approximation — key efficiency method to compare against" },
  { title: "Performer: Rethinking Attention with Performers", authors: ["Choromanski, K.", "Likhosherstov, V.", "Dohan, D."], year: 2021, venue: "ICLR 2021", doi: "2009.14794", reason: "Kernel-based linear attention — different mathematical approach to same problem" },
  { title: "FlashAttention-2: Faster Attention with Better Parallelism", authors: ["Dao, T."], year: 2023, venue: "ICLR 2024", doi: "2307.08691", reason: "Direct successor to FlashAttention — improved parallelism on modern GPUs" },
  { title: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces", authors: ["Gu, A.", "Dao, T."], year: 2023, venue: "arXiv", doi: "2312.00752", reason: "Non-attention architecture achieving transformer parity — important comparison baseline" },
  { title: "Scaling Laws for Neural Language Models", authors: ["Kaplan, J.", "McCandlish, S.", "Henighan, T."], year: 2020, venue: "arXiv", doi: "2001.08361", reason: "Provides context for when attention efficiency bottlenecks matter at scale" },
  { title: "RoBERTa: A Robustly Optimized BERT Pretraining Approach", authors: ["Liu, Y.", "Ott, M.", "Goyal, N."], year: 2019, venue: "arXiv", doi: "1907.11692", reason: "Challenges BERT's NSP objective — relevant to contradiction identified in your synthesis" },
  { title: "Big Bird: Transformers for Longer Sequences", authors: ["Zaheer, M.", "Guruganesh, G.", "Dubey, K.A."], year: 2020, venue: "NeurIPS 2020", doi: "2007.14062", reason: "Sparse random + global + window attention — similar approach to Longformer" },
]

export function getThreadSuggestions(nodeIds: string[]): ThreadSuggestion[] {
  // Return suggestions not already in the graph
  const existingDois = new Set(graph.nodes.map(n => n.doi).filter(Boolean))
  return THREAD_DB
    .filter(s => !s.doi || !existingDois.has(s.doi))
    .slice(0, 5)
}

export function importSuggestion(s: ThreadSuggestion) {
  return addNode({
    type:     "paper",
    title:    s.title,
    content:  `${s.authors.join(", ")} (${s.year})\n\n**Venue:** ${s.venue}\n**DOI:** ${s.doi ?? "—"}\n\n*Discovered via research thread following.*\n\n${s.reason}`,
    authors:  s.authors,
    year:     s.year,
    venue:    s.venue,
    doi:      s.doi,
    tags:     ["imported", "thread"],
    source:   "thread",
  })
}

// ── Citation generation ───────────────────────────────────────────────────────

export function generateCitation(nodeId: string, style: "apa" | "mla" | "chicago" = "apa"): string {
  const node = graph.nodes.find(n => n.id === nodeId)
  if (!node) return ""
  const authors = node.authors ?? ["Unknown Author"]
  const year    = node.year ?? new Date(node.createdAt).getFullYear()
  const title   = node.title
  const venue   = node.venue ?? node.source
  const doi     = node.doi ? `https://doi.org/${node.doi}` : node.url ?? ""

  if (style === "apa") {
    const authStr = authors.length <= 7
      ? authors.join(", ").replace(/, ([^,]+)$/, ", & $1")
      : authors.slice(0, 6).join(", ") + ", ... " + authors.at(-1)
    return `${authStr} (${year}). ${title}. *${venue}*. ${doi}`
  }
  if (style === "mla") {
    const first = authors[0] ?? "Unknown"
    const rest  = authors.slice(1).join(", ")
    return `${first}${rest ? ", " + rest : ""}. "${title}." *${venue}*, ${year}. ${doi}`
  }
  // chicago
  return `${authors.join(", ")}. "${title}." *${venue}* (${year}). ${doi}`
}

// ── Outline generation ────────────────────────────────────────────────────────

export function generateOutline(title: string, selectedNodeIds: string[]): KDraft {
  const nodes   = graph.nodes.filter(n => selectedNodeIds.includes(n.id))
  const papers  = nodes.filter(n => n.type === "paper" || n.type === "pdf")
  const notes   = nodes.filter(n => n.type === "text" || n.type === "annotation")
  const queries = nodes.filter(n => n.type === "query")

  const synth = addNode({
    type: "synthesis", title: `Synthesis: ${title}`,
    content: `AI-generated synthesis from ${nodes.length} selected nodes.\n\nThis document synthesises:\n${nodes.map(n => `- ${n.title}`).join("\n")}`,
    tags: ["synthesis", "draft"], source: "ai",
    confidence: 0.85,
  })

  // Auto-connect synthesis to source nodes
  for (const n of nodes) {
    addEdge({ source: synth.id, target: n.id, type: "supports", strength: 0.8, confidence: 0.85, reasoning: "Synthesis derived from this source", discoveredBy: "ai" })
  }

  const draft = addDraft({
    nodeId: synth.id,
    title,
    format: "paper",
    sections: [
      {
        id: "s1", heading: "Introduction",
        content: `This paper addresses ${queries.map(q => q.title).join("; ") || "the research question"}.`,
        sources: queries.map(q => q.id),
      },
      {
        id: "s2", heading: "Related Work",
        content: papers.map(p => `**${p.title}** (${p.authors?.[0] ?? ""}${p.year ? `, ${p.year}` : ""}): ${p.abstract ?? p.content.slice(0, 200)}…`).join("\n\n"),
        sources: papers.map(p => p.id),
      },
      {
        id: "s3", heading: "Methodology",
        content: notes.map(n => n.content.slice(0, 300)).join("\n\n") || "*[To be completed]*",
        sources: notes.map(n => n.id),
      },
      { id: "s4", heading: "Results & Discussion", content: "*[To be completed based on findings]*", sources: [] },
      { id: "s5", heading: "Conclusion", content: "*[To be completed]*", sources: [] },
      {
        id: "s6", heading: "References",
        content: papers.map(p => generateCitation(p.id)).join("\n\n"),
        sources: papers.map(p => p.id),
      },
    ],
  })

  pushLog({ type: "synthesis", message: `Outline generated: "${title}"`, nodeId: synth.id, confidence: 0.85 })
  return draft
}
