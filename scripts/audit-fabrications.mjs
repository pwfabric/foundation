#!/usr/bin/env node
/**
 * FABRICATION AUDIT — every reference, in every pack audited, to something
 * that does not exist.
 *
 * WHY. A reference to a missing pattern, block or theme fails silently: nothing
 * resolves it, nothing reports it, and a broken example can live unnoticed in a
 * mechanism nobody happens to exercise.
 *
 * The audited classes: a pattern's `usesBlocks` naming a block that does not
 * exist, `composesWith` pointing at a dead pattern, a body using an undeclared
 * slot, and a declared slot the body never uses.
 *
 * Usage: node audit-fabrications.mjs [--json]
 * Exit: 1 if there are findings.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { familyDir } from './lib/pack-layout.mjs'

// A catalogue repository may keep a `pack-map.json` one level up listing every
// pack; without one (this pack's own repository) the audit covers this pack
// alone.
const PACK_MAP = join(resolve(import.meta.dirname, '..', '..'), 'pack-map.json')
const PACKS = existsSync(PACK_MAP)
  ? Object.keys(JSON.parse(readFileSync(PACK_MAP, 'utf8')).packs)
  : [basename(resolve(import.meta.dirname, '..'))]
/**
 * With a pack map it audits ALL packs at once: a pack being consistent on its
 * own is not enough; the whole catalogue must resolve in one universe. A pack
 * missing from disk is skipped silently — better not to measure than to blame
 * wrongly in a single-pack checkout.
 */
const ROOT = resolve(import.meta.dirname, '..', '..')
const findings = []
const add = (pack, file, msg) => findings.push({ pack, file, msg })

// ── universes ───────────────────────────────────────────────────────────────
/** each pack's blocks: both the BARE name and `category.name` — both are valid references. */
const blocks = new Map() // name -> pack
const patterns = new Map() // name -> pack
const themes = new Set()

function walkBlocks(pack) {
  const dir = familyDir(join(ROOT, pack), 'blocks')
  if (!existsSync(dir)) return
  for (const cat of readdirSync(dir)) {
    const catDir = join(dir, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const name of readdirSync(catDir)) {
      const man = join(catDir, name, 'manifest.json')
      if (!existsSync(man)) continue
      const m = JSON.parse(readFileSync(man, 'utf8'))
      const bare = m.name ?? name
      blocks.set(bare, pack)
      if (m.id) blocks.set(m.id, pack)
      // An overlay pack lands prefixed (`@<pack>.prose`); the bare name resolves too.
      blocks.set(`@${pack}.${bare}`, pack)
    }
  }
}

function collectPatterns(pack) {
  const dir = familyDir(join(ROOT, pack), 'patterns')
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -5)
    patterns.set(name, pack)
    out.push({ file: f, name, json: JSON.parse(readFileSync(join(dir, f), 'utf8')) })
  }
  return out
}

function collectThemes(pack) {
  const dir = familyDir(join(ROOT, pack), 'appearance')
  if (!existsSync(dir)) return
  for (const d of readdirSync(dir)) if (d.startsWith('theme-')) themes.add(d)
}

for (const p of PACKS) {
  walkBlocks(p)
  collectThemes(p)
}
const byPack = new Map(PACKS.map((p) => [p, collectPatterns(p)]))

// ── checks ──────────────────────────────────────────────────────────────────
const TOKEN = /\{\{([A-Z0-9_]+)\}\}/g

