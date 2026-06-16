# AI Research Agent — Architecture (Milestone 2)

This captures the plan for the AI features from the original notes, so the shell
can be built with the right seams in place.

## Backend split: Convex + Ollama

Convex runs in the cloud and **cannot reach** a local Ollama (`localhost:11434`),
so reasoning and embeddings happen in the Electron app; Convex is the synced
store + vector index.

| Job                                   | Owner                              |
| ------------------------------------- | --------------------------------- |
| Generate embeddings (`nomic-embed-text`) | Ollama, called from the app    |
| Store notes + vectors, vector search  | Convex (`vectorIndex`)            |
| Agent reasoning / chat / summarize    | Ollama (Phi-4 / Llama) — Claude API swappable |
| Sync + realtime across devices        | Convex                            |

Pipeline: note changes → app chunks + embeds via Ollama → upsert vector to
Convex → query embeds via Ollama → Convex vector-search returns chunks → app
feeds chunks to the LLM → answer.

Privacy note: with this split, note text is sent to Convex (cloud). For a fully
local mode, swap Convex for **ChromaDB** behind the same `VectorStore` interface.

## Feature map (from the original notes)

1. **Conversational capture** — a transcription agent holds the live conversation
   in a temporary file; on close, the transcript is handed to the agent.
2. **Retrieve / create** — agent finds relevant `.md` files (RAG over the vault)
   or creates new ones from the conversation + context.
3. **Suggestion document** — a new note that cross-checks past/similar notes,
   proposes ideas to test, and aggregates equations/points for a paper.
4. **Change tracking** — a dedicated note that records what changed and links to
   the affected notes (graph connections).
5. **Self-update** — the agent updates its own working notes/index from findings.

## Seams to build into the shell now

- `window.vault` already exposes read/write/tree — the indexer will reuse it.
- Keep note bodies addressable by `relPath` (stable id for vectors).
- Reserve a ribbon slot + right-sidebar panel for the AI chat (Sparkles icon).
- Plan a `.ai/` folder convention in the vault for transcripts, suggestion docs,
  and the change-log note, so AI artifacts live alongside the user's notes.
