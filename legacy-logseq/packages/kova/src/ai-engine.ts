/**
 * KOVA AI Engine — standalone version using the kova-llm-* localStorage config.
 * Replaces the opencode-SDK-dependent version with a self-contained fetch implementation.
 */

import { createSignal } from "solid-js"
import type { KNode } from "./types"
import { graph, addEdge, addInsight, pushLog, generateCitation, importSuggestion } from "./store"
import { chat } from "./ai-engine-standalone"

export interface KovaModel { providerID: string; modelID: string; name: string }

const [selectedModel, setSelectedModel] = createSignal<KovaModel | null>(null)
export { selectedModel }
export function selectModel(m: KovaModel | null) { setSelectedModel(m) }

// No-op — the standalone engine reads directly from localStorage
export function setKovaClient(_client: unknown, _directory: string) {}

export interface AiTask {
  id: string; label: string; status: "pending" | "running" | "done" | "error"
  result?: string; error?: string
}

const [tasks, setTasks] = createSignal<AiTask[]>([])
export { tasks as aiTasks }

function addTask(label: string): string {
  const id = `t-${Date.now()}`
  setTasks(prev => [...prev, { id, label, status: "pending" }])
  return id
}
function updateTask(id: string, patch: Partial<AiTask>) {
  setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
}

// ── Connection discovery ───────────────────────────────────────────────────────

