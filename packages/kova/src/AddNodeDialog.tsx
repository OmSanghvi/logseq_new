/**
 * AddNodeDialog — create a new research knowledge graph node.
 */

import { createSignal, For, type Component } from "solid-js"
import type { NodeType } from "./types"
import { addNode } from "./store"

const TYPES: NodeType[] = ["text", "url", "paper", "pdf", "query", "synthesis"]

const AddNodeDialog: Component<{ onClose: () => void }> = (props) => {
  const [title,   setTitle]   = createSignal("")
  const [type,    setType]    = createSignal<NodeType>("text")
  const [content, setContent] = createSignal("")
  const [url,     setUrl]     = createSignal("")
  const [tags,    setTags]    = createSignal("")

  const submit = (e: Event) => {
    e.preventDefault()
    if (!title().trim()) return
    addNode({
      type:    type(),
      title:   title().trim(),
      content: content().trim() || `New ${type()} node: ${title().trim()}`,
      tags:    tags().split(",").map(t => t.trim()).filter(Boolean),
      source:  "user",
      url:     url().trim() || undefined,
    })
    props.onClose()
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center"
         onClick={e => { if (e.target === e.currentTarget) props.onClose() }}>
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onSubmit={submit}
            class="relative w-full max-w-md rounded-xl bg-[--kova-surface] border border-white/15 shadow-2xl p-5 flex flex-col gap-4 z-10">

        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium text-[--kova-text]">Add node</h2>
          <button type="button" onClick={props.onClose}
                  class="w-7 h-7 flex items-center justify-center rounded text-[--kova-weak] hover:text-[--kova-text] hover:bg-white/10 transition-colors text-base"
                  style={{ background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>

        <FieldLabel label="Title *">
          <input value={title()} onInput={e => setTitle(e.currentTarget.value)}
                 placeholder="Node title" required class="kova-input" />
        </FieldLabel>

        <FieldLabel label="Type">
          <select value={type()} onChange={e => setType(e.currentTarget.value as NodeType)}
                  class="kova-input">
            <For each={TYPES}>{t => <option value={t}>{t}</option>}</For>
          </select>
        </FieldLabel>

        <FieldLabel label="URL (optional)">
          <input value={url()} onInput={e => setUrl(e.currentTarget.value)}
                 placeholder="https://…" type="url" class="kova-input" />
        </FieldLabel>

        <FieldLabel label="Content">
          <textarea value={content()} onInput={e => setContent(e.currentTarget.value)}
                    placeholder="Markdown content…" rows={4} class="kova-input resize-y" />
        </FieldLabel>

        <FieldLabel label="Tags (comma-separated)">
          <input value={tags()} onInput={e => setTags(e.currentTarget.value)}
                 placeholder="nlp, transformer, notes" class="kova-input" />
        </FieldLabel>

        <div class="flex gap-2 justify-end pt-1">
          <button type="button" class="kova-btn" onClick={props.onClose}>Cancel</button>
          <button type="submit" class="kova-btn kova-btn-primary">Add node</button>
        </div>
      </form>
    </div>
  )
}

const FieldLabel: Component<{ label: string; children: any }> = (props) => (
  <label class="flex flex-col gap-1">
    <span class="text-[10px] font-medium text-[--kova-weak] uppercase tracking-widest">{props.label}</span>
    {props.children}
  </label>
)

export default AddNodeDialog
