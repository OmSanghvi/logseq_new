# Obsidian Clone (+ AI research agent)

A desktop markdown-vault editor built to look and work like [Obsidian](https://obsidian.md),
with an AI research agent layered on top. Replaces the previous Logseq codebase
(archived in `legacy-logseq/`).

## Stack

- **Electron** (desktop shell) + **electron-vite**
- **React 18 + TypeScript** renderer
- **CodeMirror 6** markdown editor with Obsidian-style syntax highlighting
- **zustand** for state
- **lucide-react** icons (the same icon set Obsidian uses)

A "vault" is just a folder of `.md` files on disk. The app reads/writes them
directly and watches for external changes.

## Running

This project needs **Node 18+** (Node 22 recommended). With nvm:

```bash
nvm use 22
npm install
npm run dev      # hot-reloading dev build
npm run start    # build + preview the production bundle
npm run build    # build only
npm run typecheck
```

On first launch, click **Open folder as vault** and pick a folder
(try `demo-vault/` in this repo). The chosen vault is remembered between launches.

## Project layout

```
src/
  main/         Electron main process (window + vault filesystem IPC)
    index.ts    window, IPC handlers, file watcher
    vault.ts    safe filesystem ops on the vault
    store.ts    tiny JSON settings store (remembers last vault)
  preload/      contextBridge API exposed to the renderer as window.vault
  shared/       types shared across processes
  renderer/     React UI
    src/components/  Ribbon, Sidebar/FileTree, TabBar, Editor, StatusBar
    src/store/       zustand vault store
    src/styles/      Obsidian-like theme
```

## Status

**Milestone 1 — Obsidian shell (in progress):**

- [x] Vault open/remember, file-tree sidebar, tabs, CodeMirror editor
- [x] Save (Cmd+S), dirty indicators, live external-change watching
- [ ] `[[wikilinks]]` + autocomplete + backlinks pane
- [ ] Live-preview rendering mode, command palette (Cmd+P), global search
- [ ] Graph view

**Milestone 2 — AI research agent (planned):** see `docs/AI_ARCHITECTURE.md`.
