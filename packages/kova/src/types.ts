/**
 * KOVA research platform types
 */

export type NodeType = "text" | "url" | "paper" | "pdf" | "query" | "synthesis" | "annotation" | "image"

export type EdgeType =
  | "supports"
  | "contradicts"
  | "expands"
  | "cites"
  | "inspired_by"
  | "ai_discovered"
  | "semantic_similarity"
  | "user_created"
  | "method_used"
  | "dataset_used"

export interface KNode {
  id:          string
  type:        NodeType
  title:       string
  content:     string
  abstract?:   string      // for papers
  tags:        string[]
  source:      string
  doi?:        string
  url?:        string
  arxivId?:    string
  authors?:    string[]
  venue?:      string      // journal/conference
  year?:       number
  publishedAt?: string
  citedBy?:    number
  confidence?: number
  starred?:    boolean
  color?:      string      // user-assigned highlight
  createdAt:   number
  updatedAt:   number
}

export interface KEdge {
  id:           string
  source:       string
  target:       string
  type:         EdgeType
  strength:     number
  confidence:   number
  reasoning:    string
  discoveredBy: "user" | "ai"
  createdAt:    number
}

export interface KInsight {
  id:           string
  nodeId:       string
  type:         "summary" | "connection" | "contradiction" | "gap" | "synthesis_opportunity" | "research_direction" | "methodology" | "key_finding"
  content:      string
  confidence:   number
  evidence:     string[]
  relatedNodes: string[]
}

export interface KProject {
  id:          string
  name:        string
  description: string
  tags:        string[]
  createdAt:   number
  updatedAt:   number
  nodeIds:     string[]   // nodes belonging to this project
  edgeIds:     string[]
}

export interface KDraft {
  id:        string
  nodeId:    string        // synthesis node it's attached to
  title:     string
  sections:  KSection[]
  format:    "paper" | "outline" | "abstract" | "notes"
  createdAt: number
  updatedAt: number
}

export interface KSection {
  id:      string
  heading: string
  content: string
  sources: string[]       // node IDs cited in this section
}

// ── Accent colours ────────────────────────────────────────────────────────────

export const NODE_ACCENT: Record<NodeType, string> = {
  paper:      "#7fd88f",
  synthesis:  "#fbb73c",
  url:        "#56b6c2",
  pdf:        "#fab283",
  query:      "#93e9f6",
  text:       "#c4c4c4",
  annotation: "#d4a5f5",
  image:      "#ff9ae2",
}

export const EDGE_ACCENT: Record<EdgeType, string> = {
  supports:           "#7fd88f",
  contradicts:        "#fc533a",
  cites:              "#fbb73c",
  inspired_by:        "#9d7cd8",
  expands:            "#56b6c2",
  ai_discovered:      "#9dbefe",
  semantic_similarity:"#4b4b5a",
  user_created:       "#9dbefe",
  method_used:        "#f5a623",
  dataset_used:       "#50e3c2",
}

export const NODE_BADGE: Record<NodeType, string> = {
  paper:      "PDF",
  pdf:        "PDF",
  url:        "URL",
  text:       "TXT",
  query:      "Q",
  synthesis:  "AI",
  annotation: "NOTE",
  image:      "IMG",
}

export const NODE_ICON: Record<NodeType, string> = {
  paper:      "◈",
  pdf:        "▤",
  url:        "⊕",
  text:       "≡",
  query:      "◎",
  synthesis:  "✦",
  annotation: "✎",
  image:      "⊞",
}
