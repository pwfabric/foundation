/**
 * Shared utility functions used across block components.
 * Not exported from the public barrel — internal to blocks/ only.
 */

import type * as React from 'react'

export type CSSUnit = number | string | undefined

/**
 * Safely convert any value to a renderable string.
 * Prevents React "Objects are not valid as a React child" crashes
 * when block props contain unexpected types (objects, null, etc.).
 */
export function safeRenderValue(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  if (typeof value !== 'object') return String(value)
  return JSON.stringify(value)
}

/**
 * Sanitise a user-supplied href before it reaches an <a href>.
 *
 * Block props (link targets) are author-controlled and rendered into
 * published surfaces, so a `javascript:` / `data:` / `vbscript:` URI would be a
 * stored-XSS vector. Allow only http(s)/mailto/tel absolute URLs and relative
 * / same-document links; return undefined for empty or unsafe values so the
 * caller can drop the href (render a span instead of an anchor).
 */
export function safeHref(href: string | undefined): string | undefined {
  if (typeof href !== 'string' || !href) return undefined
  const t = href.trim()
  if (!t) return undefined
  // A browser's URL parser DELETES tabs and newlines before it reads the
  // scheme, so "java\tscript:alert(1)" is a javascript: URL — while the scheme
  // test below saw no scheme at all and passed it as a relative path. Judge the
  // scheme on the string the browser will actually parse.
  // eslint-disable-next-line no-control-regex
  const probe = t.replace(/[\u0000-\u001F\u007F]/g, '')
  if (probe !== t) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(probe) && !/^(https?:|mailto:|tel:)/i.test(probe)) return undefined
    return safeHref(probe)
  }
  // Relative, same-document, query or anchor links are safe.
  if (/^(\/|#|\?|\.\/|\.\.\/)/.test(t)) return t
  // Absolute URLs: allow only these schemes.
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t
  // Any other explicit scheme (javascript:, data:, vbscript:, file:…) → unsafe.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return undefined
  // No scheme and not clearly relative (e.g. "example.com/x") → treat as a
  // schemeless relative path, which browsers resolve safely.
  return t
}

/**
 * Sanitise a URL that loads a FRAME (iframe src). Stricter than `safeHref`: a
 * frame is a document running beside the app, so only an absolute http(s) URL
 * is accepted — no relative path (that would frame the app itself), no
 * protocol-relative `//host`, no `javascript:`/`data:`/`blob:`. Returns
 * undefined for anything else so the caller renders no frame at all.
 * Previously the raw `src` went straight into the iframe.
 */
export function safeFrameSrc(src: unknown): string | undefined {
  if (typeof src !== 'string') return undefined
  const t = src.trim()
  if (!/^https?:\/\/[^/\s]/i.test(t)) return undefined
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined
  } catch {
    return undefined
  }
}

/**
 * A semantic colour washed into a ground: `color-mix(in srgb, <token> <pct>%, <ground>)`.
 *
 * ONE balanced helper instead of three hand-written copies. alert, badge and
 * chip each carried `color-mix(in srgb, ${token} N%, var(--pw-color-card)` —
 * the closing parenthesis missing. In a browser the declaration was dropped;
 * in server rendering the unclosed paren swallowed every declaration after it
 * in the same style attribute (padding, radius, block.style). The pack gate now checks parenthesis balance in style strings.
 */
export function tint(token: string, pct = 14, ground = 'var(--pw-color-card)'): string {
  return `color-mix(in srgb, ${token} ${pct}%, ${ground})`
}

/**
 * The edge of a form CONTROL (input, select, textarea, segmented track).
 *
 * `--pw-color-border` is a divider colour: across the six presets it measures
 * 1.16–1.72:1 against the ground, and for an input that edge is the only thing
 * showing where the field is (WCAG 1.4.11 asks 3:1). Controls read
 * `--pw-color-control-border` when a theme or app sets one; otherwise a mix
 * of the theme's muted text into its border — the muted text already clears
 * 4.5:1, so 80% of it clears 3:1 on every preset, in light and in the derived
 * dark mode (the pack gate measures this per theme).
 */
export const CONTROL_BORDER =
  'var(--pw-color-control-border, color-mix(in srgb, var(--pw-color-text-muted) 80%, var(--pw-color-border)))'

