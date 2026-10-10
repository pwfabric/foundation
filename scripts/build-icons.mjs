#!/usr/bin/env node
/**
 * Icon generator — writes the TypeScript form of the canonical
 * `atoms/icons/icons.json`:
 *
 * the ICON_PATHS section of `atoms/lib/_shared-utils.ts` (between the markers)
 * — the blocks' inline-SVG fallback. The source of truth is icons.json, not
 * the TS; adding an icon = a line in icons.json + running this script.
 * NOTE: this section is embedded in every bundle; the goal is to shrink it to
 * a critical-fallback set as icons move to CSS mask tokens.
 *
 * Usage: node scripts/build-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const canon = JSON.parse(readFileSync(join(ROOT, 'atoms/icons/icons.json'), 'utf8')).icons

// The marker text must match the line in _shared-utils.ts verbatim.
const START = '// <ICON_PATHS-GENERATED> — written by scripts/build-icons.mjs from atoms/icons/icons.json; do not edit by hand'
const END = '// </ICON_PATHS-GENERATED>'

const body = Object.entries(canon)
  .map(([name, paths]) => `  '${name}': [\n${paths.map((p) => `    ${JSON.stringify(p)},`).join('\n')}\n  ],`)
  .join('\n')

const generated = `${START}
export const ICON_PATHS: Record<string, readonly string[]> = {
${body}
}
${END}`

const utilPath = join(ROOT, 'atoms/lib/_shared-utils.ts')
const src = readFileSync(utilPath, 'utf8')
const si = src.indexOf(START)
const ei = src.indexOf(END)
if (si < 0 || ei < 0) {
  console.error('Markers not found — _shared-utils.ts must carry the ICON_PATHS-GENERATED markers first')
  process.exit(1)
}
const next = src.slice(0, si) + generated + src.slice(ei + END.length)
if (next !== src) {
  writeFileSync(utilPath, next)
  console.log(`ICON_PATHS regenerated: ${Object.keys(canon).length} icons`)
} else {
  console.log(`ICON_PATHS up to date (${Object.keys(canon).length} icons)`)
}
