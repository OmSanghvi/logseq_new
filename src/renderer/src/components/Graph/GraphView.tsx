import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useVault } from '../../store/vaultStore'

interface Node {
  id: string
  title: string
  x: number
  y: number
  vx: number
  vy: number
  deg: number
}

/** Lightweight force-directed graph of notes and their wikilinks. */
export default function GraphView({ onClose }: { onClose: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const index = useVault((s) => s.index)
  const resolveTitle = useVault((s) => s.resolveTitle)
  const openFile = useVault((s) => s.openFile)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !index) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1

    const notes = index.notes.slice(0, 400)
    const nodes: Node[] = notes.map((n, i) => ({
      id: n.relPath,
      title: n.title,
      x: Math.cos(i) * 200 + (Math.random() - 0.5) * 40,
      y: Math.sin(i) * 200 + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      deg: 0
    }))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const edges: [Node, Node][] = []
    for (const n of notes) {
      const src = byId.get(n.relPath)!
      for (const l of n.links) {
        const targetRel = resolveTitle(l)
        const dst = targetRel ? byId.get(targetRel) : undefined
        if (dst && dst !== src) {
          edges.push([src, dst])
          src.deg++
          dst.deg++
        }
      }
    }

    let view = { x: 0, y: 0, scale: 1 }
    let raf = 0
    let alpha = 1

    const resize = (): void => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      view.x = r.width / 2
      view.y = r.height / 2
    }
    resize()

    const step = (): void => {
      // Repulsion (O(n^2), capped node count keeps this cheap).
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let d2 = dx * dx + dy * dy || 0.01
          const f = (2000 * alpha) / d2
          const d = Math.sqrt(d2)
          dx /= d
          dy /= d
          a.vx += dx * f
          a.vy += dy * f
          b.vx -= dx * f
          b.vy -= dy * f
        }
      }
      // Springs along edges.
      for (const [a, b] of edges) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01
        const f = (d - 90) * 0.02 * alpha
        const ux = dx / d
        const uy = dy / d
        a.vx += ux * f
        a.vy += uy * f
        b.vx -= ux * f
        b.vy -= uy * f
      }
      // Gravity to center + integrate.
      for (const n of nodes) {
        n.vx += -n.x * 0.002 * alpha
        n.vy += -n.y * 0.002 * alpha
        n.vx *= 0.85
        n.vy *= 0.85
        n.x += n.vx
        n.y += n.vy
      }
      alpha *= 0.995
      if (alpha < 0.03) alpha = 0.03
    }

    const draw = (): void => {
      const r = canvas.getBoundingClientRect()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, r.width, r.height)
      ctx.save()
      ctx.translate(view.x, view.y)
      ctx.scale(view.scale, view.scale)

      ctx.strokeStyle = 'rgba(150,150,160,0.18)'
      ctx.lineWidth = 1
      for (const [a, b] of edges) {
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      for (const n of nodes) {
        const r2 = 3 + Math.min(n.deg, 8)
        ctx.beginPath()
        ctx.arc(n.x, n.y, r2, 0, Math.PI * 2)
        ctx.fillStyle = n.id === useVault.getState().activePath ? '#a882ff' : '#8a5cf6'
        ctx.fill()
        if (view.scale > 0.8) {
          ctx.fillStyle = 'rgba(220,220,220,0.8)'
          ctx.font = '10px sans-serif'
          ctx.fillText(n.title.slice(0, 24), n.x + r2 + 2, n.y + 3)
        }
      }
      ctx.restore()
    }

    const loop = (): void => {
      step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    loop()

    // Interaction: pan, zoom, click-to-open.
    let dragging = false
    let last = { x: 0, y: 0 }
    let moved = false
    const onDown = (e: MouseEvent): void => {
      dragging = true
      moved = false
      last = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return
      moved = true
      view.x += e.clientX - last.x
      view.y += e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: MouseEvent): void => {
      dragging = false
      if (moved) return
      const r = canvas.getBoundingClientRect()
      const wx = (e.clientX - r.left - view.x) / view.scale
      const wy = (e.clientY - r.top - view.y) / view.scale
      const hit = nodes.find((n) => Math.hypot(n.x - wx, n.y - wy) < 8)
      if (hit) {
        onClose()
        void openFile(hit.id, hit.id.split('/').pop()!)
      }
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      view.scale = Math.max(0.2, Math.min(4, view.scale * factor))
    }
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', resize)
    }
  }, [index, resolveTitle, openFile, onClose])

  return (
    <div className="graph-overlay">
      <div className="graph-header">
        <span>Graph view</span>
        <button className="icon-btn" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  )
}
