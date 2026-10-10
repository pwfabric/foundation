import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const prosePropsSchema = z.object({
  // Long-form body content. Accepts either a Markdown string (preferred — h2/##,
  // lists, **bold**, links) OR a raw HTML fragment. Bindable so the content can
  // be driven from a data source (CMS article body, etc.).
  content: z.string().default(''),
  // Constrain the reading column for comfortable line length (~65ch is ideal).
  // Numbers → px; strings (e.g. '65ch', '720px') pass through. Defaults to a
  // readable measure via the layout container token.
  maxWidth: z.union([z.number(), z.string()]).optional(),
})

export type ProseProps = z.infer<typeof prosePropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const proseDefinition: BlockDefinition = {
  type: 'prose',
  name: 'Prose',
  category: 'text',
  icon: '¶',
  schema: prosePropsSchema,
  defaultProps: {
    content: '',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 8 } },
  canHaveChildren: false,
}

// ============================================================
// SANITIZER (conservative allowlist — no external deps)
// ============================================================

// Block-level + inline tags we allow in rendered prose. Everything else is
// stripped. We never allow <script>, <style>, <iframe>, <object>, <embed>,
// event-handler attributes, or javascript:/data: URLs.
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'strong', 'em', 'b', 'i', 'u', 's', 'del', 'mark', 'small', 'sub', 'sup',
  'a', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption',
])

// Per-tag attribute allowlist. href/src are sanitized for protocol separately.
const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'title', 'rel', 'target']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
}

/**
 * Decode the character references a browser would decode inside an attribute
 * before it reads the scheme: `jav&#x61;script:` and `javascript&colon;` are
 * `javascript:` to the browser, so they must be to this check too.
 */
function decodeRefs(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16) || 0))
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCodePoint(Number(d) || 0))
    .replace(/&colon;/gi, ':')
    .replace(/&(tab|newline);/gi, '')
    .replace(/&amp;/gi, '&')
}

/** Escape a value for a double-quoted HTML attribute. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The URL a link or image may carry: http(s), mailto, tel, an anchor, a query
 * or a relative path. Every other scheme (javascript:, data:, vbscript:,
 * file:…) is refused — including one hidden behind character references or
 * control characters, which browsers strip before reading the scheme.
 */
export function safeUrl(value: string): string | null {
  // eslint-disable-next-line no-control-regex
  const v = decodeRefs(value).replace(/[\u0000-\u001F\u007F]/g, '').trim()
  // A named reference this decoder does not know could still hide a scheme
  // character — refuse rather than guess.
  if (/&[a-z][a-z0-9]*;/i.test(v)) return null
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/|\?)/i.test(v)) return v
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return v // schemeless (relative path)
  return null
}

/**
 * Conservative HTML sanitizer. Parses with DOMParser when a DOM is available
 * (browser / runtime DOM), else falls back to a regex strip of dangerous
 * constructs so SSR/Node renders stay safe.
 */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return regexStrip(html)
  }
  try {
    const doc = new window.DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstChild as HTMLElement | null
    if (!root) return ''
    sanitizeNode(root)
    return root.innerHTML
  } catch {
    return regexStrip(html)
  }
}

function sanitizeNode(node: Element): void {
  // Walk a static copy of children so removals during iteration are safe.
  const children = Array.from(node.children)
  for (const child of children) {
    const tag = child.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) {
      child.remove()
      continue
    }
    // Strip every attribute that isn't explicitly allowed; sanitize href/src.
    const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>()
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || !allowed.has(name)) {
        child.removeAttribute(attr.name)
        continue
      }
      if (name === 'href' || name === 'src') {
        const cleaned = safeUrl(attr.value)
        if (cleaned == null) child.removeAttribute(attr.name)
        else child.setAttribute(attr.name, cleaned)
      }
    }
    // Anchors that open a new tab get safe rel.
    if (tag === 'a' && child.getAttribute('target') === '_blank') {
      child.setAttribute('rel', 'noopener noreferrer')
    }
    sanitizeNode(child)
  }
}

