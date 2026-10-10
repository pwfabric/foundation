#!/usr/bin/env node
/**
 * Points this pack's @pwfabric dependencies at an engine checkout instead of
 * the npm registry.
 *
 * WHY. The pack is built and tested against the engine packages it names in
 * package.json. Until a version is on npm — and whenever the engine's main
 * branch is the thing under test — CI checks the engine out beside this pack,
 * builds it and links it in with this script. It writes `pnpm.overrides` into
 * package.json (`link:` to each engine package); nothing it writes is meant
 * to be committed.
 *
 * Usage: node scripts/use-engine.mjs <path to the engine checkout>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const engine = process.argv[2]
if (!engine) {
  console.error('usage: node scripts/use-engine.mjs <path to the engine checkout>')
  process.exit(2)
}

const file = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(file, 'utf8'))
const names = new Set(
  [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]
    .flatMap((deps) => Object.keys(deps ?? {}))
    .filter((name) => name.startsWith('@pwfabric/')),
)

const overrides = {}
for (const name of [...names].sort()) {
  const dir = join(resolve(engine), 'packages', name.slice('@pwfabric/'.length))
  if (!existsSync(join(dir, 'package.json'))) {
    console.error(`use-engine: ${name} is not in ${engine}/packages`)
    process.exit(1)
  }
  overrides[name] = `link:${relative(ROOT, dir).split('\\').join('/')}`
}

pkg.pnpm = { ...pkg.pnpm, overrides: { ...pkg.pnpm?.overrides, ...overrides } }
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
for (const [name, target] of Object.entries(overrides)) console.log(`use-engine: ${name} → ${target}`)
