/**
 * A small CSS colour evaluator for contrast tests.
 *
 * It resolves the colour expressions the blocks write — `var()` with
 * fallbacks, `color-mix(in srgb, …)`, `transparent`, hex, and the relative
 * colour `color(from X srgb-linear …)` that `inkOn()` builds — against the
 * token set the cascade emits for a theme (`surfaceThemeToCSS`), in light and
 * in the dark variant the cascade derives (`deriveDarkTheme`). What it measures
 * is therefore what a browser paints for those tokens, not a restatement of
 * the block's intent.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveDarkTheme, surfaceThemeToCSS } from '@pwfabric/contracts'

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const APPEARANCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'atoms', 'appearance')

/** Every preset, each as its light and its derived dark token set. */
export function presetTokenSets(): Array<{ preset: string; mode: 'light' | 'dark'; vars: Record<string, string> }> {
  const out: Array<{ preset: string; mode: 'light' | 'dark'; vars: Record<string, string> }> = []
  for (const dir of readdirSync(APPEARANCE).filter((d) => d.startsWith('theme-')).sort()) {
    const theme = JSON.parse(readFileSync(join(APPEARANCE, dir, 'manifest.json'), 'utf8')).theme
    const preset = dir.replace(/^theme-/, '')
    out.push({ preset, mode: 'light', vars: surfaceThemeToCSS(theme) })
    out.push({ preset, mode: 'dark', vars: surfaceThemeToCSS(deriveDarkTheme(theme)) })
  }
  return out
}

/** Split on commas (or spaces) at the top level of an argument list. */
function splitTop(s: string, sep: ',' | ' '): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))) {
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** The inside of `name( … )` when `s` is exactly that call. */
function callArgs(s: string, name: string): string | null {
  const t = s.trim()
  if (!t.startsWith(`${name}(`) || !t.endsWith(')')) return null
  let depth = 0
  for (let i = name.length; i < t.length; i++) {
    if (t[i] === '(') depth++
    if (t[i] === ')') depth--
    if (depth === 0 && i !== t.length - 1) return null
  }
  return t.slice(name.length + 1, -1)
}

/** Substitute every `var(--x, fallback)` from `vars`, recursively. */
export function resolveVars(expr: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() cycle in ${expr}`)
  const i = expr.indexOf('var(')
  if (i < 0) return expr
  let d = 0
  let j = i + 3
  for (; j < expr.length; j++) {
    if (expr[j] === '(') d++
    if (expr[j] === ')') {
      d--
      if (d === 0) break
    }
  }
  const inner = expr.slice(i + 4, j)
  const [name, ...rest] = splitTop(inner, ',')
  const fallback = rest.join(', ')
  const value = vars[name!.trim()] ?? (fallback ? fallback : undefined)
  if (value === undefined) throw new Error(`unresolved ${name} in ${expr}`)
  const replaced = expr.slice(0, i) + resolveVars(value, vars, depth + 1) + expr.slice(j + 1)
  return resolveVars(replaced, vars, depth + 1)
}

const toLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLin = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Evaluate a resolved colour expression (no var() left). */
export function evalColor(expr: string): Rgba {
  const t = expr.trim()
  if (t === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (/^#[0-9a-f]{3,8}$/i.test(t)) {
    let h = t.slice(1)
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    const n = (k: number): number => parseInt(h.slice(k, k + 2), 16) / 255
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 }
  }
  if (t === 'white') return { r: 1, g: 1, b: 1, a: 1 }
  if (t === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  const mix = callArgs(t, 'color-mix')
  if (mix !== null) {
    const [space, a, b] = splitTop(mix, ',')
    if (space !== 'in srgb') throw new Error(`unsupported mix space ${space}`)
    const part = (s: string): { c: Rgba; p?: number } => {
      const bits = splitTop(s, ' ')
      const last = bits[bits.length - 1]!
      if (/%$/.test(last)) return { c: evalColor(bits.slice(0, -1).join(' ')), p: parseFloat(last) / 100 }
      return { c: evalColor(s) }
    }
    const A = part(a!)
    const B = part(b!)
    const pa = A.p ?? (B.p !== undefined ? 1 - B.p : 0.5)
    const pb = B.p ?? 1 - pa
    // Premultiplied interpolation, as the spec does it.
    const alpha = A.c.a * pa + B.c.a * pb
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const ch = (k: 'r' | 'g' | 'b'): number => (A.c[k] * A.c.a * pa + B.c[k] * B.c.a * pb) / alpha
    return { r: ch('r'), g: ch('g'), b: ch('b'), a: alpha }
  }
  const rel = callArgs(t, 'color')
  if (rel !== null && rel.startsWith('from ')) {
    const bits = splitTop(rel.slice(5), ' ')
    const base = evalColor(bits[0]!)
    if (bits[1] !== 'srgb-linear') throw new Error(`unsupported relative space ${bits[1]}`)
    const env = { r: toLin(base.r), g: toLin(base.g), b: toLin(base.b) }
    const run = (e: string): number =>
      clamp01(Function('r', 'g', 'b', `return ${e.replace(/calc\(/g, '(')}`)(env.r, env.g, env.b) as number)
    return { r: fromLin(run(bits[2]!)), g: fromLin(run(bits[3]!)), b: fromLin(run(bits[4]!)), a: base.a }
  }
  throw new Error(`cannot evaluate colour ${t}`)
}

/** Paint `c` over an opaque `ground`. */
export function over(c: Rgba, ground: Rgba): Rgba {
  return {
    r: c.r * c.a + ground.r * (1 - c.a),
    g: c.g * c.a + ground.g * (1 - c.a),
    b: c.b * c.a + ground.b * (1 - c.a),
    a: 1,
  }
}

const luminance = (c: Rgba): number => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b)

/** WCAG contrast ratio of two opaque colours. */
export function contrast(a: Rgba, b: Rgba): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Resolve and paint a CSS colour expression over `ground`. */
export function paint(expr: string, vars: Record<string, string>, ground: Rgba): Rgba {
  return over(evalColor(resolveVars(expr, vars)), ground)
}

/** The colour of an `inset 0 0 0 Npx <colour>` edge. */
export function edgeColor(boxShadow: string): string {
  const m = boxShadow.match(/^inset 0 0 0 \d+px (.+)$/)
  if (!m) throw new Error(`not an inset edge: ${boxShadow}`)
  return m[1]!
}