export async function discoverConnections(nodeIds: string[]): Promise<void> {
  const nodes = graph.nodes.filter(n => nodeIds.includes(n.id))
  if (nodes.length < 2) { pushLog({ type: "error", message: "Select at least 2 nodes" }); return }

  const taskId = addTask(`Discovering connections between ${nodes.length} nodes…`)
  updateTask(taskId, { status: "running" })
  pushLog({ type: "analysis", message: `AI discovering connections…` })

  const prompt = `You are a research assistant analysing academic papers and research notes.

Given these research items:
${nodes.map((n, i) => `[${i+1}] ID: ${n.id}\nTitle: ${n.title}\nType: ${n.type}\n${n.authors ? `Authors: ${n.authors.join(", ")}` : ""}\n${n.year ? `Year: ${n.year}` : ""}\nContent: ${n.content.slice(0, 200)}`).join("\n---\n")}

Identify semantic connections. For each, output ONE JSON per line (no markdown fences):
{"source":"<id>","target":"<id>","type":"<supports|contradicts|cites|expands|inspired_by>","strength":<0-1>,"confidence":<0-1>,"reasoning":"<one sentence>"}

Only JSON lines. Only connections with confidence >= 0.5.`

  try {
    const response = await chat(prompt)
    const lines = response.split("\n").filter(l => l.trim().startsWith("{"))
    let added = 0
    for (const line of lines) {
      try {
        const c = JSON.parse(line.trim())
        if (!c.source || !c.target || !c.type) continue
        if (!graph.nodes.find(n => n.id === c.source) || !graph.nodes.find(n => n.id === c.target)) continue
        const edge = addEdge({ source: c.source, target: c.target, type: c.type, strength: parseFloat(c.strength) || 0.7, confidence: parseFloat(c.confidence) || 0.7, reasoning: c.reasoning || "AI connection", discoveredBy: "ai" })
        if (edge) added++
      } catch { /* skip malformed */ }
    }
    updateTask(taskId, { status: "done", result: `Found ${added} connections` })
    pushLog({ type: "discovery", message: `AI found ${added} new connections`, confidence: 0.85 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateTask(taskId, { status: "error", error: msg })
    pushLog({ type: "error", message: `Connection discovery failed: ${msg}` })
  }
}

// ── Insight generation ────────────────────────────────────────────────────────

export async function generateInsights(nodeId: string): Promise<void> {
  const node = graph.nodes.find(n => n.id === nodeId)
  if (!node) return

  const connected = graph.edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .map(e => graph.nodes.find(n => n.id === (e.source === nodeId ? e.target : e.source)))
    .filter(Boolean) as KNode[]

  const taskId = addTask(`Insights: "${node.title}"`)
  updateTask(taskId, { status: "running" })
  pushLog({ type: "analysis", message: `Generating insights for "${node.title}"…`, nodeId })

  const prompt = `You are a research assistant. Analyse this research item.

TITLE: ${node.title}
TYPE: ${node.type}
${node.authors ? `AUTHORS: ${node.authors.join(", ")}` : ""}
${node.year ? `YEAR: ${node.year}` : ""}
CONTENT: ${node.content.slice(0, 500)}

CONNECTED (${connected.length}): ${connected.slice(0, 4).map(n => n.title).join("; ")}

Generate 2-3 insights. One JSON per line (no markdown):
{"type":"<summary|key_finding|contradiction|gap|synthesis_opportunity|research_direction>","content":"<2-3 sentences>","confidence":<0-1>,"evidence":["<fact>"],"relatedNodes":["<nodeId>"]}

Only JSON lines.`

  try {
    const response = await chat(prompt)
    const lines = response.split("\n").filter(l => l.trim().startsWith("{"))
    let added = 0
    for (const line of lines) {
      try {
        const ins = JSON.parse(line.trim())
        if (!ins.type || !ins.content) continue
        addInsight({ nodeId, type: ins.type, content: ins.content, confidence: parseFloat(ins.confidence) || 0.75, evidence: Array.isArray(ins.evidence) ? ins.evidence : [], relatedNodes: Array.isArray(ins.relatedNodes) ? ins.relatedNodes : [] })
        added++
      } catch { /* skip */ }
    }
    updateTask(taskId, { status: "done", result: `Generated ${added} insights` })
    pushLog({ type: "synthesis", message: `${added} insights for "${node.title}"`, nodeId, confidence: 0.8 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateTask(taskId, { status: "error", error: msg })
    pushLog({ type: "error", message: `Insights failed: ${msg}` })
  }
}

// ── Research thread following ─────────────────────────────────────────────────

export interface AIThreadResult { title: string; authors: string[]; year: number; venue: string; doi?: string; reason: string }

export async function followResearchThread(seedNodeIds: string[]): Promise<AIThreadResult[]> {
  const nodes = graph.nodes.filter(n => seedNodeIds.includes(n.id))
  const taskId = addTask("Following research threads…")
  updateTask(taskId, { status: "running" })
  pushLog({ type: "thread", message: `AI following threads from ${nodes.length} nodes…` })
  const existingDois = new Set(graph.nodes.map(n => n.doi).filter(Boolean))

  const prompt = `You are an academic research assistant. Based on these papers/notes, suggest 5 papers to read next.

CURRENT RESEARCH:
${nodes.map(n => `- "${n.title}"${n.year ? ` (${n.year})` : ""}${n.doi ? ` DOI: ${n.doi}` : ""}`).join("\n")}

ALREADY IN GRAPH (skip these DOIs): ${[...existingDois].join(", ")}

Suggest exactly 5 papers. One JSON per line (no markdown):
{"title":"<full title>","authors":["<Author1>","<Author2>"],"year":<number>,"venue":"<journal/conference>","doi":"<doi if known>","reason":"<one sentence why relevant>"}

Real, existing papers only.`

  try {
    const response = await chat(prompt)
    const lines = response.split("\n").filter(l => l.trim().startsWith("{"))
    const results: AIThreadResult[] = []
    for (const line of lines) {
      try {
        const r = JSON.parse(line.trim())
        if (!r.title || !r.year) continue
        results.push({ title: r.title, authors: Array.isArray(r.authors) ? r.authors : [r.authors ?? "Unknown"], year: parseInt(r.year) || 2020, venue: r.venue ?? "Unknown", doi: r.doi, reason: r.reason ?? "Relevant to research" })
      } catch { /* skip */ }
    }
    updateTask(taskId, { status: "done", result: `${results.length} papers found` })
    pushLog({ type: "discovery", message: `Thread: ${results.length} related papers`, confidence: 0.8 })
    return results
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateTask(taskId, { status: "error", error: msg })
    pushLog({ type: "error", message: `Thread failed: ${msg}` })
    return []
  }
}

// Re-export for App.tsx — import directly from store instead
export { generateCitation } from "./store"