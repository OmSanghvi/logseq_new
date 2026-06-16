import { create } from 'zustand'
import type { AiStatus, RetrievedChunk } from '../../../shared/types'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  sources?: RetrievedChunk[]
}

interface AiState {
  status: AiStatus | null
  messages: ChatTurn[]
  streaming: boolean
  progress: { done: number; total: number; file: string } | null
  activeReqId: string | null

  init: () => void
  refreshStatus: (root: string | null) => Promise<void>
  reindex: (root: string) => Promise<void>
  ask: (root: string, question: string) => Promise<void>
  clear: () => void
}

export const useAi = create<AiState>((set, get) => ({
  status: null,
  messages: [],
  streaming: false,
  progress: null,
  activeReqId: null,

  init: () => {
    // Route streamed tokens to the in-progress assistant turn.
    window.ai.onToken((reqId, token) => {
      if (reqId !== get().activeReqId) return
      set((s) => {
        const messages = s.messages.slice()
        const last = messages[messages.length - 1]
        if (last && last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, content: last.content + token }
        }
        return { messages }
      })
    })
    window.ai.onProgress((done, total, file) => {
      set({ progress: done >= total ? null : { done, total, file } })
    })
  },

  refreshStatus: async (root) => {
    const status = await window.ai.status(root)
    set({ status })
  },

  reindex: async (root) => {
    set({ progress: { done: 0, total: 1, file: '' } })
    await window.ai.reindex(root)
    set({ progress: null })
    await get().refreshStatus(root)
  },

  ask: async (root, question) => {
    if (get().streaming) return
    const reqId = Math.random().toString(36).slice(2)
    const history = get().messages.map((m) => ({ role: m.role, content: m.content }))
    set((s) => ({
      messages: [
        ...s.messages,
        { role: 'user', content: question },
        { role: 'assistant', content: '' }
      ],
      streaming: true,
      activeReqId: reqId
    }))
    try {
      const sources = await window.ai.ask(reqId, root, question, history)
      set((s) => {
        const messages = s.messages.slice()
        const last = messages[messages.length - 1]
        if (last && last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, sources }
        }
        return { messages, streaming: false, activeReqId: null }
      })
    } catch (err) {
      set((s) => {
        const messages = s.messages.slice()
        const last = messages[messages.length - 1]
        if (last && last.role === 'assistant' && !last.content) {
          messages[messages.length - 1] = {
            ...last,
            content: `⚠️ ${(err as Error).message}. Is Ollama running?`
          }
        }
        return { messages, streaming: false, activeReqId: null }
      })
    }
  },

  clear: () => set({ messages: [] })
}))
