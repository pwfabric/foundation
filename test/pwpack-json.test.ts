/**
 * pwpack.json identity: the derived keys must agree with package.json, and the
 * two keys pwpack.json owns — `formatVersion` (MAJOR.MINOR) and
 * `engines.pwfabric` (a semver range) — are accepted, carried in a fixed key
 * order, and checked for shape. Anything else stays a difference the gate
 * reports (scripts/check-pwpack-json.mjs).
 */
import { describe, it, expect } from 'vitest'
import { isDeepStrictEqual } from 'node:util'
// @ts-expect-error — a zero-dependency .mjs with no type declarations
import { pwpackJsonFor, declaredOf, declaredProblems, isSemverRange } from '../scripts/lib/pwpack-json.mjs'

const pkg = { name: '@pwpack/foundation', version: '4.2.0', pwpack: { requires: { packs: [] } } }

describe('pwpackJsonFor — derived identity plus declared keys', () => {
  it('derives id, version, requires and licence when nothing is declared', () => {
    expect(pwpackJsonFor(pkg)).toEqual({
      id: '@pwpack/foundation',
      version: '4.2.0',
      requires: [],
      license: { fork: true, redistribute: true },
    })
  })

  it('carries formatVersion and engines in a fixed key order', () => {
    const out = pwpackJsonFor(pkg, { formatVersion: '1.0', engines: { pwfabric: '>=4.17 <5' } })
    expect(Object.keys(out)).toEqual(['id', 'version', 'formatVersion', 'engines', 'requires', 'license'])
    expect(out.formatVersion).toBe('1.0')
    expect(out.engines).toEqual({ pwfabric: '>=4.17 <5' })
  })

  it('declaredOf picks exactly the two declared keys from a pwpack.json record', () => {
    const have = { id: 'x', version: '1.0.0', formatVersion: '1.0', engines: { pwfabric: '^4' }, extra: 1 }
    expect(declaredOf(have)).toEqual({ formatVersion: '1.0', engines: { pwfabric: '^4' } })
    expect(declaredOf({})).toEqual({})
  })

  it('an unknown key still disagrees with the derived record', () => {
    const have = { ...pwpackJsonFor(pkg), surprise: true }
    const want = pwpackJsonFor(pkg, declaredOf(have))
    const diffs = Object.keys({ ...want, ...have }).filter((k) => !isDeepStrictEqual(want[k], have[k]))
    expect(diffs).toEqual(['surprise'])
  })
})

describe('declaredProblems — shape of formatVersion and engines', () => {
  it('accepts the foundation declaration', () => {
    expect(declaredProblems({ formatVersion: '1.0', engines: { pwfabric: '>=4.17 <5' } })).toEqual([])
  })

  it('accepts a record that declares neither key', () => {
    expect(declaredProblems({ id: 'x' })).toEqual([])
  })

  it.each(['1', '1.0.0', 'v1.0', '01.0', '1.x', 1.0])('rejects formatVersion %j', (formatVersion) => {
    expect(declaredProblems({ formatVersion })).toHaveLength(1)
  })

  it('rejects engines that are not an object, name an unknown engine, or omit pwfabric', () => {
    expect(declaredProblems({ engines: '>=4' })).toHaveLength(1)
    expect(declaredProblems({ engines: { pwfabric: '>=4', node: '22' } })).toHaveLength(1)
    expect(declaredProblems({ engines: {} })).toHaveLength(1)
  })

  it('rejects an engines.pwfabric that is not a semver range', () => {
    expect(declaredProblems({ engines: { pwfabric: 'latest' } })).toHaveLength(1)
  })
})

describe('isSemverRange', () => {
  it.each(['>=4.17 <5', '^4.17.0', '~4.17', '4.x', '*', '4.17.0 - 4.20.0', '>= 4.17 < 5', '^4 || ^5', '4.17.0-rc.1'])(
    'accepts %j',
    (r) => expect(isSemverRange(r)).toBe(true)
  )
  it.each(['', 'latest', '>=4.17 <', '4.17.0.1', '^^4', '>=4 ||', 'four'])('rejects %j', (r) =>
    expect(isSemverRange(r)).toBe(false)
  )
})
