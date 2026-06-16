import { Marked, type Tokens } from 'marked'
import hljs from 'highlight.js'
import katex from 'katex'
import DOMPurify from 'dompurify'

export interface LinkResolution {
  href: string
  exists: boolean
}
export interface EmbedResolution {
  kind: 'image' | 'pdf' | 'note' | 'missing'
  url?: string
  target: string
}

export interface RenderOptions {
  resolveLink: (target: string) => LinkResolution
  resolveEmbed: (target: string) => EmbedResolution
}

function renderMath(expr: string, display: boolean): string {
  try {
    return katex.renderToString(expr, { displayMode: display, throwOnError: false })
  } catch {
    return `<code>${expr}</code>`
  }
}

function buildMarked(opts: RenderOptions): Marked {
  const m = new Marked({ gfm: true, breaks: false })

  m.use({
    extensions: [
      // ![[embed]] — image, pdf card, or note link. Must come before wikilink.
      {
        name: 'embed',
        level: 'inline',
        start(src) {
          return src.indexOf('![[')
        },
        tokenizer(src) {
          const match = /^!\[\[([^\]]+?)\]\]/.exec(src)
          if (match) return { type: 'embed', raw: match[0], text: match[1].trim() }
          return undefined
        },
        renderer(token) {
          const e = opts.resolveEmbed((token as Tokens.Generic).text as string)
          if (e.kind === 'image' && e.url) return `<img class="embed-img" src="${e.url}" alt="${e.target}" />`
          if (e.kind === 'pdf' && e.url)
            return `<a class="embed-pdf" data-embed-pdf="${e.target}" href="#">📄 ${e.target}</a>`
          if (e.kind === 'note')
            return `<a class="internal-link" data-href="${e.target}">${e.target}</a>`
          return `<span class="internal-link is-unresolved">${e.target}</span>`
        }
      },
      // [[wikilink]] or [[target|alias]]
      {
        name: 'wikilink',
        level: 'inline',
        start(src) {
          return src.indexOf('[[')
        },
        tokenizer(src) {
          const match = /^\[\[([^\]]+?)\]\]/.exec(src)
          if (match) {
            const [target, alias] = match[1].split('|')
            return {
              type: 'wikilink',
              raw: match[0],
              text: (alias ?? target).trim(),
              target: target.split('#')[0].trim()
            }
          }
          return undefined
        },
        renderer(token) {
          const tk = token as Tokens.Generic
          const res = opts.resolveLink(tk.target as string)
          const cls = res.exists ? 'internal-link' : 'internal-link is-unresolved'
          return `<a class="${cls}" data-href="${tk.target}">${tk.text}</a>`
        }
      },
      // $$ block math $$
      {
        name: 'blockMath',
        level: 'block',
        start(src) {
          return src.indexOf('$$')
        },
        tokenizer(src) {
          const match = /^\$\$([\s\S]+?)\$\$/.exec(src)
          if (match) return { type: 'blockMath', raw: match[0], text: match[1].trim() }
          return undefined
        },
        renderer(token) {
          return `<div class="math-block">${renderMath((token as Tokens.Generic).text as string, true)}</div>`
        }
      },
      // $ inline math $
      {
        name: 'inlineMath',
        level: 'inline',
        start(src) {
          return src.indexOf('$')
        },
        tokenizer(src) {
          const match = /^\$([^$\n]+?)\$/.exec(src)
          if (match) return { type: 'inlineMath', raw: match[0], text: match[1] }
          return undefined
        },
        renderer(token) {
          return renderMath((token as Tokens.Generic).text as string, false)
        }
      },
      // #tag
      {
        name: 'hashtag',
        level: 'inline',
        start(src) {
          return src.search(/(^|\s)#[A-Za-z]/)
        },
        tokenizer(src) {
          const match = /^#([A-Za-z0-9_/-]+)/.exec(src)
          if (match) return { type: 'hashtag', raw: match[0], text: match[1] }
          return undefined
        },
        renderer(token) {
          const t = (token as Tokens.Generic).text as string
          return `<a class="tag" data-tag="${t}">#${t}</a>`
        }
      }
    ],
    renderer: {
      code({ text, lang }: Tokens.Code): string {
        const language = lang && hljs.getLanguage(lang) ? lang : ''
        const html = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value
        return `<pre><code class="hljs ${language ? 'language-' + language : ''}">${html}</code></pre>`
      }
    }
  })

  return m
}

/** Convert Obsidian-style `> [!note] Title` blockquotes into callout markup. */
function transformCallouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(\w+)\]([+-]?)\s*(.*?)<\/p>/gis,
    (_m, type: string, _fold: string, title: string) => {
      const label = title.trim() || type.charAt(0).toUpperCase() + type.slice(1)
      return `<blockquote class="callout callout-${type.toLowerCase()}"><div class="callout-title">${label}</div>`
    }
  )
}

export function renderMarkdown(src: string, opts: RenderOptions): string {
  const raw = buildMarked(opts).parse(src, { async: false }) as string
  const withCallouts = transformCallouts(raw)
  return DOMPurify.sanitize(withCallouts, {
    ADD_ATTR: ['data-href', 'data-tag', 'data-embed-pdf', 'target'],
    ADD_TAGS: ['span'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|vaultfile|data|blob|#):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
  })
}
