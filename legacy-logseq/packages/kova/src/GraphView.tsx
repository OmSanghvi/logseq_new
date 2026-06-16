/**
 * KOVA Graph View — Sigma.js renderer inside opencode's app package.
 * Obsidian-style: white dots, thin grey edges, tiny labels.
 */

import { onMount, onCleanup, createEffect, type Component } from "solid-js"
import Graph from "graphology"
import Sigma from "sigma"
import FA2Layout from "graphology-layout-forceatlas2/worker"
import circularLayout from "graphology-layout/circular"
import type { KNode, KEdge } from "./types"
import { NODE_ACCENT, EDGE_ACCENT } from "./types"

const BG           = "var(--background-base)"
const NODE_DEFAULT = "#d4d4d4"
const NODE_SEL     = "#ffffff"
const NODE_DIM     = "#d4d4d420"
const EDGE_DEFAULT = "#444444"
const EDGE_DIM     = "#44444415"
const LABEL_COLOR  = "rgba(212,212,212,0.82)"
const BASE_SIZE    = 5

export interface GraphViewProps {
  nodes: KNode[]
  edges: KEdge[]
  selected?: string
  onSelect: (id: string) => void
}

const GraphView: Component<GraphViewProps> = (props) => {
  let container!: HTMLDivElement

  onMount(() => {
    const g = new Graph()

    // Populate nodes
    for (const n of props.nodes) {
      g.addNode(n.id, {
        x: 0, y: 0,
        size:  BASE_SIZE,
        color: NODE_DEFAULT,
        label: n.title,
        _type: n.type,
        _data: n,
      })
    }

    // Populate edges
    for (const e of props.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
      if (!g.hasEdge(e.id)) {
        g.addEdgeWithKey(e.id, e.source, e.target, {
          size: 1, color: EDGE_DEFAULT, _data: e,
        })
      }
    }

    // Stable circular start → FA2 converges fast
    circularLayout.assign(g, { scale: 220 })

    // Sigma renderer
    const renderer = new Sigma(g, container, {
      renderLabels:               true,
      labelRenderedSizeThreshold: 3,
      labelFont:                  "Inter, system-ui, sans-serif",
      labelSize:                  10,
      labelWeight:                "400",
      labelColor:                 { color: LABEL_COLOR },
      labelDensity:               0.7,
      defaultNodeColor:           NODE_DEFAULT,
      defaultEdgeColor:           EDGE_DEFAULT,
      minCameraRatio:             0.03,
      maxCameraRatio:             15,
      stagePadding:               60,
    })

    // FA2 physics — converges in ~2s then stops
    const layout = new FA2Layout(g, {
      settings: {
        gravity:           1.5,
        scalingRatio:      4,
        slowDown:          12,
        barnesHutOptimize: props.nodes.length > 60,
        adjustSizes:       false,
        strongGravityMode: false,
      },
    })

    let running = false
    let stopTimer: ReturnType<typeof setTimeout> | null = null

    function burst(ms: number) {
      if (stopTimer) clearTimeout(stopTimer)
      if (!running) { layout.start(); running = true }
      stopTimer = setTimeout(() => { layout.stop(); running = false }, ms)
    }

    burst(2500) // initial settle

    // Hover state
    let hovered: string | null = null
    function applyHover(node: string | null) {
      hovered = node
      if (!node) {
        g.forEachNode((id) => {
          g.setNodeAttribute(id, "color", NODE_DEFAULT)
          g.setNodeAttribute(id, "size",  BASE_SIZE)
        })
        g.forEachEdge((eid) => g.setEdgeAttribute(eid, "color", EDGE_DEFAULT))
      } else {
        const nb = new Set([node, ...g.neighbors(node)])
        g.forEachNode((id) => {
          g.setNodeAttribute(id, "color", nb.has(id) ? NODE_ACCENT[g.getNodeAttribute(id, "_type") as keyof typeof NODE_ACCENT] ?? NODE_DEFAULT : NODE_DIM)
          g.setNodeAttribute(id, "size",  nb.has(id) ? BASE_SIZE + 1.5 : BASE_SIZE - 1)
        })
        g.forEachEdge((eid) => {
          const src = g.source(eid), tgt = g.target(eid)
          g.setEdgeAttribute(eid, "color", (nb.has(src) && nb.has(tgt)) ? EDGE_DEFAULT : EDGE_DIM)
        })
      }
      renderer.refresh()
    }

    renderer.on("enterNode", ({ node }) => applyHover(node))
    renderer.on("leaveNode", () => applyHover(null))

    renderer.on("clickNode", ({ node }) => {
      props.onSelect(node)
      burst(500)
    })

    renderer.on("downNode", () => burst(700))

    // Reactive: selected highlight
    createEffect(() => {
      const sel = props.selected
      g.forEachNode((id) => {
        if (id === sel) {
          g.setNodeAttribute(id, "color", NODE_SEL)
          g.setNodeAttribute(id, "size",  BASE_SIZE + 3)
        } else if (hovered === null) {
          g.setNodeAttribute(id, "color", NODE_DEFAULT)
          g.setNodeAttribute(id, "size",  BASE_SIZE)
        }
      })
      renderer.refresh()
    })

    // Reactive: sync nodes/edges
    createEffect(() => {
      const nodes = props.nodes
      const edges = props.edges

      // Sync nodes
      const existN = new Set(g.nodes())
      const incomN = new Set(nodes.map(n => n.id))
      for (const id of existN) { if (!incomN.has(id)) g.dropNode(id) }
      for (const n of nodes) {
        if (g.hasNode(n.id)) {
          g.setNodeAttribute(n.id, "label", n.title)
          g.setNodeAttribute(n.id, "_data", n)
          g.setNodeAttribute(n.id, "_type", n.type)
        } else {
          g.addNode(n.id, {
            x: Math.random() * 200 - 100, y: Math.random() * 200 - 100,
            size: BASE_SIZE, color: NODE_DEFAULT,
            label: n.title, _type: n.type, _data: n,
          })
          burst(400)
        }
      }

      // Sync edges
      const existE = new Set(g.edges())
      const incomE = new Set(edges.map(e => e.id))
      for (const eid of existE) { if (!incomE.has(eid)) g.dropEdge(eid) }
      for (const e of edges) {
        if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
        if (!g.hasEdge(e.id)) {
          g.addEdgeWithKey(e.id, e.source, e.target, {
            size: 1, color: EDGE_ACCENT[e.type] ?? EDGE_DEFAULT, _data: e,
          })
        }
      }
      renderer.refresh()
    })

    // Pause when hidden
    const onVis = () => {
      if (document.hidden) { layout.stop(); running = false }
      else burst(300)
    }
    document.addEventListener("visibilitychange", onVis)

    onCleanup(() => {
      if (stopTimer) clearTimeout(stopTimer)
      document.removeEventListener("visibilitychange", onVis)
      layout.stop()
      layout.kill()
      renderer.kill()
      g.clear()
    })
  })

  return (
    <div
      ref={container}
      class="size-full"
      style={{ background: BG }}
    />
  )
}

export default GraphView