/**
 * Black or white, whichever reads on `ground` — decided by the ground's own
 * luminance, in CSS.
 *
 * A fill painted in a status token has no on-colour of its own in the theme:
 * the destructive button borrowed `--pw-color-text-on-primary`, which is
 * chosen for the BRAND, and falls under 3:1 wherever the brand is light.
 * Relative colour syntax
 * computes WCAG relative luminance Y from the linear channels and flips at
 * Y = 0.179, where white and black read equally (4.58:1): below it white,
 * above it black. Every ground therefore gets ≥ 4.58:1. A theme or app
 * that sets the matching `--pw-color-on-*` token still wins (`override`).
 */
export function inkOn(ground: string, override?: string): string {
  const y = '(0.2126 * r + 0.7152 * g + 0.0722 * b)'
  const ch = `calc((0.179 - ${y}) * 1000)`
  const ink = `color(from ${ground} srgb-linear ${ch} ${ch} ${ch})`
  return override ? `var(${override}, ${ink})` : ink
}

/**
 * The theme's motion tokens as transition/animation timings.
 *
 * Every block moved at `--pw-duration-fast` and nothing read `normal`, `slow`
 * or `easing-bounce` (12/12 renders), so "lively" and "calm" themes moved
 * alike and a motion-free theme was not motion-free. Hover and state changes
 * run at `normal`, entrances at `slow`, and anything that springs (a press, a
 * chevron, an entrance) on `easing-bounce` — a lively theme's spring. A theme
 * whose durations are 0 is animation-free by the same tokens, and the
 * runtime's reduced-motion gate still applies.
 */
export const MOTION = {
  fast: 'var(--pw-duration-fast, 150ms) var(--pw-easing, ease)',
  normal: 'var(--pw-duration-normal, 250ms) var(--pw-easing, ease)',
  slow: 'var(--pw-duration-slow, 400ms) var(--pw-easing, ease)',
  spring: 'var(--pw-duration-normal, 250ms) var(--pw-easing-bounce, var(--pw-easing, ease))',
  enter: 'var(--pw-duration-slow, 400ms) var(--pw-easing-bounce, var(--pw-easing, ease))',
} as const

/** `transition` for several properties on one timing: `transitionOf(['color', 'opacity'], MOTION.normal)`. */
export function transitionOf(properties: readonly string[], timing: string): string {
  return properties.map((p) => `${p} ${timing}`).join(', ')
}

/**
 * Convert CSS unit value to string
 */
export function cssUnit(value: CSSUnit): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return `${value}px`
  // Defense-in-depth: coerce bare numeric strings ("24" → "24px")
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
    return `${value.trim()}px`
  }
  return value
}

/**
 * Convert justify value to CSS
 */
export function justifyToCSS(justify: string | undefined): string | undefined {
  if (!justify) return undefined
  const map: Record<string, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  }
  return map[justify] ?? justify
}

/**
 * Convert align value to CSS
 */
export function alignToCSS(align: string | undefined): string | undefined {
  if (!align) return undefined
  const map: Record<string, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    stretch: 'stretch',
    baseline: 'baseline',
  }
  return map[align] ?? align
}

export interface GradientConfig {
  enabled?: boolean | undefined
  from?: string | undefined
  via?: string | undefined
  to?: string | undefined
  direction?: string | undefined
}

/**
 * Generate gradient CSS
 */
