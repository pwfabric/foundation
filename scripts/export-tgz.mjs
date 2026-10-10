#!/usr/bin/env node
/**
 * Packages this pack's atom SOURCE (`atoms/`) into `dist/<name>-<version>.tgz`.
 *
 * WHY THIS EXISTS. A pack that can only be produced by hand cannot be
 * reproduced, and a version number nobody can build is a claim, not an
 * artifact.
 *
 * WHAT THIS PRODUCES — and what it does NOT. This writes the raw source tgz a
 * publishing pipeline consumes: paths relative to the pack root, no
 * `package/` prefix, and NO root manifest.json. The pipeline derives the
 * pack manifest and its atoms from the per-atom manifest.json files and
 * compiles the blocks. So this is the INPUT to publishing, never the published
 * thing, and this script must not invent the manifest.
 *
 * DETERMINISTIC. Every file is stamped mtime 0 and the entries are sorted, so
 * identical source produces a byte-identical tgz. That is what makes the printed
 * digest meaningful: if it did not change, the pack did not change, whatever the
 * version number says.
 *
 * Zero dependencies. `node scripts/export-tgz.mjs` is the whole contract.
 *
 * `--canonical` writes the engine's canonical `.pwpack` instead (see below); that
 * path loads `@pwfabric/pack` and is not yet the default.
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createTgz } from './lib/tar.mjs'
import { atomsDir, libDir, appDir } from './lib/pack-layout.mjs'

/**
 * WHICH PACK IS BEING PACKAGED. `--pack <dir>` names it; with no flag it is this
 * script's own pack. Packs built on foundation can borrow this packager rather
 * than each carrying a copy of it, and such a pack cannot be found from this
 * file's path.
 */
const packArg = (() => {
  const i = process.argv.indexOf('--pack')
  return i === -1 || i + 1 >= process.argv.length ? null : process.argv[i + 1]
})()
const ROOT = resolve(packArg ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
/**
 * THE CANONICAL FOLDER: families live under `atoms/`, shared code
 * under `atoms/lib/`, a demo site's pages under `app/surfaces/`, identity in
 * `pwpack.json`.
 *
 * THE RAW TGZ KEEPS THE OLDER LAYOUT. A reader of the raw tgz classifies
 * families at its ROOT, so this strips `atoms/`:
 * `atoms/blocks/x/y/component.tsx` ships as `blocks/x/y/component.tsx`.
 * `atoms/lib/*` ships as `lib/*` (a bundler hands every file to esbuild as a
 * companion, so a block's `../../../lib/_shared-utils` resolves),
 * `app/surfaces/*` ships as `surfaces/*`, and `pwpack.json` is added at the
 * root. `--canonical` writes the folder as it is instead.
 */
const ATOMS = atomsDir(ROOT)
const LIB = libDir(ROOT)
const APP = appDir(ROOT)
/** `--out <dir>`: where the tgz goes (default `<pack>/dist`). */
const outArg = (() => {
  const i = process.argv.indexOf('--out')
  return i === -1 || i + 1 >= process.argv.length ? null : resolve(process.argv[i + 1])
})()

/**
 * The atom parts, matching what consumers of the pack actually accept.
 *
 * `surfaces/` ships too: a showcase receipt is an atom of kind `surface`
 * (`surfaces/<name>.receipt.json`). A shipped atom that nothing installs is a
 * decision a host can still make; an atom that never leaves the repo is not.
 */
const ATOM_PARTS = [
  'blocks',
  'capabilities',
  'appearance',
  'patterns',
  'surfaces',
  'icons',
  'connectors',
  'providers',
  'auth',
]

const SKIP_NAMES = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'Exports'])
// Source-only noise that carries no atom meaning. Tests belong to the SOURCE,
// not to the product: they prove the pack in this repo, and a `.test.ts` that
// reaches an installation is dead weight whose imports (another pack's bridge,
// a fixture) do not even exist on the other side.
const SKIP_EXT = ['.log', '.tsbuildinfo', '.test.ts', '.test.tsx']

function walk(dir, into) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_NAMES.has(entry)) continue
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) walk(abs, into)
    else if (!SKIP_EXT.some((e) => entry.endsWith(e))) into.push(abs)
  }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/**
 * `--canonical`: write the engine's canonical archive instead of the legacy
 * wire, through `@pwfabric/pack` (readFolder → packContent →
 * writePwpack). The archive is the pack content of the folder exactly as it
 * sits on disk: `pwpack.json`, LICENSE / NOTICE / README.md at the root and
 * `app/`, `atoms/`, `media/` as they are — no prefix stripped, no
 * package.json, a deterministic tar. Its content hash is the folder's
 * `hashPack`, and this checks that by reading the written archive back.
 *
 * NOT THE DEFAULT, because the legacy wire still has readers the canonical one
 * would change: the platform's build-publish takes the listing's display name,
 * description and `requires` (tokens and packs) from the package.json this
 * script writes, and a pack's `app/surfaces/` pages ship today as `surfaces/`
 * atoms where the canonical layout keeps them as an undeclared app. Flip the
 * default when those readers take pwpack.json alone.
 *
 * The import is dynamic so the default path stays dependency-free: a pack that
 * declares no dependencies is built in CI without an install.
 */