// SSR / no-DOM fallback: strip script/style/iframe/etc. blocks, event-handler
// attributes, and dangerous URL schemes. Conservative but does not parse.
//
// An event handler is an attribute NAME, and a name may follow a quote or a
// slash as well as a space: `<a href="x"onmouseover="…">` is valid HTML. The old
// pattern wanted a space in front and let exactly that through.
// `style` goes too — the DOM path never allowed it. href/src keep only a safe
// URL, rewritten into a quoted, escaped attribute.
export function regexStrip(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input|button|svg)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|input)\b[^>]*\/?\s*>/gi, '')
    .replace(/([\s"'/])(?:on[a-z]+|style|formaction|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1')
    .replace(
      /([\s"'/])(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_m, pre: string, name: string, _v: string, dq?: string, sq?: string, bare?: string) => {
        const url = safeUrl(dq ?? sq ?? bare ?? '')
        return url == null ? pre : `${pre}${name}="${escapeAttr(url)}"`
      }
    )
}

// ============================================================
// MINIMAL MARKDOWN → HTML
// ============================================================

// Heuristic: if the content has no angle-bracket tags but has markdown markers,
// treat it as Markdown. A string with HTML tags is treated as HTML.
function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inlineMd(s: string): string {
  // Order matters: code spans first so their contents are not further parsed.
  return s
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${escapeHtml(c)}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
      const u = safeUrl(url)
      return u ? `<img src="${escapeAttr(u)}" alt="${escapeAttr(alt)}" />` : escapeHtml(alt)
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
      // Quoted and escaped: a `"` in the URL closed the attribute and the rest
      // became attributes of the link.
      const u = safeUrl(url)
      return u ? `<a href="${escapeAttr(u)}">${text}</a>` : text
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let listType: 'ul' | 'ol' | null = null
  const closeList = (): void => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }
  // The scanner walks by index, and `lines[i]` is `string | undefined` to the
  // type system even under an `i < lines.length` test. Each read is taken once
  // into a local that carries the narrowing, so the loop conditions and the
  // bodies agree on the same value instead of re-indexing.
  for (;;) {
    const line = lines[i]
    if (line === undefined) break
    const trimmed = line.trim()
    // Fenced code block
    if (/^```/.test(trimmed)) {
      closeList()
      const buf: string[] = []
      i++
      for (;;) {
        const fenced = lines[i]
        if (fenced === undefined || /^```/.test(fenced.trim())) break
        buf.push(escapeHtml(fenced))
        i++
      }
      i++ // consume closing fence
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`)
      continue
    }
    // Blank line
    if (trimmed === '') {
      closeList()
      i++
      continue
    }
    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (h) {
      closeList()
      // Both groups are mandatory in the pattern, so a match always carries
      // them — the fallbacks exist only because an indexed match read is typed
      // `string | undefined`, and they cannot be reached.
      const hashes = h[1] ?? '#'
      const level = hashes.length
      out.push(`<h${level}>${inlineMd(escapeHtml(h[2] ?? ''))}</h${level}>`)
      i++
      continue
    }
    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeList()
      out.push('<hr />')
      i++
      continue
    }
    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      closeList()
      const buf: string[] = []
      for (;;) {
        const quoted = lines[i]
        if (quoted === undefined) break
        const quotedTrimmed = quoted.trim()
        if (!/^>\s?/.test(quotedTrimmed)) break
        buf.push(inlineMd(escapeHtml(quotedTrimmed.replace(/^>\s?/, ''))))
        i++
      }
      out.push(`<blockquote>${buf.join('<br />')}</blockquote>`)
      continue
    }
    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inlineMd(escapeHtml(trimmed.replace(/^[-*+]\s+/, '')))}</li>`)
      i++
      continue
    }
    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inlineMd(escapeHtml(trimmed.replace(/^\d+\.\s+/, '')))}</li>`)
      i++
      continue
    }
    // Paragraph
    closeList()
    out.push(`<p>${inlineMd(escapeHtml(trimmed))}</p>`)
    i++
  }
  closeList()
  return out.join('\n')
}

// ============================================================
// COMPONENT
// ============================================================

export const ProseBlock: BlockComponent = ({ props, block }) => {
  const raw = (props.content as string) ?? ''
  // Markdown vs HTML detection, then sanitize the resulting HTML in both paths.
  const html = looksLikeHtml(raw) ? raw : markdownToHtml(raw)
  const sanitized = sanitizeHtml(html)

  // Stable per-instance id so the scoped <style> only targets THIS block's
  // descendants. pwpack blocks ship no CSS file, so we inline a scoped style tag.
  const proseId = `pw-prose-${block.id}`

  const wrapStyle: React.CSSProperties = {
    maxWidth: cssUnit(props.maxWidth as CSSUnit) ?? 'var(--pw-layout-container-max-width, 1440px)',
    marginInline: '0',
    color: 'var(--pw-color-text)',
    fontFamily: 'var(--pw-font-family, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif)',
    fontSize: 'var(--pw-font-size-base)',
    lineHeight: 'var(--pw-line-height-body)',
    // Inherited by every paragraph and heading inside: a long word or URL
    // breaks rather than overflowing a narrow viewport.
    overflowWrap: 'anywhere',
    minWidth: 0,
    ...block.style,
  }

  // Descendant rules are scoped by [data-prose-id="…"] so they never leak. Every
  // value is a theme token → the article re-themes with the surface.
  const css = `
