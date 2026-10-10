#!/usr/bin/env node
/**
 * pwpack.json ↔ package.json — the two identity files of a pack must agree.
 *
 * WHY. `pwpack.json` is the pack's identity; this repo also keeps
 * `package.json` for the pnpm workspace. Two files that both say "version"
 * drift the first time someone bumps one of them by hand — and an archive whose
 * `pwpack.json` says 1.0.0 while its `package.json` says 1.0.1 is two packs at
 * once. This gate fails on any difference in id, version,
 * requires or licence, on any key it does not know, and on a missing file.
 *
 * The declared keys (`formatVersion`, `engines`) belong to `pwpack.json` alone:
 * they are checked for shape (MAJOR.MINOR; a semver range for
 * `engines.pwfabric`), not compared.
 *
 * Fix: make `pwpack.json` say what `package.json` says (id, version, requires,
 * licence); the failure lists each key that differs.
 *
 * Usage: node check-pwpack-json.mjs [--pack <dir>]   (default: this script's pack)
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { pwpackJsonFor, declaredOf, declaredProblems } from './lib/pwpack-json.mjs'

const i = process.argv.indexOf('--pack')
const ROOT = resolve(i > -1 && process.argv[i + 1] ? process.argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'))

const pkgPath = join(ROOT, 'package.json')
const idPath = join(ROOT, 'pwpack.json')
if (!existsSync(idPath)) {
  console.log(`FAIL — ${idPath} is missing: write it from package.json (id, version, requires, licence)`)
  process.exit(1)
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const have = JSON.parse(readFileSync(idPath, 'utf8'))
const want = pwpackJsonFor(pkg, declaredOf(have))

const problems = declaredProblems(have)
const diffs = Object.keys({ ...want, ...have }).filter((k) => !isDeepStrictEqual(want[k], have[k]))
if (diffs.length || problems.length) {
  console.log(`FAIL — pwpack.json is not in step with package.json (${pkg.name}):`)
  for (const k of diffs) console.log(`  x ${k}: pwpack.json ${JSON.stringify(have[k])} ≠ package.json-derived ${JSON.stringify(want[k])}`)
  for (const p of problems) console.log(`  x ${p}`)
  console.log('  fix: make pwpack.json agree with package.json for the keys above')
  process.exit(1)
}
console.log(`pwpack.json: ${have.id}@${have.version} agrees with package.json`)
