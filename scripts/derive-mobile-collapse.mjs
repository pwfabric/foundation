#!/usr/bin/env node
/**
 * DERIVES each shell's `mobileCollapse` text from the chrome × body tables.
 *
 * WHY. Every shell's `mobileCollapse` text is TWO SENTENCES — one for the
 * chrome, one for the body — and the sentences repeat verbatim: the texts are
 * the cartesian product of 5 chrome rules × 4 body rules. Written by hand, a
 * value derivable from two axes gets copied, and nobody notices when the
 * copies start to drift.
 *
 * So the text is generated from the tables. `--check` finds drift and fails;
 * `check-integrity` calls it.
 *
 * Usage: node scripts/derive-mobile-collapse.mjs [--check]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// `--pack <dir>`: shells can live in more than one pack (foundation:
// topbar/bottombar/none; others: rail/composite). Without the flag: this script's own pack.
const packAt = process.argv.indexOf('--pack')
const PATTERNS = packAt > 0 && process.argv[packAt + 1]
  ? join(process.argv[packAt + 1], 'atoms', 'patterns')
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'atoms', 'patterns')
const CHECK = process.argv.includes('--check')

/** What the chrome does on a narrow screen — 5 rules. */
export const CHROME_COLLAPSE = {
  topbar: 'The top bar collapses into a drawer; links are listed in one column.',
  rail: 'The rail does not thin: it TURNS INTO a bottom bar or a collapsible drawer.',
  bottombar: 'Already the narrow-screen form — on desktop the bar stays put, the destinations spread.',
  composite: 'The rail becomes a bottom bar, the top bar stays — two navigations never stack on one screen.',
  none: 'Already the mobile form; desktop is its widening. The column widens, the structure does not change.',
}

/** What the body does on a narrow screen — 4 rules. */
export const BODY_COLLAPSE = {
  flow: 'Bands are already single-column; order is kept.',
  grid: 'The grid collapses to one column and tile priority is declared SEPARATELY — grid order does not give it.',
  dense: 'The context row collapses into the heading; tables turn into card rows instead of scrolling horizontally.',
  split:
    'Two panes collapse to one: a list page, and selecting NAVIGATES to a detail page — the URL already carries the selection, so Back returns to the list.',
}

const drift = []
let written = 0
let checked = 0

for (const f of (existsSync(PATTERNS) ? readdirSync(PATTERNS) : []).filter((x) => x.startsWith('shell-') && x.endsWith('.json'))) {
  const path = join(PATTERNS, f)
  const atom = JSON.parse(readFileSync(path, 'utf8'))
  const chrome = CHROME_COLLAPSE[atom.chrome]
  const body = BODY_COLLAPSE[atom.body]
  if (!chrome) throw new Error(`${f}: unknown chrome '${atom.chrome}'`)
  if (!body) throw new Error(`${f}: unknown body '${atom.body}'`)
  const derived = `${chrome} ${body}`
  checked++
  if (atom.mobileCollapse === derived) continue
  if (CHECK) {
    drift.push(`${f}\n      in file: ${atom.mobileCollapse ?? '—'}\n      derived: ${derived}`)
  } else {
    atom.mobileCollapse = derived
    writeFileSync(path, JSON.stringify(atom, null, 2) + '\n')
    written++
  }
}

if (CHECK && drift.length) {
  console.error(`\nmobileCollapse has DRIFTED from the derivation (${drift.length}/${checked}):`)
  for (const d of drift) console.error('    x ' + d)
  console.error('\n  Fix: node scripts/derive-mobile-collapse.mjs')
  console.error('  (If the text is wrong, fix the TABLE, not the text — a wrong table makes every derivation wrong.)\n')
  process.exit(1)
}

console.log(
  CHECK
    ? `mobileCollapse: ${checked} shells, all match the derivation`
    : `mobileCollapse: ${written}/${checked} patterns updated`
)