if (process.argv.includes('--canonical')) {
  const { readFolder, packContent, writePwpack, readPwpack, hashPack, validatePack } = await import(
    '@pwfabric/pack'
  )
  const content = packContent(await readFolder(ROOT))
  const validation = validatePack(content)
  for (const i of validation.issues.filter((x) => x.severity === 'warning')) {
    console.warn(`warn      : ${i.code}${i.path ? ` ${i.path}` : ''} — ${i.message}`)
  }
  const errors = validation.issues.filter((x) => x.severity === 'error')
  if (errors.length > 0) {
    for (const i of errors) console.error(`FAIL — ${i.code}${i.path ? ` ${i.path}` : ''}: ${i.message}`)
    process.exit(1)
  }
  const bytes = await writePwpack(content)
  const hash = hashPack(content)
  const reread = hashPack(await readPwpack(bytes))
  if (reread !== hash) {
    console.error(`FAIL — the archive hashes ${reread}, the folder ${hash}`)
    process.exit(1)
  }
  const outDir = outArg ?? join(ROOT, 'dist')
  mkdirSync(outDir, { recursive: true })
  const slug = pkg.name.replace(/^@[^/]+\//, '').replace(/\//g, '-')
  const outPath = join(outDir, `${slug}-${pkg.version}.pwpack`)
  writeFileSync(outPath, bytes)
  console.log(`pack      : ${pkg.name}@${pkg.version}`)
  console.log(`files     : ${content.files.size}`)
  console.log(`atoms     : ${validation.atoms.length}`)
  console.log(`artifact  : ${outArg ? outPath : `dist/${slug}-${pkg.version}.pwpack`} (${(bytes.length / 1024).toFixed(1)} KB)`)
  console.log(`content   : ${hash}`)
  console.log(`sha256    : ${createHash('sha256').update(bytes).digest('hex')} (the archive bytes, not the identity)`)
  process.exit(0)
}

/** [absolute file, wire path] — the wire path is what the tgz carries. */
const files = []
const present = []
const take = (dir, wirePrefix, label) => {
  if (!existsSync(dir)) return
  const found = []
  walk(dir, found)
  for (const abs of found) files.push([abs, `${wirePrefix}/${relative(dir, abs).split('\\').join('/')}`])
  present.push(`${label}:${found.length}`)
}
// Paths are relative to the PACK ROOT on the wire (`blocks/panel/card/component.tsx`):
// the source sits one level deeper under atoms/, so that prefix is stripped.
for (const part of ATOM_PARTS) take(join(ATOMS, part), part, part)
// A demo site's pages (`app/surfaces/`) ship where they shipped before the move.
take(join(APP, 'surfaces'), 'surfaces', 'app/surfaces')
const atomCount = files.length
take(LIB, 'lib', 'lib')

if (atomCount === 0) {
  console.error('FAIL — no atom source found under atoms/ (or app/surfaces/); nothing to package')
  process.exit(1)
}

const seen = new Set()
const entries = files
  .map(([abs, path]) => {
    if (seen.has(path)) {
      console.error(`FAIL — two files ship at ${path} (atoms/surfaces and app/surfaces overlap)`)
      process.exit(1)
    }
    seen.add(path)
    return { path, content: readFileSync(abs) }
  })
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

// Pack identity. Shipped verbatim; `check-pwpack-json` keeps it in
// step with package.json, which still travels below for today's readers.
if (existsSync(join(ROOT, 'pwpack.json'))) {
  entries.push({ path: 'pwpack.json', content: readFileSync(join(ROOT, 'pwpack.json')) })
}

// A pack that carries its own licence ships it: `LICENSE` and `NOTICE` at the
// pack root travel at the tgz root (foundation is Apache-2.0, and section 4 of
// that licence asks for both to go with every copy). A pack without them
// ships none — the repo-root LICENSE is never picked up.
for (const name of ['LICENSE', 'NOTICE']) {
  if (existsSync(join(ROOT, name))) entries.push({ path: name, content: readFileSync(join(ROOT, name)) })
}

// Identity only. Build tooling belongs to this workspace, not to the atom source
// the marketplace receives.
entries.push({
  path: 'package.json',
  content: Buffer.from(
    JSON.stringify(
      { name: pkg.name, version: pkg.version, ...(pkg.license ? { license: pkg.license } : {}), private: true, pwpack: pkg.pwpack },
      null,
      2
    ) + '\n',
    'utf8'
  ),
})

const tgz = createTgz(entries, { mtimeSeconds: 0 })
const digest = createHash('sha256').update(tgz).digest('hex')

const outDir = outArg ?? join(ROOT, 'dist')
mkdirSync(outDir, { recursive: true })
// `@pwfabric/foundation` → `foundation`. The scope once carried a vendor
// segment; it distinguished nothing, so the slug is the bare pack name.
const slug = pkg.name.replace(/^@[^/]+\//, '').replace(/\//g, '-')
const outPath = join(outDir, `${slug}-${pkg.version}.tgz`)
writeFileSync(outPath, tgz)

console.log(`pack      : ${pkg.name}@${pkg.version}`)
console.log(`parts     : ${present.join(' · ')}`)
console.log(`files     : ${entries.length}`)
console.log(`artifact  : ${outArg ? outPath : `dist/${slug}-${pkg.version}.tgz`} (${(tgz.length / 1024).toFixed(1)} KB)`)
console.log(`sha256    : ${digest}`)
console.log('')
console.log('This is the RAW SOURCE tgz — the INPUT to publishing, not the published pack.')
console.log('The server derives the real manifest and bundles atoms during build-publish.')
