/**
 * KOVA entry — registers a <kova-app> custom element so logseq's CLJS
 * can mount/unmount it with a single DOM node.
 *
 * Usage from any HTML:
 *   <kova-app></kova-app>
 *
 * The element mounts the full Solid.js app into its shadow root and
 * disposes it cleanly when removed from the DOM.
 */

import { render, type JSX } from "solid-js/web"
import { createSignal, onCleanup } from "solid-js"
import App from "./App"
import "./index.css"

class KovaAppElement extends HTMLElement {
  private _dispose: (() => void) | null = null

  connectedCallback() {
    // Use a plain div inside the element (not shadow DOM) so logseq CSS vars leak in
    const root = document.createElement("div")
    root.style.cssText = "width:100%;height:100%;display:contents;"
    this.appendChild(root)
    this._dispose = render(() => <App />, root)
  }

  disconnectedCallback() {
    this._dispose?.()
    this._dispose = null
    this.innerHTML = ""
  }
}

if (!customElements.get("kova-app")) {
  customElements.define("kova-app", KovaAppElement)
}

// Also expose a programmatic mount for the CLJS wrapper
export function mountKova(container: HTMLElement): () => void {
  return render(() => <App />, container)
}

// Expose config helper on window for easy user setup
declare global {
  interface Window {
    kovaSetLLM: (endpoint: string, model: string, apiKey?: string) => void
  }
}

import { setLLMConfig } from "./ai-engine-standalone"
window.kovaSetLLM = (endpoint, model, apiKey = "") => {
  setLLMConfig(endpoint, model, apiKey)
  console.info(`[KOVA] LLM configured: ${model} @ ${endpoint}`)
}
