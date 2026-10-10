// PACK IDENTITY — `pwpack.json`.
//
// The canonical pack folder carries its identity in `pwpack.json`. This repo
// also needs `package.json` (the pnpm workspace, scripts, peer dependencies),
// so the two coexist and most of `pwpack.json` is DERIVED from `package.json`:
// one function, used by the gate (`check-pwpack-json.mjs`) and by any tool that
// writes the file, so they cannot disagree about what "in step" means.
//
// First-party defaults: `fork: true, redistribute: true`.
// `requires` is the pack-level dependency list (`requires.packs`) with full
// pack ids — the same form as `id`.
//
// DECLARED KEYS. Two keys have no counterpart in `package.json` and are owned
// by `pwpack.json` itself: `formatVersion` (the pwpack folder format the pack
// is written against, MAJOR.MINOR) and `engines.pwfabric` (the PWFabric engine
// versions the pack runs on, a semver range). The generator carries them over
// from the file on disk, and the gate validates their shape instead of
// comparing them. Both are optional; a pack that declares neither is unchanged.

export const FIRST_PARTY_LICENSE = Object.freeze({ fork: true, redistribute: true })

/** Keys `pwpack.json` owns (not derived from package.json). */
export const DECLARED_KEYS = Object.freeze(['formatVersion', 'engines'])

const fullId = (id) => (id.startsWith('@pwpack/') ? id : `@pwpack/${id}`)

/** The declared keys present in an existing pwpack.json record, in canonical order. */
export function declaredOf(existing) {
  const out = {}
  for (const k of DECLARED_KEYS) if (existing && existing[k] !== undefined) out[k] = existing[k]
  return out
}

/**
 * package.json record (+ the declared keys to carry) → the pwpack.json object.
 * Key order is part of the file: id, version, formatVersion, engines, requires, license.
 */
export function pwpackJsonFor(pkg, declared = {}) {
  const packs = pkg?.pwpack?.requires?.packs ?? []
  return {
    id: pkg.name,
    version: pkg.version,
    ...(declared.formatVersion !== undefined ? { formatVersion: declared.formatVersion } : {}),
    ...(declared.engines !== undefined ? { engines: declared.engines } : {}),
    requires: packs.map((p) => ({ id: fullId(p.id), range: p.range })),
    license: { ...FIRST_PARTY_LICENSE },
  }
}

// ── shape of the declared keys ───────────────────────────────────────────────

const FORMAT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/

// One semver comparator: an optional operator and a version that may be
// partial (`4`, `4.17`) or use x-ranges (`4.x`, `4.17.*`), with an optional
// prerelease/build tail. `*` and `x` alone match everything.
const NUM = String.raw`(?:0|[1-9]\d*)`
const PART = String.raw`(?:${NUM}|x|X|\*)`
const PRE = String.raw`(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`
const VERSION = String.raw`v?${PART}(?:\.${PART}(?:\.${PART}${PRE})?)?`
const COMPARATOR = new RegExp(String.raw`^(?:<=|>=|<|>|=|~|\^)?${VERSION}$`)
const HYPHEN = new RegExp(String.raw`^${VERSION}\s+-\s+${VERSION}$`)

/** True when `range` is a semver range (comparator sets joined by `||`). */
export function isSemverRange(range) {
  if (typeof range !== 'string' || range.trim() === '') return false
  return range.split('||').every((set) => {
    const s = set.trim()
    if (s === '') return false
    if (HYPHEN.test(s)) return true
    // Join an operator to its version when written with a space (`>= 4.17`).
    const parts = s.replace(/(<=|>=|<|>|=|~|\^)\s+/g, '$1').split(/\s+/)
    return parts.every((c) => COMPARATOR.test(c))
  })
}

/** Problems with the declared keys of a pwpack.json record; [] when it is sound. */
export function declaredProblems(have) {
  const problems = []
  if (have.formatVersion !== undefined) {
    if (typeof have.formatVersion !== 'string' || !FORMAT_VERSION.test(have.formatVersion)) {
      problems.push(`formatVersion ${JSON.stringify(have.formatVersion)} is not MAJOR.MINOR (e.g. "1.0")`)
    }
  }
  if (have.engines !== undefined) {
    const e = have.engines
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      problems.push(`engines ${JSON.stringify(e)} is not an object`)
    } else {
      for (const k of Object.keys(e)) {
        if (k !== 'pwfabric') problems.push(`engines.${k} is not a known engine (only "pwfabric")`)
      }
      if (e.pwfabric === undefined) problems.push('engines declares no "pwfabric" range')
      else if (!isSemverRange(e.pwfabric)) {
        problems.push(`engines.pwfabric ${JSON.stringify(e.pwfabric)} is not a semver range (e.g. ">=4.17 <5")`)
      }
    }
  }
  return problems
}
