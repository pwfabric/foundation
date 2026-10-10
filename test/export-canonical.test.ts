// @vitest-environment node
//
// `export-tgz --canonical` writes the engine's canonical archive: the folder's
// pack content at the archive root (pwpack.json, LICENSE, NOTICE, README.md,
// atoms/), no package.json, no stripped prefix — and an archive whose content
// hash is the folder's own. The default (legacy) wire is untouched by the flag.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { hashPack, packContent, readFolder, readPwpack } from '@pwfabric/pack'

const ROOT = resolve(__dirname, '..')
const EXPORT = join(ROOT, 'scripts', 'export-tgz.mjs')
const out = mkdtempSync(join(tmpdir(), 'export-canonical-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

const run = (...args: string[]) => execFileSync(process.execPath, [EXPORT, '--out', out, ...args], { encoding: 'utf8' })

describe('export-tgz --canonical', () => {
  run('--canonical')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
  const file = join(out, `foundation-${pkg.version}.pwpack`)

  it('names the archive <name>-<version>.pwpack', () => {
    expect(readdirSync(out)).toContain(`foundation-${pkg.version}.pwpack`)
  })

  it("hashes exactly like the folder it was read from", async () => {
    const archive = await readPwpack(new Uint8Array(readFileSync(file)))
    const folder = await readFolder(ROOT)
    expect(hashPack(archive)).toBe(hashPack(folder))
    expect(hashPack(archive)).toBe(hashPack(packContent(folder)))
  })

  it('carries the canonical roots (the showcase app included) and no package.json', async () => {
    const archive = await readPwpack(new Uint8Array(readFileSync(file)))
    const roots = new Set([...archive.files.keys()].map((p) => p.split('/')[0]))
    expect([...roots].sort()).toEqual(['LICENSE', 'NOTICE', 'README.md', 'app', 'atoms', 'media', 'pwpack.json'])
    expect(archive.files.has('atoms/icons/icons.json')).toBe(true)
  })

  it('is deterministic: the same folder writes the same bytes', () => {
    const first = readFileSync(file)
    run('--canonical')
    expect(readFileSync(file).equals(first)).toBe(true)
  })

  it('leaves the default export on the legacy wire', () => {
    run()
    expect(readdirSync(out)).toContain(`foundation-${pkg.version}.tgz`)
  })
})