[data-prose-id="${proseId}"] > :first-child { margin-top: 0; }
[data-prose-id="${proseId}"] > :last-child { margin-bottom: 0; }
[data-prose-id="${proseId}"] h1 { font-size: var(--pw-font-size-4xl); font-family: var(--pw-font-family-heading); font-weight: var(--pw-font-weight-heading); line-height: var(--pw-line-height-heading); color: var(--pw-color-text); margin: var(--pw-space-xl) 0 var(--pw-space-md); }
[data-prose-id="${proseId}"] h2 { font-size: var(--pw-font-size-2xl); font-family: var(--pw-font-family-heading); font-weight: var(--pw-font-weight-heading); line-height: var(--pw-line-height-heading); color: var(--pw-color-text); margin: var(--pw-space-xl) 0 var(--pw-space-sm); }
[data-prose-id="${proseId}"] h3 { font-size: var(--pw-font-size-xl); font-family: var(--pw-font-family-heading); font-weight: var(--pw-font-weight-heading); line-height: var(--pw-line-height-heading); color: var(--pw-color-text); margin: var(--pw-space-lg) 0 var(--pw-space-sm); }
[data-prose-id="${proseId}"] h4 { font-size: var(--pw-font-size-lg); font-family: var(--pw-font-family-heading); font-weight: var(--pw-font-weight-heading); line-height: var(--pw-line-height-heading); color: var(--pw-color-text); margin: var(--pw-space-lg) 0 var(--pw-space-xs); }
[data-prose-id="${proseId}"] p { line-height: var(--pw-line-height-body); color: var(--pw-color-text); margin: 0 0 var(--pw-space-md); }
[data-prose-id="${proseId}"] ul, [data-prose-id="${proseId}"] ol { margin: 0 0 var(--pw-space-md); padding-inline-start: var(--pw-space-xl); color: var(--pw-color-text); }
[data-prose-id="${proseId}"] li { margin: 0 0 var(--pw-space-xs); line-height: var(--pw-line-height-body); }
[data-prose-id="${proseId}"] blockquote { border-left: 3px solid var(--pw-color-border); margin: 0 0 var(--pw-space-md); padding: var(--pw-space-xs) 0 var(--pw-space-xs) var(--pw-space-md); color: var(--pw-color-text-muted); font-style: italic; }
[data-prose-id="${proseId}"] code { font-family: var(--pw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: var(--pw-font-size-sm); background: var(--pw-color-card); color: var(--pw-color-text); padding: 0.15em 0.4em; border-radius: var(--pw-border-radius-sm); }
[data-prose-id="${proseId}"] pre { background: var(--pw-color-card); color: var(--pw-color-text); padding: var(--pw-space-md); border-radius: var(--pw-border-radius-lg); overflow-x: auto; margin: 0 0 var(--pw-space-md); border: 1px solid var(--pw-color-border); }
[data-prose-id="${proseId}"] pre code { background: none; padding: 0; font-size: var(--pw-font-size-sm); }
[data-prose-id="${proseId}"] a { color: var(--pw-color-primary-ink, #18181b); text-decoration: underline; }
[data-prose-id="${proseId}"] strong, [data-prose-id="${proseId}"] b { font-weight: var(--pw-font-weight-heading); color: var(--pw-color-text); }
[data-prose-id="${proseId}"] em, [data-prose-id="${proseId}"] i { font-style: italic; }
[data-prose-id="${proseId}"] hr { border: none; border-top: 1px solid var(--pw-color-border); margin: var(--pw-space-xl) 0; }
[data-prose-id="${proseId}"] img { max-width: 100%; height: auto; border-radius: var(--pw-border-radius-lg); }
[data-prose-id="${proseId}"] table { width: 100%; border-collapse: collapse; margin: 0 0 var(--pw-space-md); }
[data-prose-id="${proseId}"] th, [data-prose-id="${proseId}"] td { border: 1px solid var(--pw-color-border); padding: var(--pw-space-xs) var(--pw-space-sm); text-align: left; }
[data-prose-id="${proseId}"] th { color: var(--pw-color-text); font-weight: var(--pw-font-weight-heading); }
`.trim()

  return (
    <div id={block.id} data-block-id={block.id} style={wrapStyle} data-block-type="prose">
      <style>{css}</style>
      <div data-prose-id={proseId} dangerouslySetInnerHTML={{ __html: sanitized }} />
    </div>
  )
}