for (const [pack, list] of byPack) {
  for (const { file, name, json } of list) {
    const where = `${pack}/atoms/patterns/${file}`

    // 1. usesBlocks — does the declared block exist, and does the body actually use it
    /**
     * ONLY `children` — as the compiler and the assembly service do.
     *
     * Walking the whole tree mistakes `props.type` for a block: an `input`'s
     * `props.type: "email"`, a gradient's `"radial"`. That produced false
     * findings — `email`, `password`, `date`, `conic`, `radial`. The block tree
     * is woven through `children`; everything else is a prop.
     */
    const bodyTypes = new Set()
    ;(function walk(nodes) {
      for (const n of nodes ?? []) {
        if (!n || typeof n !== 'object') continue
        if (typeof n.type === 'string') bodyTypes.add(n.type)
        if (Array.isArray(n.children)) walk(n.children)
      }
    })(Array.isArray(json.snippet) ? json.snippet : [json.snippet])

    for (const b of json.usesBlocks ?? []) {
      if (!blocks.has(b)) add(pack, where, `usesBlocks "${b}": no such block`)
      else if (!bodyTypes.has(b)) add(pack, where, `usesBlocks declares "${b}" but the body does not use it`)
    }
    for (const t of bodyTypes) {
      if (!blocks.has(t)) add(pack, where, `body uses block "${t}" but no such block exists`)
      else if (!(json.usesBlocks ?? []).includes(t)) add(pack, where, `body uses "${t}" but usesBlocks does not declare it`)
    }

    // 2. placeholders ↔ body tokens
    const declared = new Set(Object.keys(json.placeholders ?? {}).map((k) => k.replace(/^\{\{|\}\}$/g, '')))
    const used = new Set()
    // The body is the snippet AND the pattern's wiring: the expander fills
    // dataSources, initialState, behaviors and formBindings from the same slots
    // and lifts them into the page (a list slot seeded into state is used there).
    const body = { snippet: json.snippet, dataSources: json.dataSources, initialState: json.initialState, behaviors: json.behaviors, formBindings: json.formBindings }
    for (const m of JSON.stringify(body).matchAll(TOKEN)) used.add(m[1])
    used.delete('ID')
    for (const u of used) if (!declared.has(u)) add(pack, where, `body uses {{${u}}} but placeholders does NOT declare it — nobody can fill it`)
    /**
     * TWO SLOTS ARE NOT TOKENS, and treating them as tokens produces false findings.
     *
     * `{{ID}}` is the caller's id; the expander derives it itself and it appears
     * in the body as `{{ID}}-foo`, never on its own.
     *
     * The MAIN SLOT (`MAIN` in shells, `BANDS` in weaves) is NOT a token: it is
     * the body node with `children: []`, and `findSlot` finds it by shape —
     * "the first node whose `children` is an EMPTY ARRAY". `placeholders` lists
     * it only to DOCUMENT it. The right check: does that empty slot really exist.
     */
    const MAIN_SLOTS = new Set(['ID', 'MAIN', 'BANDS'])
    for (const d of declared) if (!MAIN_SLOTS.has(d) && !used.has(d)) add(pack, where, `placeholders declares "${d}" but the body never uses it`)

    // If a main slot is declared, the body MUST contain an empty-children node —
    // otherwise the caller's `children` have nowhere to land and drop silently.
    const declaresMain = declared.has('MAIN') || declared.has('BANDS')
    if (declaresMain) {
      let slot = null
      ;(function find(n) {
        if (slot || !n || typeof n !== 'object') return
        if (Array.isArray(n.children) && n.children.length === 0) { slot = n.id ?? '(no id)'; return }
        for (const c of n.children ?? []) find(c)
      })(json.snippet)
      if (!slot) add(pack, where, `main slot declared but the body has NO empty-children node — the caller's children have nowhere to land`)
    }

    // 3. knowledge.composesWith — does the target exist
    for (const c of json.knowledge?.composesWith ?? []) {
      const ref = String(c).trim()
      if (!ref || ref.includes(' ') || ref.includes('/')) continue // free text / platform capability
      if (!patterns.has(ref) && !blocks.has(ref)) add(pack, where, `composesWith "${ref}" — neither a pattern nor a block`)
    }

    // 4. theme references — ONLY the VALUE of a `theme` field. "theme-aware" in
    // free text is an adjective, not a reference.
    ;(function themes_(n) {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(themes_)
      if (typeof n.theme === 'string' && n.theme.startsWith('theme-') && !themes.has(n.theme))
        add(pack, where, `theme "${n.theme}": no such theme`)
      for (const v of Object.values(n)) if (v && typeof v === 'object') themes_(v)
    })(json)
  }
}

// 5. composesWith in block manifests
for (const pack of PACKS) {
  const dir = familyDir(join(ROOT, pack), 'blocks')
  if (!existsSync(dir)) continue
  for (const cat of readdirSync(dir)) {
    const catDir = join(dir, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const nm of readdirSync(catDir)) {
      const man = join(catDir, nm, 'manifest.json')
      if (!existsSync(man)) continue
      const m = JSON.parse(readFileSync(man, 'utf8'))
      const where = `${pack}/atoms/blocks/${cat}/${nm}/manifest.json`
      for (const c of m.knowledge?.composesWith ?? []) {
        const ref = String(c).trim()
        if (!ref || ref.includes(' ') || ref.includes('/')) continue
        if (!patterns.has(ref) && !blocks.has(ref)) add(pack, where, `composesWith "${ref}" — neither a pattern nor a block`)
      }
      if (typeof m.theme === 'string' && m.theme.startsWith('theme-') && !themes.has(m.theme))
        add(pack, where, `theme "${m.theme}": no such theme`)
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2))
} else {
  console.log(`universe: ${blocks.size} block names · ${patterns.size} patterns · ${themes.size} themes`)
  const byFile = new Map()
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, [])
    byFile.get(f.file).push(f.msg)
  }
  for (const [file, msgs] of [...byFile].sort()) {
    console.log(`\n${file}`)
    for (const m of msgs) console.log(`  x ${m}`)
  }
  console.log(`\n${findings.length} findings · ${byFile.size} files`)
}
process.exit(findings.length ? 1 : 0)