export function gradientCSS(gradient: GradientConfig | undefined): React.CSSProperties | undefined {
  if (!gradient?.enabled) return undefined
  const dirMap: Record<string, string> = {
    'to-r': 'to right',
    'to-l': 'to left',
    'to-t': 'to top',
    'to-b': 'to bottom',
    'to-tr': 'to top right',
    'to-tl': 'to top left',
    'to-br': 'to bottom right',
    'to-bl': 'to bottom left',
  }
  const dir = dirMap[gradient.direction ?? 'to-r'] ?? 'to right'
  const from = gradient.from ?? 'var(--pw-color-primary, #3b82f6)'
  const to = gradient.to ?? 'var(--pw-color-accent, #8b5cf6)'
  const stops = gradient.via ? `${from}, ${gradient.via}, ${to}` : `${from}, ${to}`
  return {
    background: `linear-gradient(${dir}, ${stops})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }
}

/**
 * SVG path data for Lucide-style icons (MIT licensed).
 * Each entry is an array of SVG child element strings rendered inside
 * a 24x24 viewBox with stroke="currentColor".
 */
// <ICON_PATHS-GENERATED> — written by scripts/build-icons.mjs from atoms/icons/icons.json; do not edit by hand
export const ICON_PATHS: Record<string, readonly string[]> = {
  'arrow-down': [
    "<path d=\"M12 5v14\"/>",
    "<path d=\"m19 12-7 7-7-7\"/>",
  ],
  'arrow-left': [
    "<path d=\"m12 19-7-7 7-7\"/>",
    "<path d=\"M19 12H5\"/>",
  ],
  'arrow-right': [
    "<path d=\"M5 12h14\"/>",
    "<path d=\"m12 5 7 7-7 7\"/>",
  ],
  'arrow-up': [
    "<path d=\"m5 12 7-7 7 7\"/>",
    "<path d=\"M12 19V5\"/>",
  ],
  'award': [
    "<path d=\"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526\"/>",
    "<circle cx=\"12\" cy=\"8\" r=\"6\"/>",
  ],
  'bar-chart': [
    "<path d=\"M5 21v-6\"/>",
    "<path d=\"M12 21V9\"/>",
    "<path d=\"M19 21V3\"/>",
  ],
  'bell': [
    "<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/>",
    "<path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/>",
  ],
  'book': [
    "<path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20\"/>",
  ],
  'bookmark': [
    "<path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\"/>",
  ],
  'briefcase': [
    "<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"/>",
    "<rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\"/>",
  ],
  'building': [
    "<path d=\"M12 10h.01\"/>",
    "<path d=\"M12 14h.01\"/>",
    "<path d=\"M12 6h.01\"/>",
    "<path d=\"M16 10h.01\"/>",
    "<path d=\"M16 14h.01\"/>",
    "<path d=\"M16 6h.01\"/>",
    "<path d=\"M8 10h.01\"/>",
    "<path d=\"M8 14h.01\"/>",
    "<path d=\"M8 6h.01\"/>",
    "<path d=\"M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3\"/>",
    "<rect x=\"4\" y=\"2\" width=\"16\" height=\"20\" rx=\"2\"/>",
  ],
  'cake': [
    "<path d=\"M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8\"/>",
    "<path d=\"M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1\"/>",
    "<path d=\"M2 21h20\"/>",
    "<path d=\"M7 8v3\"/>",
    "<path d=\"M12 8v3\"/>",
    "<path d=\"M17 8v3\"/>",
    "<path d=\"M7 4h.01\"/>",
    "<path d=\"M12 4h.01\"/>",
    "<path d=\"M17 4h.01\"/>",
  ],
  'calendar': [
    "<path d=\"M8 2v4\"/>",
    "<path d=\"M16 2v4\"/>",
    "<rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/>",
    "<path d=\"M3 10h18\"/>",
  ],
  'check': [
    "<path d=\"M20 6 9 17l-5-5\"/>",
  ],
  'check-circle': [
    "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
    "<path d=\"m9 12 2 2 4-4\"/>",
  ],
  'chevron-down': [
    "<path d=\"m6 9 6 6 6-6\"/>",
  ],
  'chevron-left': [
    "<path d=\"m15 18-6-6 6-6\"/>",
  ],
  'chevron-right': [
    "<path d=\"m9 18 6-6-6-6\"/>",
  ],
  'chevron-up': [
    "<path d=\"m18 15-6-6-6 6\"/>",
  ],
  'circle': [
    "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
  ],
  'clipboard': [
    "<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\"/>",
    "<path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/>",
  ],
  'clock': [
    "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
    "<path d=\"M12 6v6l4 2\"/>",
  ],
  'cloud': [
    "<path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\"/>",
  ],
  'code': [
    "<path d=\"m16 18 6-6-6-6\"/>",
    "<path d=\"m8 6-6 6 6 6\"/>",
  ],
  'coffee': [
    "<path d=\"M10 2v2\"/>",
    "<path d=\"M14 2v2\"/>",
    "<path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\"/>",
    "<path d=\"M6 2v2\"/>",
  ],
  'cpu': [
    "<path d=\"M12 20v2\"/>",
    "<path d=\"M12 2v2\"/>",
    "<path d=\"M17 20v2\"/>",
    "<path d=\"M17 2v2\"/>",
    "<path d=\"M2 12h2\"/>",
    "<path d=\"M2 17h2\"/>",
    "<path d=\"M2 7h2\"/>",
    "<path d=\"M20 12h2\"/>",
    "<path d=\"M20 17h2\"/>",
    "<path d=\"M20 7h2\"/>",
    "<path d=\"M7 20v2\"/>",
    "<path d=\"M7 2v2\"/>",
    "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/>",
    "<rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"/>",
  ],
  'credit-card': [
    "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\"/>",
    "<path d=\"M2 10h20\"/>",
  ],
  'database': [
    "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/>",
    "<path d=\"M3 5V19A9 3 0 0 0 21 19V5\"/>",
    "<path d=\"M3 12A9 3 0 0 0 21 12\"/>",
  ],
  'dollar-sign': [
    "<line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"22\"/>",
    "<path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"/>",
  ],
  'download': [
    "<path d=\"M12 15V3\"/>",
    "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>",
    "<path d=\"m7 10 5 5 5-5\"/>",
  ],
  'edit': [
    "<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/>",
    "<path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\"/>",
  ],
  'eye': [
    "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/>",
    "<circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  ],
  'facebook': [
    "<path d=\"M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z\"/>",
  ],
  'factory': [
    "<path d=\"M12 16h.01\"/>",
    "<path d=\"M16 16h.01\"/>",
    "<path d=\"M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z\"/>",
    "<path d=\"M8 16h.01\"/>",
  ],
  'file-check': [
    "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/>",
    "<path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/>",
    "<path d=\"m9 15 2 2 4-4\"/>",
  ],
  'file-text': [
    "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/>",
    "<path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/>",
    "<path d=\"M10 9H8\"/>",
    "<path d=\"M16 13H8\"/>",
    "<path d=\"M16 17H8\"/>",
  ],
  'flask': [
    "<path d=\"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2\"/>",
    "<path d=\"M6.453 15h11.094\"/>",
    "<path d=\"M8.5 2h7\"/>",
  ],
  'folder': [
    "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>",
  ],
  'gift': [
    "<path d=\"M12 7v14\"/>",
    "<path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\"/>",
    "<path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\"/>",
    "<rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\"/>",
  ],
  'github': [
    "<path d=\"M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22\"/>",
  ],
  'globe': [
    "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
    "<path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/>",
    "<path d=\"M2 12h20\"/>",
  ],
  'graduation-cap': [
    "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"/>",
    "<path d=\"M22 10v6\"/>",
    "<path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"/>",
  ],
  'grid': [
    "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>",
    "<path d=\"M3 9h18\"/>",
    "<path d=\"M3 15h18\"/>",
    "<path d=\"M9 3v18\"/>",
    "<path d=\"M15 3v18\"/>",
  ],
  'heart': [
    "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\"/>",
  ],
  'help-circle': [
    "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
    "<path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/>",
    "<path d=\"M12 17h.01\"/>",
  ],
  'history': [
    "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/>",
    "<path d=\"M3 3v5h5\"/>",
    "<path d=\"M12 7v5l4 2\"/>",
  ],
  'home': [
    "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/>",
    "<path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
  ],
  'image': [
    "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/>",
    "<circle cx=\"9\" cy=\"9\" r=\"2\"/>",
    "<path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>",
  ],
  'instagram': [
    "<rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"5\" ry=\"5\"/>",
    "<path d=\"M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z\"/>",
    "<line x1=\"17.5\" y1=\"6.5\" x2=\"17.51\" y2=\"6.5\"/>",
  ],
  'key': [
    "<path d=\"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4\"/>",
    "<path d=\"m21 2-9.6 9.6\"/>",
    "<circle cx=\"7.5\" cy=\"15.5\" r=\"5.5\"/>",
  ],
  'layers': [
    "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/>",
    "<path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/>",
    "<path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>",
  ],
  'layout-dashboard': [
    "<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/>",
    "<rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/>",
    "<rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/>",
    "<rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>",
  ],
  'life-buoy': [
    "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
    "<path d=\"m4.93 4.93 4.24 4.24\"/>",
    "<path d=\"m14.83 9.17 4.24-4.24\"/>",
    "<path d=\"m14.83 14.83 4.24 4.24\"/>",
    "<path d=\"m9.17 14.83-4.24 4.24\"/>",
    "<circle cx=\"12\" cy=\"12\" r=\"4\"/>",
  ],
  'link': [
    "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/>",
    "<path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
  ],
  'linkedin': [
    "<path d=\"M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z\"/>",
    "<rect x=\"2\" y=\"9\" width=\"4\" height=\"12\"/>",
    "<circle cx=\"4\" cy=\"4\" r=\"2\"/>",
  ],
  'lock': [
    "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/>",
    "<path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
  ],
  'log-in': [
    "<path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4\"/>",
    "<path d=\"m10 17 5-5-5-5\"/>",
    "<path d=\"M15 12H3\"/>",
  ],
  'mail': [
    "<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/>",
    "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>",
  ],
  'map-pin': [
    "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/>",
    "<circle cx=\"12\" cy=\"10\" r=\"3\"/>",
  ],
  'megaphone': [
    "<path d=\"m3 11 18-5v12L3 14v-3z\"/>",
    "<path d=\"M11.6 16.8a3 3 0 1 1-5.8-1.6\"/>",
  ],
  'menu': [
    "<path d=\"M4 5h16\"/>",
    "<path d=\"M4 12h16\"/>",
    "<path d=\"M4 19h16\"/>",
  ],
  'message-circle': [
    "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/>",
  ],
  'message-square': [
    "<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\"/>",
  ],
  'minus': [
    "<path d=\"M5 12h14\"/>",
  ],
  'monitor': [
    "<rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\"/>",
    "<line x1=\"8\" x2=\"16\" y1=\"21\" y2=\"21\"/>",
    "<line x1=\"12\" x2=\"12\" y1=\"17\" y2=\"21\"/>",
  ],
  'more-horizontal': [
    "<circle cx=\"12\" cy=\"12\" r=\"1\"/>",
    "<circle cx=\"19\" cy=\"12\" r=\"1\"/>",
    "<circle cx=\"5\" cy=\"12\" r=\"1\"/>",
  ],
  'more-vertical': [
    "<circle cx=\"12\" cy=\"12\" r=\"1\"/>",
    "<circle cx=\"12\" cy=\"5\" r=\"1\"/>",
    "<circle cx=\"12\" cy=\"19\" r=\"1\"/>",
  ],
  'newspaper': [
    "<path d=\"M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2\"/>",
    "<path d=\"M18 14h-8\"/>",
    "<path d=\"M15 18h-5\"/>",
    "<path d=\"M10 6h8v4h-8V6Z\"/>",
  ],
  'package': [
    "<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\"/>",
    "<path d=\"M12 22V12\"/>",
    "<path d=\"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7\"/>",
    "<path d=\"m7.5 4.27 9 5.15\"/>",
  ],
  'palette': [
    "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/>",
    "<circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/>",
    "<circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/>",
    "<circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/>",
    "<circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
  ],
  'phone': [
    "<path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"/>",
  ],
  'play': [
    "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>",
  ],
  'plug': [
    "<path d=\"M12 22v-5\"/>",
    "<path d=\"M15 8V2\"/>",
    "<path d=\"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z\"/>",
    "<path d=\"M9 8V2\"/>",
  ],
  'plus': [
    "<path d=\"M5 12h14\"/>",
    "<path d=\"M12 5v14\"/>",
  ],
  'refresh-cw': [
    "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/>",
    "<path d=\"M21 3v5h-5\"/>",
    "<path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/>",
    "<path d=\"M8 16H3v5\"/>",
  ],
  'scale': [
    "<path d=\"m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1\"/>",
    "<path d=\"m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1\"/>",
    "<path d=\"M7 21h10\"/>",
    "<path d=\"M12 3v18\"/>",
    "<path d=\"M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2\"/>",
  ],
  'search': [
    "<path d=\"m21 21-4.34-4.34\"/>",
    "<circle cx=\"11\" cy=\"11\" r=\"8\"/>",
  ],
  'send': [
    "<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\"/>",
    "<path d=\"m21.854 2.147-10.94 10.939\"/>",
  ],
  'server': [
    "<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\"/>",
    "<rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\"/>",
    "<path d=\"M6 6h.01\"/>",
    "<path d=\"M6 18h.01\"/>",
  ],
  'settings': [
    "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/>",
    "<circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  ],
  'shield': [
    "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/>",
  ],
  'shield-check': [
    "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/>",
    "<path d=\"m9 12 2 2 4-4\"/>",
  ],
  'shopping-bag': [
    "<path d=\"M16 10a4 4 0 0 1-8 0\"/>",
    "<path d=\"M3.103 6.034h17.794\"/>",
    "<path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\"/>",
  ],
  'shopping-cart': [
    "<circle cx=\"8\" cy=\"21\" r=\"1\"/>",
    "<circle cx=\"19\" cy=\"21\" r=\"1\"/>",
    "<path d=\"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12\"/>",
  ],
  'sparkles': [
    "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/>",
    "<path d=\"M20 2v4\"/>",
    "<path d=\"M22 4h-4\"/>",
    "<circle cx=\"4\" cy=\"20\" r=\"2\"/>",
  ],
  'star': [
    "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>",
  ],
  'sun': [
    "<circle cx=\"12\" cy=\"12\" r=\"4\"/>",
    "<path d=\"M12 2v2\"/>",
    "<path d=\"M12 20v2\"/>",
    "<path d=\"m4.93 4.93 1.41 1.41\"/>",
    "<path d=\"m17.66 17.66 1.41 1.41\"/>",
    "<path d=\"M2 12h2\"/>",
    "<path d=\"M20 12h2\"/>",
    "<path d=\"m6.34 17.66-1.41 1.41\"/>",
    "<path d=\"m19.07 4.93-1.41 1.41\"/>",
  ],
  'thumbs-up': [
    "<path d=\"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z\"/>",
    "<path d=\"M7 10v12\"/>",
  ],
  'trash': [
    "<path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/>",
    "<path d=\"M3 6h18\"/>",
    "<path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
  ],
  'trending-up': [
    "<path d=\"M16 7h6v6\"/>",
    "<path d=\"m22 7-8.5 8.5-5-5L2 17\"/>",
  ],
  'twitter': [
    "<path d=\"M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z\"/>",
  ],
  'user': [
    "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/>",
    "<circle cx=\"12\" cy=\"7\" r=\"4\"/>",
  ],
  'users': [
    "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/>",
    "<path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/>",
    "<path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/>",
    "<circle cx=\"9\" cy=\"7\" r=\"4\"/>",
  ],
  'utensils': [
    "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\"/>",
    "<path d=\"M7 2v20\"/>",
    "<path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/>",
  ],
  'x': [
    "<path d=\"M18 6 6 18\"/>",
    "<path d=\"m6 6 12 12\"/>",
  ],
  'youtube': [
    "<path d=\"M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z\"/>",
    "<polygon points=\"9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02\"/>",
  ],
  'zap': [
    "<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"/>",
  ],
}
// </ICON_PATHS-GENERATED>


// ============================================================
// THEME-INDEPENDENT SCRIM COLOURS
// ============================================================

/**
 * These constants are the catalogue's only legitimate colours that do NOT use
 * a theme token — and the reason fits in one sentence: the surface they sit on
 * is the media itself, not the theme.
 *
 * A lightbox scrim is black in every theme; a video letterbox is dark in every
 * theme; text over the gradient on a photo is white in every theme. Using
 * `--pw-color-text` there would make the theme WRONG, not right: in a light
 * theme, black text disappears on a black scrim.
 *
 * Why here instead of scattered literals:
 *   1. The same intent had been written with different values — a `#000`
 *      letterbox in one block and `#111827` in another.
 *   2. A `#111827` sprinkled in block source cannot be told apart from a real
 *      theme leak. Named, the intent is readable and auditable — the
 *      theme gate treats this file as the single declared
 *      exception instead of keeping a list of line numbers.
 */

/** Media frame — the area visible when the image/video ratio does not fill it. */
export const MEDIA_LETTERBOX = '#111827'

/** Scrim layer — media controls, modal backdrop. */
export const OVERLAY_SCRIM = 'rgba(0,0,0,0.5)'

/** Full-screen lightbox scrim — fully suppresses the page beneath. */
export const OVERLAY_SCRIM_STRONG = 'rgba(0,0,0,0.85)'

/** Caption gradient along the bottom edge of a photo — darkens the image. */
export const MEDIA_CAPTION_GRADIENT =
  'linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.25) 45%, transparent 70%)'

/** Text/icon colour over ANY of the scrims above. */
export const ON_OVERLAY_SCRIM = '#ffffff'
