#!/usr/bin/env node
/**
 * Catalogue + pattern integrity check.
 *
 * WHY THIS EXISTS. A pack of JSON atoms has nothing for build, typecheck or
 * lint to look at: a change that adds a block, changes a block contract and
 * writes a dozen patterns can pass all three while shipping defects only a
 * reader of the atoms themselves would catch.
 *
 * WHAT IT DOES NOT DO — on purpose. It does not render. Render-side validation
 * belongs to the consumer that assembles apps from the published pack; a
 * second, weaker copy of it here would add nothing. What a render check cannot
 * do is catch source-side drift BEFORE publish — and a pack can reach its users
 * by routes no render check ever sees.
 *
 * The defect class this catches is the silent one: an unknown block type is
 * skipped at render, an unknown prop is ignored, and a wrong `usesBlocks` misleads
 * a human or the composer without ever throwing. Nothing downstream reports it.
 *
 * Zero dependencies — `node scripts/check-integrity.mjs` is the whole contract,
 * matching this package's no-node_modules posture.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomsDir, libDir, familyDir, surfacesDir, surfaceDirs } from './lib/pack-layout.mjs'
import {
  itemScopeFindings,
  formFieldFindings,
  styleParenFindings,
  inlineOutlineFindings,
} from './lib/source-rules.mjs'
import { isWired, wiringFindings, wiringSlotTokens, slotDeclarations, WIRING_FIELDS } from './lib/wiring-rules.mjs'

/**
 * A block's role WHEN AN APP IS COMPOSED. A composer uses it to decide whether
 * to describe a block in FULL or as a one-line index entry; so this list
 * decides which blocks a model can really use well.
 */
export const BLOCK_ROLES = ["structure", "data", "content", "widget"]

/**
 * WHICH PACK IS BEING CHECKED — and against what.
 *
 * This script was written when the repo held one pack, so it pointed at its own
 * parent directory and that was the whole answer. The permanent domain split
 * makes that wrong in two directions at once: a domain pack lives in a SIBLING
 * directory, and it carries patterns with NO blocks of its own — every pattern
 * it owns places blocks that stayed on the floor.
 *
 * So the check now takes two inputs, both DECLARED by the pack itself in its
 * `scripts.test`, never guessed here:
 *   --pack <dir>              the pack under test; its patterns and surfaces
 *   --resolve-against <dirs>  extra pack roots whose blocks may be referenced
 *
 * Only `--pack`'s own patterns/surfaces/blocks are JUDGED. The resolve-against
 * roots are read for RESOLUTION only — checking base twice would report base's
 * problems against a domain pack's name.
 *
 * With no flags it behaves exactly as before (this script's own pack), so every
 * existing caller — including tools that invoke it by path — is unmoved.
 */
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 || i + 1 >= argv.length ? null : argv[i + 1]
}
const SELF = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(flag('--pack') ?? SELF)
// The canonical pack folder: families under atoms/, shared code under
// atoms/lib/, a demo site's pages under app/surfaces/ (see lib/pack-layout.mjs).
const ATOMS = atomsDir(ROOT)
const LIB = libDir(ROOT)
const BLOCKS = join(ATOMS, 'blocks')
const PATTERNS = join(ATOMS, 'patterns')
const SURFACES = surfacesDir(ROOT)
/** Borrowed pack roots — read for RESOLUTION only, never judged. */
const BORROWED = (flag('--resolve-against') ?? '')
  .split(',')
  .filter(Boolean)
  .map((p) => resolve(p))
/**
 * DEPENDENT pack roots — read only for the "block nobody places" coverage
 * rule, never judged.
 *
 * Once packs are layered, the pattern that places a block often lives in
 * ANOTHER pack: a base block may be shown only by a pattern or surface in a
 * pack built on top of it. Looking only at its own patterns, the gate would
 * reject such a block as "placed by nothing" — yet it is placed, one layer up.
 * The root list is declared by the pack in its `scripts.test` (every pack
 * that carries this one in its closure); it is never guessed here.
 */
const SHOWN_BY = (flag('--shown-by') ?? '')
  .split(',')
  .filter(Boolean)
  .map((p) => resolve(p))
/** The directories an atom family is read from: borrowed roots first, the pack itself last. */
const partRoots = (part) =>
  [...BORROWED.map((r) => familyDir(r, part)), familyDir(ROOT, part)].filter((d) => existsSync(d))
const BLOCK_ROOTS = partRoots('blocks')
const PATTERN_ROOTS = partRoots('patterns')

const problems = []
const warnings = []
const fail = (where, msg) => problems.push(`${where}: ${msg}`)
/**
 * Reported, never fatal. Two things belong here and nothing else should join
 * them casually: a rule whose SOURCE is known-incomplete, and a pre-existing
 * systemic gap too large to fix in the change that discovered it. Both are worse
 * as blockers than as notes — a check that cannot pass teaches people to merge
 * past it, which is exactly the habit this pack just spent a day undoing.
 */
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/')

/**
 * THE SOURCE RULES AND WHO THEY BIND.
 *
 * Four rules (scripts/lib/source-rules.mjs): `{{item.` needs a `repeat`
 * ancestor, a form field in a form needs its own name, a CSS function string
 * balances its parentheses, and no component writes `outline: 'none'`.
 *
 * Foundation is bound by all four. A pack built on it may still carry
 * violations it fixes in its own time, so for any other pack the rules REPORT
 * instead of failing — unless the pack is named in `--new-rule-packs a,b` (a
 * catalogue lists the packs that already pass) or the run passes
 * `--strict-new-rules` (which binds any pack; the positive control uses it).
 *
 * The pattern WIRING rules (lib/wiring-rules.mjs) do not ride this list: they
 * bind every pack directly, and only the "neither wired nor layoutOnly" report
 * waits for `--strict-wiring` (see WIRING_STRICT).
 */
const NEW_RULE_PACKS = new Set([
  'foundation',
  ...(flag('--new-rule-packs') ?? '').split(',').filter(Boolean),
])
const PACK_ID = basename(ROOT)
const NEW_RULES_BIND = NEW_RULE_PACKS.has(PACK_ID) || argv.includes('--strict-new-rules')
const ruleFinding = (where, msg) =>
  NEW_RULES_BIND
    ? fail(where, msg)
    : warn(where, `${msg} [reported, not blocking: "${PACK_ID}" is not yet in NEW_RULE_PACKS (check-integrity.mjs)]`)

/**
 * THE WIRING RULE'S TWO MODES.
 *
 * "A pattern either carries wiring or declares `layoutOnly: true`" is the
 * target gate rule — but a pack may still hold wireable patterns that are not
 * wired yet, and failing them would fail the whole pack for work still to be
 * done. So the "neither" case is REPORTED, with the count printed on every
 * run, until every remaining pattern is wired or marked layout-only; then
 * `--strict-wiring` becomes the default and the report becomes a failure. The flag is also the positive control: run it and the unwired
 * patterns must show up as failures.
 *
 * Every other wiring rule — the contradiction, an unseeded literal stateKey, a
 * behavior or form binding writing an unseeded key, a malformed formBindings
 * or typed slot — fails in every pack.
 */
const WIRING_STRICT = argv.includes('--strict-wiring')

/** A component's source against the two source rules. */
function checkComponentSource(path) {
  const src = readFileSync(path, 'utf8')
  for (const f of styleParenFindings(src)) {
    ruleFinding(
      rel(path),
      `line ${f.line}: CSS string "${f.text.slice(0, 70)}" does not balance its parentheses — ` +
        `an unclosed color-mix( drops the declaration in a browser and swallows the rest of the style attribute in server rendering (use tint() from _shared-utils)`
    )
  }
  for (const f of inlineOutlineFindings(src)) {
    ruleFinding(
      rel(path),
      `line ${f.line}: inline ${f.text} — it overrides the runtime's zero-specificity focus ring, so keyboard focus disappears; remove it (draw a :focus-within ring if the box needs one)`
    )
  }
}

/** Pattern/surface trees against the two tree rules. */
function checkTreeRules(file, tree, path) {
  for (const f of itemScopeFindings(tree, path)) {
    ruleFinding(
      file,
      `${f.path} reads {{item.…}} but no ancestor carries a block-level "repeat" — without it the template renders ONCE, outside any item (one ghost row). Write "repeat": "{{source}}" on the repeater`
    )
  }
  const isField = (type) => catalogue.get(type)?.traits?.has('form-field') ?? false
  for (const f of formFieldFindings(tree, isField, path)) {
    ruleFinding(
      file,
      f.kind === 'unnamed'
        ? `${f.path} is a form field inside a form with no "name" — its value never reaches the submitted record`
        : `${f.path} reuses the name "${f.name}" inside one form — two fields fighting over a name overwrite each other (only a checkbox group may share one)`
    )
  }
}

// ── the catalogue ────────────────────────────────────────────────────────────
/** type -> { id, file, props:Set, schema:Map<name,jsonSchema>, canHaveChildren } */
const catalogue = new Map()
const seenIds = new Map()

/**
 * Every block type any pattern or surface actually places. Filled by `walk`,
 * read once at the end by the coverage gate. See the gate itself for why.
 */
const COVERED = new Set()

/**
 * The icon canon. `icons/icons.json` is the single name→path source and its own
 * comment forbids invented names, but nothing here enforced that: a name outside
 * the canon renders an empty circle with NO error and NO warning — a real
 * Lucide name that is not in this pack's dictionary renders blank.
 */
const ICONS = (() => {
  // The canon lives in the base pack; patterns of a pack that borrows the base
  // are checked against it too. Reading only the pack's own `atoms/icons` would
  // leave the icon names of every pattern moved out of the base unchecked.
  const f = partRoots('icons').map((d) => join(d, 'icons.json')).find((x) => existsSync(x)) ?? join(ATOMS, 'icons', 'icons.json')
  if (!existsSync(f)) return null
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(f, 'utf8')).icons ?? {}))
  } catch {
    return null
  }
})()

/**
 * Blocks whose render root predates the data-block-type convention — older
 * blocks in a pack built on this one, named with `--grandfathered a/b,c/d`
 * (`<category>/<name>`). Foundation itself has none. A catalogue's list may
 * only SHRINK — see readCatalogue.
 */
const UNADDRESSABLE = new Set((flag('--grandfathered') ?? '').split(',').filter(Boolean))

function readCatalogue() {
  if (!BLOCK_ROOTS.length) {
    return fail('atoms/blocks', 'no block directory in this pack or its resolve-against roots')
  }
  for (const blocksDir of BLOCK_ROOTS) readCatalogueFrom(blocksDir, blocksDir === BLOCKS)
  // Shared component files (_shared-account-menu.tsx…, under atoms/lib/)
  // render inside blocks too, so the source rules read them as well.
  for (const dir of [BLOCKS, LIB]) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.tsx')) checkComponentSource(join(dir, f))
    }
  }
}

function readCatalogueFrom(BLOCKS, own) {
  for (const category of readdirSync(BLOCKS)) {
    const catDir = join(BLOCKS, category)
    if (!statSync(catDir).isDirectory()) continue
    for (const entry of readdirSync(catDir)) {
      const dir = join(catDir, entry)
      if (!statSync(dir).isDirectory()) continue

      const manifestPath = join(dir, 'manifest.json')
      const componentPath = join(dir, 'component.tsx')
      // Blocks are discovered by CONVENTION — there is no barrel file — so a
      // directory missing either half is invisible rather than broken.
      if (!existsSync(manifestPath)) { fail(rel(dir), 'no manifest.json'); continue }
      if (!existsSync(componentPath)) fail(rel(dir), 'no component.tsx')

      let m
      try {
        m = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch (e) {
        fail(rel(manifestPath), `unparseable — ${e.message}`)
        continue
      }

      const expectedId = `${category}.${entry}`
      if (m.id !== expectedId) {
        fail(rel(manifestPath), `id is "${m.id}" but its path says "${expectedId}"`)
      }
      if (m.category !== category) {
        fail(rel(manifestPath), `category is "${m.category}" but it lives under "${category}"`)
      }
      if (m.name !== entry) {
        fail(rel(manifestPath), `name is "${m.name}" but its directory is "${entry}"`)
      }
      /**
       * ROLE — the catalogue's second axis (category = identity, role = the job
       * this block does when an app is composed). It decides how a composer
       * spends its prompt budget: a role is described in full or as one index
       * line, and a block the model only sees as one line is a block it uses
       * badly.
       *
       * IT LIVES HERE, IN THE PACK, AND AS A TAG. A separate key would not be in
       * AtomFileManifestSchema, which is strict, so every build would report an
       * "unrecognized key" error and nothing would consume the value. And a
       * consumer that keeps its own by-name dictionary elsewhere drifts both
       * ways: real blocks go missing from it, silently demoted to one-liners,
       * and entries keep naming blocks that no longer
       * exist (footer, stat, timeline, every *-panel).
       *
       * One declaration, owned by the repo that owns the block, in a field the
       * contract allows.
       */
      const roles = (m.tags ?? []).filter((t) => String(t).startsWith('tier:'))
      const role = roles[0]?.slice('tier:'.length)
      if (roles.length !== 1 || !BLOCK_ROLES.includes(role)) {
        fail(
          rel(manifestPath),
          `tags must carry exactly one role — one of ${BLOCK_ROLES.map((r) => `tier:${r}`).join(' | ')} (found: ${roles.join(', ') || 'none'})`
        )
      }
      if ('tier' in m) {
        fail(rel(manifestPath), 'the "tier" key is not part of AtomFileManifestSchema — declare the role as a tag instead')
      }
      if (seenIds.has(m.id)) {
        fail(rel(manifestPath), `duplicate id "${m.id}" — also in ${seenIds.get(m.id)}`)
      } else {
        seenIds.set(m.id, rel(manifestPath))
      }

      // `knowledge.purpose` IS ONE LINE, AND EVERY CALL PAYS FOR IT.
      //
      // The composer prompt ships exactly four knowledge fields per block —
      // purpose, useCases, composesWith, antiPatterns — and it ships them for
      // ALL 100 blocks on EVERY call. The field's contract is "one line of
      // purpose": what the block is FOR, so the model can decide WHEN to reach
      // for it. It is not the place for the block's build spec — the composer
      // cannot change a block's internals, only place it and set its props.
      //
      // A typical purpose is a couple of dozen tokens. A generated atom tends
      // to be different: its author writes the component, then pours the spec
      // it just wrote into `purpose` — endpoints, HTTP verbs, request bodies,
      // colour names — and all of it ships on every composer call without
      // being actionable. Nothing measured the field's SHAPE, only its
      // presence, which is why this is a gate and not a cleanup.
      //
      // The spec is not deleted; `knowledge.implementation` holds it. That field
      // is not one of the four the prose generator reads, so it costs nothing
      // per call while staying with the atom it describes.
      // 600 chars ≈ 150 tokens. Set well ABOVE a normal purpose rather than at
      // it: the point is to stop a build spec landing here, not to police a
      // long sentence.
      const PURPOSE_MAX_CHARS = 600
      const purpose = m.knowledge?.purpose
      if (typeof purpose === 'string' && purpose.length > PURPOSE_MAX_CHARS) {
        fail(
          rel(manifestPath),
          `knowledge.purpose is ${purpose.length} chars (~${Math.ceil(purpose.length / 4)} tokens) — ` +
            `the field is one line of PURPOSE and ships on every composer call. ` +
            `Move build detail to "knowledge.implementation" (not sent to the model).`
        )
      }

      // Every block root should declare `data-block-type`. A root without it
      // is unaddressable — no id to target, and invisible to any tool walking
      // `[data-block-type]`.
      //
      // Older blocks in packs built on this one are GRANDFATHERED in
      // UNADDRESSABLE. The point of the check is to stop that list GROWING — a
      // block not on it must carry the attribute, and the list only shrinks.
      if (existsSync(componentPath) && !readFileSync(componentPath, 'utf8').includes('data-block-type')) {
        const where = `${category}/${entry}`
        if (UNADDRESSABLE.has(where)) warn(rel(componentPath), 'no data-block-type — grandfathered, remove from UNADDRESSABLE when fixed')
        else fail(rel(componentPath), 'root declares no data-block-type — the block renders but cannot be addressed')
      }

      // A BLOCK NEVER FETCHES. A block that reads its own data through the
      // connector bridge hides that data from the composer. Everything a
      // block draws must reach it through props —
      // a pattern's `dataSources` binds `{{<sourceId>}}` — so the composer
      // can see, change and re-point the data. The one family allowed to hold
      // a connection is `integration.*`: connection-bound APP VIEWS (calendar,
      // chat, files…) that mutate through the bridge and cannot be a pattern.
      // Comment lines are skipped so prose quoting the rule is not a hit.
      if (existsSync(componentPath) && category !== 'integration') {
        const hit = readFileSync(componentPath, 'utf8')
          .split(String.fromCharCode(10))
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => !/^\s*(\*|\/\/|\/\*)/.test(line))
          .map(({ line, i }) => ({ i, m: line.match(/useConnectorEngine\(|use[A-Z]\w*Bridge\(|\bfetch\(/) }))
          .find(({ m }) => m)
        if (hit) {
          fail(
            rel(componentPath),
            `line ${hit.i + 1} calls ${hit.m[0]}… — a block never fetches. Data reaches a block through a pattern's ` +
              `dataSources ({{sourceId}} binding); a block that must own a connection is an integration.* app view.`
          )
        }
      }

      const def = m.definition ?? {}
      const traits = new Set(def.traits ?? [])

      // A FORM FIELD IS BORN WITHOUT A NAME. A default name
      // ("field", "select", "message") meant two fields left unnamed collided in
      // the payload and the last one won, silently. The author names each field.
      if (own && traits.has('form-field') && def.defaultProps && typeof def.defaultProps.name === 'string') {
        ruleFinding(
          rel(manifestPath),
          `defaultProps.name is "${def.defaultProps.name}" — a form field is born unnamed; a default name makes two unnamed fields collide in the submitted record`
        )
      }
      if (own && existsSync(componentPath)) checkComponentSource(componentPath)

      // Keyed by the SHORT type, because that is what a surface/pattern writes.
      catalogue.set(m.name, {
        id: m.id,
        file: rel(manifestPath),
        props: new Set((def.props ?? []).map((p) => p.name)),
        schema: new Map((def.props ?? []).map((p) => [p.name, p.jsonSchema])),
        canHaveChildren: Boolean(def.canHaveChildren),
        traits,
        // Does this block belong to THIS pack, or was it borrowed for resolution
        // only? Coverage rules (orphans, shell accounting) judge own atoms only
        // — looking for a borrowed block's home is auditing the neighbour.
        own,
      })
    }
  }
}

// ── the patterns ─────────────────────────────────────────────────────────────
/**
 * Prop VALUES, not just prop names. Name-only validation passed a page whose
 * accordion omitted the required item `id` (producing duplicate DOM ids and a
 * dead aria-controls for every row) and whose map supplied `name`/`address`
 * where the block reads `label`/`lat`/`lng` — both silent at render.
 *
 * Deliberately shallow: array-item keys, enums, and the icon canon. It is not a
 * JSON Schema validator and should not become one — the shapes it checks are the
 * ones measured to fail quietly.
 */
/** `{{HEADING}}` and friends are template slots, never real values. */
const isPlaceholder = (v) => typeof v === 'string' && /^\{\{.*\}\}$/.test(v.trim())

function checkValue(file, path, block, prop, value) {
  if (isPlaceholder(value)) return
  const schema = block.schema.get(prop)

  // The icon canon — by convention any prop literally named `icon`.
  if (prop === 'icon' && ICONS && typeof value === 'string' && value && !ICONS.has(value)) {
    fail(file, `${path} = "${value}" is not in the icon canon (atoms/icons/icons.json) — it renders an empty circle`)
  }
  if (!schema) return

  // WARNING, not a failure. The manifest's jsonSchema under-describes unions:
  // control.icon's real zod is `z.union([iconSizeSchema, z.string(), z.number()])`
  // while its jsonSchema records only the enum, so `size: 32` is VALID and the
  // manifest is what is incomplete. Gating on a source known to be partial would
  // manufacture false reds — the mismatch is still worth printing.
  if (Array.isArray(schema.enum) && value !== undefined && !schema.enum.includes(value)) {
    warn(file, `${path} = ${JSON.stringify(value)} is outside [${schema.enum.join(', ')}] — check whether the manifest describes the full union`)
  }

  const items = schema.type === 'array' ? schema.items : undefined
  if (!items?.properties || !Array.isArray(value)) return

  const allowed = new Set(Object.keys(items.properties))
  const required = items.required ?? []
  value.forEach((element, i) => {
    if (!element || typeof element !== 'object') return
    for (const key of Object.keys(element)) {
      if (!allowed.has(key)) {
        fail(file, `${path}[${i}] sets "${key}", which ${block.id} does not read — expected one of [${[...allowed].join(', ')}]`)
      }
    }
    for (const key of required) {
      if (element[key] === undefined) {
        fail(file, `${path}[${i}] omits required "${key}"`)
      }
    }
  })
}

function walk(file, node, path, used) {
  if (!node || typeof node !== 'object') return
  const type = node.type
  if (!type) return fail(file, `${path} has no "type"`)
  used.add(type)
  COVERED.add(type)

  const block = catalogue.get(type)
  if (!block) return fail(file, `${path} uses unknown block type "${type}"`)

  for (const [prop, value] of Object.entries(node.props ?? {})) {
    if (!block.props.has(prop)) {
      fail(file, `${path} sets "${prop}" but ${block.id} has no such prop — it is dropped silently`)
      continue
    }
    checkValue(file, `${path}.${prop}`, block, prop, value)
  }
  // A STYLE VALUE IS A STRING. The surface schema takes each `style` entry as
  // a CSS string or a per-breakpoint map of strings; a number (`fontWeight:
  // 600`) passes here and the page, but a host that validates the surface
  // refuses the whole page (INVALID_SCHEMA style.fontWeight).
  for (const [key, value] of Object.entries(node.style ?? {})) {
    const ok =
      typeof value === 'string' ||
      (value && typeof value === 'object' && !Array.isArray(value) &&
        Object.entries(value).every(([bp, v]) => ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(bp) && typeof v === 'string'))
    if (!ok) {
      fail(file, `${path}.style.${key} is ${JSON.stringify(value)} — a style value is a string ("600", "1rem") or a per-breakpoint map of strings`)
    }
  }
  // CHILDREN MUST BE AN ARRAY, AND SAYING SO IS THE GATE'S JOB.
  //
  // A pattern author reaching for a "slot" writes `"children": "{{FIELDS}}"`,
  // which is the wrong shape — patterns give CONCRETE children, as form-card
  // does with its one real field. Before this check the walker simply called
  // `.forEach` on the string and the gate died with a stack trace, so a
  // malformed pattern read as a broken tool rather than as a finding.
  if (node.children !== undefined && !Array.isArray(node.children)) {
    fail(
      file,
      `${path}.children is ${typeof node.children}, not an array — a pattern gives concrete children, ` +
        `not a placeholder slot (see form-card, which ships one real field)`
    )
    return
  }
  if (node.children?.length && !block.canHaveChildren) {
    fail(file, `${path} gives children to ${block.id}, which cannot have them — they never render`)
  }
  ;(node.children ?? []).forEach((child, i) => walk(file, child, `${path}.children[${i}]`, used))
}

const PATTERN_ROLES = ['shell', 'weave', 'band', 'part']

/**
 * A SLOT is where content lands — the empty `children` array a shell or weave
 * leaves for bands. It is declared in `placeholders` and DELIBERATELY absent
 * from the snippet, which is why two rules read the same list: `checkRole`
 * requires it to exist, `checkPlaceholders` exempts it from the stale-line
 * warning.
 */
const SLOT_NAME = /MAIN|RAIL|ASIDE|BODY|CONTENT|BANDS|SLOT/i

/**
 * The five looms — the app frames a surface can be woven on. `any` is
 * deliberate and narrow: `notice`-class bands and generic parts genuinely fit
 * every frame. Everything else must choose, because an unclaimed band is one
 * the composer offers in EVERY context, which is how a pricing band lands on a
 * dashboard.
 */
/**
 * A page is described by a SHELL (chrome) and a BODY.
 *
 * One list of named layouts is not a taxonomy: two names end up using the same
 * primitives, several share a mobile rule word for word, and legitimate
 * combinations have no name at all. The chrome carries navigation, the body
 * arranges content; the two axes are independent.
 */
const CHROME = ['topbar', 'rail', 'bottombar', 'composite', 'none']
const BODY = ['flow', 'grid', 'dense', 'split', 'any']

/**
 * A pattern's `role` says where it sits in a composition, and the rule is
 * STRUCTURAL rather than a matter of naming:
 *
 *   band  — a full-width page slab. Rooted in `section`, which is what makes it
 *           able to stand in the page flow on its own.
 *   part  — a sub-component that goes INSIDE a band. Rooted in card, container,
 *           accordion, repeater — none of which brings its own slab.
 *   shell — the container the bands sit in. Must carry a slot placeholder,
 *           because a shell that takes no bands is not a shell.
 *
 * WHY STRUCTURE AND NOT INTENT. `carousel-hero` is called a hero and reads like
 * a band, but it is container-rooted: dropped into a page it has no slab of its
 * own and the composer would have to wrap it. Labelling it `band` on the
 * strength of its name would hand the model an atom that does not do what the
 * label promises. Same for `logo-cloud`. Both are candidates to BECOME bands by
 * gaining a `section` root — a real improvement to make deliberately, not a
 * label to bend. Until then the honest answer is `part`.
 *
 * So the band rule is an equivalence, checked both ways: section-rooted must be
 * band, and band must be section-rooted.
 */
function checkRole(file, p) {
  if (!p.role) {
    fail(file, 'no "role" — a pattern must say whether it is a shell, a band or a part')
    return
  }
  if (!PATTERN_ROLES.includes(p.role)) {
    fail(file, `role is "${p.role}" — expected one of ${PATTERN_ROLES.join(' | ')}`)
    return
  }

  const root = p.snippet?.type
  if (p.role === 'band' && root !== 'section') {
    fail(file, `role is "band" but the snippet is rooted in "${root}" — a band is a page slab and only a section root provides one`)
  }
  if (p.role === 'part' && root === 'section') {
    fail(file, 'role is "part" but the snippet is rooted in "section" — a section IS a page slab, so this is a band')
  }
  if (p.role === 'shell') {
    const slots = Object.keys(p.placeholders ?? {}).filter((k) => SLOT_NAME.test(k))
    if (slots.length === 0) {
      fail(file, 'role is "shell" but no slot placeholder ({{MAIN}}, {{RAIL}}, {{ASIDE}}…) — a shell that takes no bands is not a shell')
    }
  }
}

/**
 * The knowledge brief, checked against the shape the CONSUMER demands.
 *
 * A pattern can carry `role`, `description` and `usesBlocks` and still reach
 * the composer as nothing at all: a knowledge loader accepts an atom only when
 * its manifest carries `knowledge{purpose, useCases, composesWith,
 * antiPatterns}`; anything else is skipped with a console warning nobody
 * reads. A pattern with a beautiful
 * description and no brief is invisible, which is the worst of both states:
 * the authoring cost was paid and the delivery never happened.
 *
 * So this checks the loader's four fields exactly, not a looser "has some
 * documentation" rule. The shape IS the contract — loosening it here would
 * restore the silent skip.
 *
 * `antiPatterns` is required non-empty on purpose: it is the only field that
 * carries a compositional rule (one primary action, no repeated hero, alt text
 * on media). A brief without it teaches the model what a pattern is but not
 * when it is being misused.
 */
const KNOWLEDGE_FIELDS = ['purpose', 'useCases', 'composesWith', 'antiPatterns']

function checkKnowledge(file, p) {
  const k = p.knowledge
  if (!k || typeof k !== 'object') {
    fail(file, 'no "knowledge" brief — a knowledge loader skips it, so the composer never sees this pattern')
    return
  }
  if (typeof k.purpose !== 'string' || k.purpose.trim() === '') {
    fail(file, 'knowledge.purpose is missing or empty — the loader requires a string')
  }
  for (const field of KNOWLEDGE_FIELDS.slice(1)) {
    if (!Array.isArray(k[field])) {
      fail(file, `knowledge.${field} is not an array — the loader requires one, and rejects the whole brief without it`)
    } else if (k[field].length === 0) {
      fail(file, `knowledge.${field} is empty — an empty ${field} passes the loader and teaches the model nothing`)
    }
  }
}

// ── the composition rules ────────────────────────────────────────────────────
/**
 * The rules a host's surface validation enforces on an author's surface,
 * turned on our own source.
 *
 * WHY. Surface validation rates a hardcoded colour an ERROR and a missing alt
 * an ERROR — for surfaces an author writes. The patterns and receipts shipped
 * as the reference deserve the same reading: a showcase hero that pins a
 * gradient will not re-theme, in a pack whose whole claim is that content
 * re-themes.
 *
 * TWO DELIBERATE DIVERGENCES FROM THAT RULE:
 *
 * 1. WE LOOK DEEPER. The platform scans top-level string props only
 *    (`typeof value !== 'string' → continue`), so a colour nested inside an
 *    object prop is invisible to it. That is exactly where the real defect was:
 *    `gradient: { from: '#4f46e5', to: '#7c3aed' }`. We recurse.
 *
 * 2. WE SKIP CONTENT. Scanning every string also flags a `code` block whose
 *    displayed source happens to contain `#64748b` — a CSS sample, rendered as
 *    text, styling nothing. The platform would call that an error; it is a
 *    false positive, and a check that cries wolf on documentation teaches
 *    people to skip the report. Props that carry prose or source are exempt.
 */
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const RAW_COLOR_CAP = 8
const RAW_COLOR_ALL = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g

/** Raw colour VALUES across a block tree: style values + non-content props. */
function countRawColours(nodes) {
  let n = 0
  const scan = (value) => {
    if (value === null || value === undefined) return
    if (typeof value === 'string') { n += (value.match(RAW_COLOR_ALL) ?? []).length; return }
    if (Array.isArray(value)) { value.forEach(scan); return }
    if (typeof value === 'object') Object.values(value).forEach(scan)
  }
  const walkNode = (node) => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node.props ?? {})) {
      if (!CONTENT_PROPS.has(key)) scan(value)
    }
    scan(node.style ?? {})
    ;(node.children ?? []).forEach(walkNode)
  }
  ;(Array.isArray(nodes) ? nodes : [nodes]).forEach(walkNode)
  return n
}

/** Props whose value is CONTENT — prose or source shown to a reader, not styling. */
const CONTENT_PROPS = new Set([
  'code', 'text', 'content', 'body', 'markdown', 'html', 'prose',
  'description', 'caption', 'label', 'title', 'placeholder', 'alt',
])

function scanColor(file, path, key, value) {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanColor(file, `${path}[${i}]`, key, v))
    return
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (CONTENT_PROPS.has(k)) continue
      scanColor(file, `${path}.${k}`, k, v)
    }
    return
  }
  if (typeof value !== 'string') return
  if (isPlaceholder(value)) return
  if (RAW_COLOR.test(value)) {
    fail(file, `${path} pins the raw colour "${value}" — it will not re-theme. Use a var(--pw-color-*) token.`)
  }
}

/**
 * An image is either content or decoration, and `alt` is where it says which.
 *
 * `alt=""` is the CORRECT marking for a decorative image and the platform's own
 * suggestion says so, which is why an empty alt cannot simply be a failure. But
 * an image whose `src` is a template slot is one the author fills with real
 * content — a news thumbnail, a logo, a product shot. Marking THAT decorative
 * hides it from a screen reader for every page the pattern is ever used on.
 * So the rule is not "alt must be non-empty", it is "a slot-driven image must
 * not claim to be decoration".
 */
function checkImage(file, path, node) {
  const props = node.props ?? {}
  if (!('alt' in props)) {
    fail(file, `${path} is an image with no alt prop — add a description, or alt="" if it is purely decorative`)
    return
  }
  const alt = props['alt']
  if (typeof alt === 'string' && alt.trim() === '' && isPlaceholder(props['src'])) {
    fail(
      file,
      `${path} fills its src from a slot but declares alt="" — a slot-driven image carries content, and marking it decorative hides it from screen readers on every page built from this`
    )
  }
}

/**
 * Heading order, as a WARNING to match the platform's own severity.
 *
 * A skipped level does not break the page, it breaks the outline a screen
 * reader announces — and unlike the colour rule there are honest reasons to
 * start a fragment at h2. Recorded, not blocked.
 */
function checkHeading(file, path, node, state) {
  const level = node.props?.level
  const n = typeof level === 'number' ? level : typeof level === 'string' ? Number(level.replace(/^h/i, '')) : NaN
  if (!Number.isInteger(n) || n < 1 || n > 6) return
  if (state.prevHeading !== null && n > state.prevHeading + 1) {
    warn(file, `${path} jumps from h${state.prevHeading} to h${n} — the announced outline skips a level`)
  }
  state.prevHeading = n
}

/** Walk a block tree applying every composition rule. */
function checkComposition(file, node, path, state) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n, i) => checkComposition(file, n, `${path}[${i}]`, state))
    return
  }
  if (typeof node.type === 'string') {
    state.nodes++
    if (node.type === 'image') checkImage(file, path, node)
    if (node.type === 'heading') checkHeading(file, path, node, state)
    // An EXEMPLAR paints its own ground — that is its thesis (Mondrian's red
    // is not a token, it is the artwork). The raw-colour law stands for every
    // template and inventory surface and for every pattern; the exemption is
    // per-surface and declared by role, never inferred.
    if (!state.allowRawColor) {
      for (const [key, value] of Object.entries(node.props ?? {})) {
        if (CONTENT_PROPS.has(key)) continue
        scanColor(file, `${path}.props.${key}`, key, value)
      }
      scanColor(file, `${path}.style`, 'style', node.style ?? {})
    }
  }
  for (const child of node.children ?? []) {
    checkComposition(file, child, `${path}.children`, state)
  }
}

/**
 * Theme contrast, checked with the same four pairs and the same 4.5:1 line
 * surface validation uses — and with a stricter severity split.
 *
 * Validation that labels anything under 3:1 "severe" but still files it as a
 * warning lets a theme that renders text almost invisible ship. Our own
 * reference material gets the stricter reading: under 3:1 is a failure, between
 * 3 and 4.5 is a warning. Reference material is the one place where "close
 * enough" is not, because every page copied from it inherits the miss.
 */
const CONTRAST_PAIRS = [
  ['text', 'surface'],
  ['text', 'card'],
  ['textMuted', 'surface'],
  ['textOnPrimary', 'primary'],
]

function hexToRgb(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function relativeLuminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastRatio(a, b) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  if (!A || !B) return null
  const la = relativeLuminance(A)
  const lb = relativeLuminance(B)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function checkContrast(file, theme) {
  const colors = { ...(theme?.colors ?? {}) }

  for (const [fg, bg] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(colors[fg], colors[bg])
    if (ratio === null) continue
    if (ratio < 3) {
      fail(file, `theme.colors: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 — below 3:1, the text is barely visible`)
    } else if (ratio < 4.5) {
      warn(file, `theme.colors: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 — below WCAG AA 4.5:1`)
    }
  }
}

/**
 * Which layout does this arrangement belong to?
 *
 * Asked of bands and weaves only. A `part` sits inside a band and inherits its
 * frame; a `shell` IS a layout and cannot belong to one.
 */
function checkShell(file, p) {
  if (p.role !== 'shell') return
  if (!CHROME.includes(p.chrome)) {
    fail(file, `chrome is "${p.chrome}" — expected one of ${CHROME.join(' | ')}`)
  }
  if (!BODY.includes(p.body) || p.body === 'any') {
    fail(file, `body is "${p.body}" — expected one of ${BODY.filter((x) => x !== 'any').join(' | ')}`)
  }
  // Four combinations rule themselves out, and not arbitrarily: with no chrome
  // a grid has no way out, a dense surface has nothing to interact with, and a
  // split contradicts itself — making a selection already is navigation.
  if (p.chrome === 'none' && p.body !== 'flow') {
    fail(file, `chrome "none" allows only body "flow" — "${p.body}" is not reachable`)
  }
}

/**
 * The declaration must match what the snippet ACTUALLY builds.
 *
 * A shell that declares a rail while its snippet's top level is `navbar +
 * container` is a top bar AND a rail, i.e. a composite. A declaration nothing
 * checks is a comment: everything downstream (mobile rule, gate, editor) would
 * trust "rail" and adapt the wrong chrome.
 *
 * Detection is structural, not by name: a navbar-family block at the shell's
 * top level means a top bar; a rail-family block means a rail. Both means
 * composite; neither means none.
 */
const TOPBAR_TYPES = ['navbar', 'announcement-bar']
const RAIL_TYPES = ['tree-view', 'sidebar', 'app-rail']
/**
 * The bottom bar is detected by its block, `layout.bottom-bar`; without a
 * block to express it there would be nothing to detect.
 */
const BOTTOMBAR_TYPES = ['bottom-bar']

function chromeOfSnippet(snippet) {
  const seen = new Set()
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (typeof n.type === 'string') {
      if (TOPBAR_TYPES.includes(n.type)) seen.add('top')
      if (RAIL_TYPES.includes(n.type)) seen.add('rail')
      if (BOTTOMBAR_TYPES.includes(n.type)) seen.add('bottom')
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(snippet)
  // The model names exactly one composite — a top bar AND a rail. A bottom bar
  // paired with either is a shape the vocabulary cannot say, so it is reported
  // as itself rather than silently folded into `composite`.
  if (seen.has('bottom') && (seen.has('top') || seen.has('rail'))) {
    return `bottombar + ${seen.has('top') ? 'topbar' : ''}${seen.has('top') && seen.has('rail') ? ' + ' : ''}${seen.has('rail') ? 'rail' : ''}`
  }
  if (seen.has('top') && seen.has('rail')) return 'composite'
  if (seen.has('rail')) return 'rail'
  if (seen.has('top')) return 'topbar'
  if (seen.has('bottom')) return 'bottombar'
  return 'none'
}

function checkShellShape(file, p) {
  if (p.role !== 'shell' || !p.snippet) return
  const actual = chromeOfSnippet(p.snippet)
  if (actual !== p.chrome) {
    fail(file, `declares chrome "${p.chrome}" but the snippet builds "${actual}" — a declaration nothing checks is a comment`)
  }
}

/**
 * The declaration must match what the snippet builds on the BODY side too.
 *
 * Same defect class as `checkShellShape`, other half of the model. A shell
 * declaring `body: "grid"` whose slot is a plain column container promises the
 * composer a tile field and hands it a stack; declaring `split` without a
 * split block promises a selectable list and hands it nothing to select. Both
 * are silent — the page renders, it is simply not the page that was declared.
 *
 * Detection is structural and narrow on purpose: only the two bodies that a
 * block ACTUALLY expresses are inferable. `flow` and `dense` differ by density
 * of content, not by block type, so no structure distinguishes them and this
 * check does not pretend otherwise.
 */
const GRID_TYPES = ['grid']
const SPLIT_TYPES = ['split-view']

function bodyOfSnippet(snippet) {
  const seen = new Set()
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (typeof n.type === 'string') {
      if (GRID_TYPES.includes(n.type)) seen.add('grid')
      if (SPLIT_TYPES.includes(n.type)) seen.add('split')
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(snippet)
  if (seen.has('split')) return 'split'
  if (seen.has('grid')) return 'grid'
  return null // flow / dense — not structurally distinguishable
}

function checkBodyShape(file, p) {
  if (p.role !== 'shell' || !p.snippet) return
  const actual = bodyOfSnippet(p.snippet)
  if (actual === null) {
    if (p.body === 'grid' || p.body === 'split') {
      fail(file, `declares body "${p.body}" but the snippet builds neither a grid nor a split — the slot is a plain flow`)
    }
    return
  }
  if (actual !== p.body) {
    fail(file, `declares body "${p.body}" but the snippet builds "${actual}"`)
  }
}

/**
 * A shell's detail sub-mode, checked against the block that carries it.
 *
 * `split` divides into two genuinely different pages — a document detail and
 * a stream detail — and the difference is load-bearing: the stream opens at the
 * BOTTOM and forbids a footer, the document does neither. The pattern declares
 * which one it is in `detail`, and this makes the declaration answerable.
 */
const DETAIL_MODES = { doc: 'document', stream: 'stream' }

function checkDetailMode(file, p) {
  if (p.role !== 'shell' || !p.snippet) return
  const split = (() => {
    let hit = null
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (!n || typeof n !== 'object') return
      if (SPLIT_TYPES.includes(n.type)) hit = n
      for (const c of n.children ?? []) walk(c)
    }
    walk(p.snippet)
    return hit
  })()

  if (p.body !== 'split') {
    if (p.detail !== undefined) {
      fail(file, `declares detail "${p.detail}" but body is "${p.body}" — only a split body has a detail sub-mode`)
    }
    return
  }
  if (!Object.hasOwn(DETAIL_MODES, p.detail ?? '')) {
    fail(file, `body is "split" but detail is "${p.detail}" — expected one of ${Object.keys(DETAIL_MODES).join(' | ')}`)
    return
  }
  const expected = DETAIL_MODES[p.detail]
  const actual = split?.props?.detailMode ?? 'document'
  if (actual !== expected) {
    fail(file, `declares detail "${p.detail}" (${expected}) but split-view sets detailMode "${actual}"`)
  }
  // `akan` forbids a footer. Stated in prose in the mobile rule and nowhere
  // enforced — which is exactly how the retired looms drifted.
  if (p.detail === 'stream') {
    const hasFooter = JSON.stringify(p.snippet).includes('"footer"')
    if (hasFooter) {
      fail(file, 'detail is "stream" but the snippet carries a footer — nothing sits below a composer')
    }
  }
}

/**
 * A band declares which BODY it belongs to — not which shell.
 *
 * A band is a slab of content; what decides whether it fits is how the page
 * organises content, not how it carries navigation. `kpi-row` belongs to a
 * dense body whether the shell is a rail or a top bar.
 */
function checkBandBody(file, p) {
  if (p.role !== 'band') return
  if (!p.body) {
    fail(file, 'no "body" — an unclaimed band is offered in every context, including the ones it ruins')
    return
  }
  if (!BODY.includes(p.body)) {
    fail(file, `body is "${p.body}" — expected one of ${BODY.join(' | ')}`)
  }
}

/**
 * What does this become on a narrow screen?
 *
 * Required of bands, weaves and shells — the three that own layout. "It
 * shrinks" is not an answer and the field is not asking for one: it asks what
 * the arrangement TURNS INTO. A console rail does not thin, it becomes a bottom
 * bar; a mosaic's grid does not just stack, its tile order becomes a decision.
 * An arrangement that has not answered this is defined for one viewport only.
 */
/**
 * Every slot the snippet CARRIES must be declared in `placeholders`.
 *
 * WHY. A pattern that declares only some of the tokens it carries (`{{ID}}`
 * declared, `{{TITLE}} {{SUMMARY}} {{DATE}}` carried) leaves the undeclared ones
 * unfilled by anything that fills a pattern FROM ITS DECLARATION, and an
 * unfilled token is not blank: the literal string `{{TITLE}}` is printed on
 * the page.
 *
 * IDENTITY TOKENS ARE NOT SLOTS, and the distinction is positional rather than
 * by name: a token appearing only in `id` fields (`{{ID}}`, `{{BAND_ID}}`,
 * `{{ROW_ID}}`) is the node identity the expander supplies, and demanding it be
 * declared would put 15 lines of bookkeeping into every band's documentation.
 * The same token appearing in a PROP is a slot and is checked — the rule reads
 * the position, not the name, so `{{BAND_ID}}` used as a heading would still be
 * caught.
 *
 * The reverse direction is a WARNING, not a failure. A declared-but-unused slot
 * is a stale line in a document — worth printing, but blocking on it would
 * punish a pattern for over-documenting itself.
 */
const TOKEN_RE = /\{\{([A-Z0-9_]+)\}\}/g

/** Tokens sitting in `props`/`style` — the authoring slots. */
function slotTokensOf(node, into = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((n) => slotTokensOf(n, into))
    return into
  }
  if (!node || typeof node !== 'object') return into
  const scan = (v) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(TOKEN_RE)) into.add(m[1])
    } else if (Array.isArray(v)) v.forEach(scan)
    else if (v && typeof v === 'object') Object.values(v).forEach(scan)
  }
  scan(node.props ?? {})
  scan(node.style ?? {})
  /**
   * THE `id` FIELD COUNTS TOO.
   *
   * This scanner read `props` and `style` only, so a token sitting in an id
   * position was invisible to the rule right below it. A pattern that writes
   * its ids as `{{BAND_ID}}` or `{{ROW_ID}}` — undeclared and unknown to a
   * pattern expander that substitutes `{{ID}}` — ships literal ids into every
   * app that calls it, and two calls of the same pattern collide.
   *
   * An id is not decoration: the renderer prints it as the DOM id and links
   * anchor to it, so a token there is a broken page, not a cosmetic slip.
   */
  if (typeof node.id === 'string') scan(node.id)
  for (const c of node.children ?? []) slotTokensOf(c, into)
  return into
}

function checkPlaceholders(file, p) {
  if (!p.snippet) return
  const carried = slotTokensOf(p.snippet)
  // THE WIRING FIELDS CARRY SLOTS TOO. A wired pattern
  // writes its endpoint, its `returns` path and its filter field as slots
  // INSIDE `dataSources` (`"endpoint": "{{COLLECTION}}?limit={{PAGE_SIZE}}"`)
  // — the expander already substitutes inside strings, it applies beyond the
  // snippet too, and a slot undeclared there
  // prints on the wire exactly as one undeclared in a prop prints on the page.
  // Until this line the scan read the snippet only.
  wiringSlotTokens(p, carried)
  carried.delete('ID')
  const declared = new Set(Object.keys(slotDeclarations(p)))
  for (const token of carried) {
    if (!declared.has(token)) {
      fail(file, `pattern carries {{${token}}} (snippet or a wiring field) but "placeholders" does not declare it — anything filling from the declaration prints the token on the page or on the wire`)
    }
  }
  // The reverse direction compares against EVERY token in the snippet, identity
  // positions included: declaring `{{ID}}` is redundant, not wrong, and warning
  // about it would bury the case worth seeing — a declared slot that appears
  // nowhere at all.
  const anywhere = new Set(
    [...JSON.stringify(p.snippet).matchAll(TOKEN_RE)].map((m) => m[1])
  )
  wiringSlotTokens(p, anywhere)
  for (const token of declared) {
    if (anywhere.has(token)) continue
    // A shell's or weave's SLOT is declared precisely BECAUSE it is absent from
    // the snippet: the slot is the empty `children` array where bands land, and
    // `checkRole` requires the declaration. Warning about it would be telling
    // the pattern off for obeying the other rule.
    if ((p.role === 'shell' || p.role === 'weave') && SLOT_NAME.test(token)) continue
    warn(file, `placeholders declares {{${token}}}, which the snippet never uses`)
  }
}

/**
 * A snippet's block ids must be unique.
 *
 * WHY. Two nodes carrying the same `{{ID}}-c` template become two blocks with
 * one id. The renderer writes a block's id straight into the DOM `id`
 * attribute, so every page using the pattern serves duplicate DOM ids: an
 * in-page anchor lands on whichever came first, and a link checker silently
 * agrees because the id EXISTS.
 *
 * It surfaced from the other end — a downstream delivery gate found the
 * duplicates in a generated app and spent an AI repair round fixing the OUTPUT,
 * leaving the pattern that produced them untouched. Fixing output instead of
 * source is how a defect becomes recurring, so the rule belongs here too: a
 * delivery gate measures an app, this measures the thing apps are built from.
 */
function checkIdUniqueness(file, p) {
  if (!p.snippet) return
  const counts = new Map()
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (typeof n.id === 'string' && n.id) counts.set(n.id, (counts.get(n.id) ?? 0) + 1)
    for (const c of n.children ?? []) walk(c)
  }
  walk(p.snippet)
  for (const [id, n] of counts) {
    if (n > 1) {
      fail(file, `snippet uses the id "${id}" ${n}× — the renderer writes it to the DOM id, so an anchor to it is ambiguous`)
    }
  }
}

function checkMobile(file, p) {
  if (p.role !== 'band' && p.role !== 'weave' && p.role !== 'shell') return
  if (typeof p.mobileCollapse !== 'string' || p.mobileCollapse.trim() === '') {
    fail(file, 'no "mobileCollapse" — an arrangement undefined at narrow width is undefined')
  }
}

/**
 * CHROME MUST DECLARE ITS OWN WIDTH SCOPE.
 *
 * The engine knows two words on the width axis (`container` | `viewport`), and
 * which block falls under which is the PACK's vocabulary. But nothing measured
 * that the vocabulary was actually SPOKEN: the mechanism shipped, NONE of the
 * shells declared it, and the rule sat published but unapplied. A rail shell at
 * 375px wide:
 *
 *     app-rail#shell-rail   w=164  flex=1 1 0px    ← chrome, stretched into an equal column
 *     container#shell-work  w=164  flex=1 1 0px
 *
 * Undeclared chrome is stretched like one of two equal columns in the row; the
 * rail crushes the content and the row overflows on a narrow screen; with the
 * declaration the overflow is gone.
 *
 * This gate does not measure overflow — a render-time check does.
 * What is measured here is that the DECLARATION EXISTS: the source, not the output.
 */
const CHROME_TYPES = new Set([
  'app-rail',
  'navbar',
  'bottom-bar',
  'announcement-bar',
  'tree-view',
  'side-nav',
])

function checkChromeScope(file, p) {
  if (p.role !== 'shell') return
  const missing = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (CHROME_TYPES.has(n.type)) {
      const scope = n.layout?.widthScope
      if (!scope || typeof scope !== 'object' || Object.keys(scope).length === 0) {
        missing.push(`${n.type}#${n.id ?? '?'}`)
      }
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(p.snippet)
  for (const m of missing) {
    fail(
      file,
      `${m} is persistent chrome but does not declare "layout.widthScope" — undeclared chrome is stretched like a content column in the row`
    )
  }
}

// ── the data contract of a pattern ───────────────────────────────────────────
/**
 * A PATTERN IS THE UNIT OF MEANING. A pattern layer that is pure arrangement
 * and copy leaves data INSIDE blocks (self-fetching panels) and behaviour in a
 * host's database — neither is a place the composer can read or change. So a
 * pattern may declare, at its top level:
 *
 *   dataSources[]   — contracts `dataSourceSchema`: {id, kind:'entity',
 *                     connector, entityType, query, fallback[]}. The runtime
 *                     binds the list as `{{<id>}}`, flags as `{{__loading.<id>}}`
 *                     and `{{__errors.<id>}}`; `{{state.x}}` inside `query`
 *                     resolves against surface state (pagination / filters).
 *   behaviors[]     — contracts `surfaceBehaviorSchema`: {id, event,
 *                     targetBlockId?, actions[]} — event → setState / refresh /
 *                     showBlock / hideBlock / navigate.
 *   initialState{}  — the state keys the pattern reads.
 *   requires        — { connectors: [...] } every connector the sources name.
 *
 * The composer's `use-pattern` moves all four into the surface's
 * `platform/persistence` capability config, prefixing ids on collision.
 *
 * BINDINGS ARE NOT SLOTS. Authoring slots are UPPERCASE `{{TITLE}}` (TOKEN_RE);
 * runtime bindings are lowercase `{{alerts}}`, `{{state.offset}}`,
 * `{{__errors.alerts}}`, `{{length(alerts)}}`. The two grammars share braces
 * and nothing else: a slot is filled at authoring time and vanishes, a binding
 * survives into the surface and is resolved on every render.
 *
 * WHAT IS CHECKED, AND AGAINST WHAT. The connector must be one the pack's
 * provider registers — the provider named by `--provider <name>`, whose
 * `providers/<name>/index.ts` maps connectors to domains in CONN_TO_DOMAIN, plus
 * any dynamic connectors named by `--dynamic-connectors a,b` (any entityType);
 * the entityType must be a key of that domain's EntityMap; every filter field
 * must be either a NAMED PARAMETER the engine reads (`ctx.filter('top')`,
 * `filterValue(ctx.query, 'path')`, `requires:`) or a ROW FIELD the engine
 * returns — anything else is a filter nothing will ever honour. With no
 * provider named, no entity connector is known and an entity source fails.
 */
/**
 * The provider engine may live in ANOTHER pack: a pattern can declare a
 * connector whose engine is shipped by a pack it pairs with. So the path is
 * looked up in the borrowed roots too: the first one that exists wins.
 */
const firstExisting = (...rels) => {
  for (const root of [ATOMS, ...BORROWED.map((r) => atomsDir(r))]) {
    const abs = join(root, ...rels)
    if (existsSync(abs)) return abs
  }
  return join(ATOMS, ...rels)
}
const PROVIDER = flag('--provider')
const PROVIDER_INDEX = PROVIDER ? firstExisting('providers', PROVIDER, 'index.ts') : null
const ENTITIES_DIR = PROVIDER ? firstExisting('providers', PROVIDER, 'entities') : null
const KNOWN_CONNECTORS = (() => {
  // Dynamic connectors take any entityType, so they map to no domain.
  const map = new Map((flag('--dynamic-connectors') ?? '').split(',').filter(Boolean).map((c) => [c, null]))
  if (!PROVIDER_INDEX || !existsSync(PROVIDER_INDEX)) return map
  const block = readFileSync(PROVIDER_INDEX, 'utf8').match(/CONN_TO_DOMAIN[^{]*\{([\s\S]*?)\}/)
  for (const m of (block?.[1] ?? '').matchAll(/'([a-z][\w-]*)':\s*'([a-z]+)'/g)) map.set(m[1], m[2])
  return map
})()
const ENTITY_CACHE = new Map()
/** entityType → { params:Set, rows:Set } for one domain file; null when unknown. */
function entityFields(domain, entityType) {
  const key = `${domain}:${entityType}`
  if (ENTITY_CACHE.has(key)) return ENTITY_CACHE.get(key)
  const file = ENTITIES_DIR ? join(ENTITIES_DIR, `${domain}.ts`) : ''
  let out = null
  if (file && existsSync(file)) {
    const src = readFileSync(file, 'utf8')
    const heads = [...src.matchAll(/^  ([A-Z]\w+): \{/gm)]
    const idx = heads.findIndex((h) => h[1] === entityType)
    if (idx !== -1) {
      const body = src.slice(heads[idx].index, idx + 1 < heads.length ? heads[idx + 1].index : undefined)
      const params = new Set(['top'])
      for (const m of body.matchAll(/(?:filterValue\(ctx\.query,|ctx\.filter(?:Str)?\()\s*'([\w.]+)'/g)) params.add(m[1])
      for (const m of body.matchAll(/requires:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/'([\w.]+)'/g)) params.add(q[1])
      const NOT_ROW = new Set(['scope', 'read', 'row', 'post', 'path', 'params', 'requires', 'method', 'headers', 'body', 'update', 'create', 'delete', 'id'])
      const rows = new Set(['id'])
      for (const m of body.matchAll(/^\s{8,}(\w+):\s/gm)) if (!NOT_ROW.has(m[1])) rows.add(m[1])
      out = { params, rows }
    }
  }
  ENTITY_CACHE.set(key, out)
  return out
}
const SOURCE_KINDS = new Set(['rest', 'static', 'state', 'entity'])
const EVENT_NAMES = new Set(['block:click', 'input:change', 'form:submit', 'surface:load'])
const ACTION_TYPES = new Set(['setState', 'refresh', 'refreshAll', 'showBlock', 'hideBlock', 'navigate'])
const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'startsWith'])

function filterLeaves(node, into = []) {
  if (!node || typeof node !== 'object') return into
  if (node.field !== undefined || node.operator !== undefined) into.push(node)
  for (const k of ['and', 'or']) (node[k] ?? []).forEach((c) => filterLeaves(c, into))
  return into
}
function nodeIds(node, into = new Set()) {
  if (!node || typeof node !== 'object') return into
  if (typeof node.id === 'string') into.add(node.id)
  ;(node.children ?? []).forEach((c) => nodeIds(c, into))
  return into
}

function checkPatternData(file, p) {
  const text = JSON.stringify(p.snippet ?? {})
  const sources = p.dataSources
  const usedConnectors = new Set()
  if (sources !== undefined) {
    if (!Array.isArray(sources)) { fail(file, '"dataSources" must be an array'); return }
    const seen = new Set()
    for (const [i, src] of sources.entries()) {
      const at = `dataSources[${i}]`
      if (!src || typeof src !== 'object') { fail(file, `${at} is not an object`); continue }
      if (typeof src.id !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(src.id)) fail(file, `${at}.id "${src.id}" — a source id is a lowercase identifier (it becomes the {{binding}} name)`)
      if (seen.has(src.id)) fail(file, `${at}.id "${src.id}" is declared twice`)
      seen.add(src.id)
      if (!SOURCE_KINDS.has(src.kind)) fail(file, `${at}.kind "${src.kind}" — expected ${[...SOURCE_KINDS].join(' | ')}`)
      if (src.kind === 'entity') {
        if (typeof src.connector !== 'string') fail(file, `${at} is an entity source with no "connector" — a pattern's data names its engine; a host's default facade is the host's decision, not a pack one`)
        else if (!KNOWN_CONNECTORS.has(src.connector)) fail(file, `${at}.connector "${src.connector}" is not a connector this pack registers (${[...KNOWN_CONNECTORS.keys()].join(', ') || 'none — name the provider with --provider'})`)
        else {
          usedConnectors.add(src.connector)
          const domain = KNOWN_CONNECTORS.get(src.connector)
          if (domain) {
            const fields = entityFields(domain, src.entityType)
            if (!fields) fail(file, `${at}.entityType "${src.entityType}" is not an entity of ${src.connector} (providers/${PROVIDER}/entities/${domain}.ts)`)
            else {
              for (const leaf of filterLeaves(src.query?.filter)) {
                if (leaf.field === undefined || leaf.field === '') continue
                if (leaf.operator !== undefined && !FILTER_OPS.has(leaf.operator)) fail(file, `${at}.query.filter uses operator "${leaf.operator}" — expected ${[...FILTER_OPS].join(' | ')}`)
                if (!fields.params.has(leaf.field) && !fields.rows.has(leaf.field)) {
                  fail(file, `${at}.query.filter names field "${leaf.field}", which ${src.entityType} neither reads as a parameter (${[...fields.params].join(', ')}) nor returns as a row field (${[...fields.rows].join(', ')}) — nothing would honour it`)
                }
              }
              for (const sf of src.query?.sort ?? []) {
                if (!fields.rows.has(sf.field)) fail(file, `${at}.query.sort names field "${sf.field}", which ${src.entityType} does not return`)
              }
            }
          }
        }
        if (src.fallback !== undefined && !Array.isArray(src.fallback)) fail(file, `${at}.fallback must be an array — a list source binds as a list, and so must its stand-in`)
        if (src.fallback === undefined) warn(file, `${at} ("${src.id}") has no fallback — without a connection this pattern renders an empty list; Discovery and the pack gallery will show nothing`)
      }
      if (typeof src.id === 'string' && !text.includes(`{{${src.id}}}`) && !text.includes(`(${src.id}`) && !text.includes(`${src.id}.`) && !text.includes(`${src.id})`)) {
        warn(file, `${at} ("${src.id}") is declared but the snippet never binds it`)
      }
    }
  }
  const behaviors = p.behaviors
  if (behaviors !== undefined) {
    if (!Array.isArray(behaviors)) { fail(file, '"behaviors" must be an array'); return }
    const ids = nodeIds(p.snippet)
    for (const [i, b] of behaviors.entries()) {
      const at = `behaviors[${i}]`
      if (!b || typeof b !== 'object') { fail(file, `${at} is not an object`); continue }
      if (typeof b.id !== 'string' || !b.id) fail(file, `${at} has no id`)
      if (!EVENT_NAMES.has(b.event)) fail(file, `${at}.event "${b.event}" — expected a canonical bus event: ${[...EVENT_NAMES].join(' | ')}`)
      if (b.targetBlockId !== undefined && !ids.has(b.targetBlockId)) fail(file, `${at}.targetBlockId "${b.targetBlockId}" is not a node id of the snippet — the expander substitutes {{ID}} in both places, so they must match textually`)
      if (!Array.isArray(b.actions) || b.actions.length === 0) fail(file, `${at}.actions is empty — a behavior with no action is a listener for nothing`)
      else for (const [j, a] of b.actions.entries()) {
        if (!a || !ACTION_TYPES.has(a.type)) fail(file, `${at}.actions[${j}].type "${a?.type}" — expected ${[...ACTION_TYPES].join(' | ')}`)
        if (a?.type === 'setState' && typeof a.key !== 'string') fail(file, `${at}.actions[${j}] setState needs a string "key"`)
        if (a?.type === 'refresh' && !(p.dataSources ?? []).some((sr) => sr.id === a.sourceId)) fail(file, `${at}.actions[${j}] refreshes "${a.sourceId}", which is not one of this pattern's dataSources`)
        if ((a?.type === 'showBlock' || a?.type === 'hideBlock') && !ids.has(a.blockId)) fail(file, `${at}.actions[${j}] targets block "${a.blockId}", which the snippet does not contain`)
      }
    }
  }
  if (p.initialState !== undefined && (typeof p.initialState !== 'object' || Array.isArray(p.initialState))) fail(file, '"initialState" must be an object')
  const declaredConnectors = new Set(p.requires?.connectors ?? [])
  for (const c of usedConnectors) if (!declaredConnectors.has(c)) fail(file, `dataSources use connector "${c}" but requires.connectors does not declare it — the composer reads the declaration, not the sources, to know what a project must have connected`)
  for (const c of declaredConnectors) if (!KNOWN_CONNECTORS.has(c)) fail(file, `requires.connectors names "${c}", which this pack does not register`)
  // state keys read anywhere must be seeded, or the first render binds undefined
  const everything = JSON.stringify({ s: p.snippet, d: p.dataSources, b: p.behaviors })
  const stateKeys = new Set([...everything.matchAll(/\{\{\s*state\.([A-Za-z_]\w*)/g)].map((m) => m[1]))
  for (const k of stateKeys) if (!(k in (p.initialState ?? {}))) fail(file, `reads {{state.${k}}} but initialState does not seed "${k}" — the first render binds undefined`)
}

/**
 * Wired, or layout by intent — never silently neither.
 *
 * The rules themselves live in lib/wiring-rules.mjs and are proven both ways
 * in test/wiring-rules.test.ts; this only routes their findings to fail/warn
 * and keeps the census the summary prints. See WIRING_STRICT for why the
 * "neither" case is still a report.
 */
const wiringCensus = { wired: 0, layoutOnly: 0, neither: 0 }
function checkWiring(file, p) {
  if (p.layoutOnly === true) wiringCensus.layoutOnly++
  else if (isWired(p)) wiringCensus.wired++
  else wiringCensus.neither++
  for (const f of wiringFindings(p, { strict: WIRING_STRICT })) {
    if (f.severity === 'fail') fail(file, f.msg)
    else warn(file, f.rule === 'unwired' ? `${f.msg} [reported, not blocking; --strict-wiring fails it]` : f.msg)
  }
}

function readPatterns() {
  if (!existsSync(PATTERNS)) return 0
  const files = readdirSync(PATTERNS).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    const file = `atoms/patterns/${f}`
    let p
    try {
      p = JSON.parse(readFileSync(join(PATTERNS, f), 'utf8'))
    } catch (e) {
      fail(file, `unparseable — ${e.message}`)
      continue
    }
    if (!p.snippet) { fail(file, 'no snippet'); continue }

    checkRole(file, p)
    checkKnowledge(file, p)
    checkBandBody(file, p)
    checkShellShape(file, p)
    checkBodyShape(file, p)
    checkDetailMode(file, p)
    checkShell(file, p)
    checkPlaceholders(file, p)
    checkPatternData(file, p)
    checkWiring(file, p)
    checkIdUniqueness(file, p)
    checkMobile(file, p)
    checkChromeScope(file, p)
    checkComposition(file, p.snippet, 'snippet', { nodes: 0, prevHeading: null })

    const used = new Set()
    walk(file, p.snippet, 'snippet', used)
    checkTreeRules(file, p.snippet, 'snippet')

    // `usesBlocks` is the pattern's own claim about itself. Both directions are
    // checked: a missing entry hides a dependency, a stale one names a block the
    // snippet stopped using — and neither shows up at render.
    const declared = new Set(p.usesBlocks ?? [])
    for (const u of used) {
      if (!declared.has(u)) fail(file, `snippet uses "${u}" but usesBlocks omits it`)
    }
    for (const d of declared) {
      if (!used.has(d)) fail(file, `usesBlocks declares "${d}" but the snippet never uses it`)
    }
  }
  return files.length
}

/**
 * Showcase receipts get the same treatment as patterns. A receipt is a page
 * somebody can open, so a block it names wrongly is more visible than a bad
 * pattern, not less.
 */
/**
 * The surface contract.
 *
 * Every surface is the EXEMPLAR of exactly one layout language — there is no
 * second kind. It binds to a pack theme by `appearanceRef`, states its thesis
 * (`knowledge.purpose`) and the composition laws it demonstrates
 * (`knowledge.laws`), and may paint raw colour: the colour is part of the
 * thesis (Mondrian's red is not a token).
 *
 * There are no other surface roles (template, inventory): pages that only
 * repeat one skeleton or list blocks teach no composition — so a page either
 * becomes a
 * distinct layout language or left the pack.
 */

function readSurfaces() {
  if (!existsSync(SURFACES)) return 0
  const files = readdirSync(SURFACES).filter((f) => f.endsWith('.json'))
  // A theme is an atom of the base pack; a pack that carries surfaces may
  // borrow it. A surface in a pack with no `atoms/appearance` of its own must
  // still bind a pack theme — one that comes from a pack in its closure.
  const themes = partRoots('appearance').flatMap((dir) =>
    readdirSync(dir).filter((d) => existsSync(join(dir, d, 'manifest.json')))
  )
  const wornThemes = new Set()
  for (const f of files) {
    const file = rel(join(SURFACES, f))
    let s
    try {
      s = JSON.parse(readFileSync(join(SURFACES, f), 'utf8'))
    } catch (e) {
      fail(file, `unparseable — ${e.message}`)
      continue
    }
    if (s.role !== undefined) {
      fail(file, `"role" is gone — every surface is the exemplar of one layout language; state it in knowledge.purpose`)
    }
    // FIELD NAME: `appearance.use`, not `appearanceRef`. `appearanceRef`
    // appears in no contract; the schema'd field is AppearanceBindingSchema.use,
    // and a theme declared under the wrong name is a theme nothing validates
    // and every reader of `appearance.use` misses.
    if (s.appearanceRef !== undefined) {
      fail(file, `"appearanceRef" is gone — bind the theme with appearance.use (the contract's field)`)
    }
    if (!s.appearance?.use) {
      fail(file, `no appearance.use — a surface wears a pack theme, it does not invent a palette`)
    } else if (!themes.includes(s.appearance.use)) {
      fail(file, `appearance.use "${s.appearance.use}" resolves to no atom under atoms/appearance/`)
    } else {
      wornThemes.add(s.appearance.use)
    }
    // INLINE PALETTE RETIRED: an inline `theme` object carries no field
    // outside the pack theme's own shape — pure value variation, no new
    // structure. Technique lives in
    // `appearance.config` (keyframes) and is untouched.
    if (s.theme !== undefined) {
      fail(file, `inline "theme" is gone — measured: no field outside the pack theme's own shape; vary values in an appearance atom, keep technique in appearance.config`)
    }
    if (!s.knowledge?.purpose || !s.knowledge?.laws?.length) {
      fail(file, `a surface exists to prove one layout language — knowledge.purpose and knowledge.laws are required`)
    }
    // A SURFACE WEARS PATTERNS. An exemplar that names no pattern teaches the composer a layout language
    // with no vocabulary to build it from. Two is the floor: one pattern is a
    // showcase of that pattern, two is a composition.
    const worn = s.knowledge?.patternsExercised ?? []
    if (worn.length < 2) {
      fail(file, `knowledge.patternsExercised names ${worn.length} pattern(s) — a surface wears at least two (it is a composition, not a single pattern's demo); scan the tree for pattern twins and declare them, or place a part`)
    }
    const used = new Set()
    ;(s.blocks ?? []).forEach((node, i) => walk(file, node, `blocks[${i}]`, used))
    checkTreeRules(file, s.blocks ?? [], 'blocks')

    // The composition rules see BOTH halves of a receipt. `blocks` holds the
    // authored nodes and `layout` the tree that arranges them; walking only the
    // first is how a first pass at this measured 0 findings on a file that had
    // two — the catalogue walk above has the same blind spot and is left alone
    // because block-type agreement genuinely lives in `blocks`.
    const state = { nodes: 0, prevHeading: null, allowRawColor: true }
    checkComposition(file, s.blocks ?? [], 'blocks', state)
    checkComposition(file, s.layout ?? {}, 'layout', state)
    checkContrast(file, s.theme)
    // RAW-COLOUR CAP. A surface may paint its own thesis, but a page of raw
    // cell grounds and no tokens is one no theme can change. An exemplar the
    // theme cannot repaint
    // teaches the composer a look, not a layout. So: at most RAW_COLOR_CAP raw
    // colour values in `blocks` (style + non-content props) unless the surface
    // declares `themeIndependent: true`, in which case it is listed in
    // surfaces/README.md and does not count toward the theme rhythm.
    const rawHits = countRawColours(s.blocks ?? [])
    if (s.themeIndependent === true) {
      warn(file, `themeIndependent — ${rawHits} raw colour value(s); the surface does not count toward the theme rhythm`)
    } else if (rawHits > RAW_COLOR_CAP) {
      fail(file, `${rawHits} raw colour value(s) in blocks (cap ${RAW_COLOR_CAP}) — bind them to tokens or color-mix() derivations, or declare themeIndependent: true with the thesis that needs it`)
    }
  }
  // NOT "EVERY THEME MUST BE WORN". Themes are STRUCTURALLY IDENTICAL — the
  // same fields and groups, only values differ — so wearing each of them
  // proves no additional technique and makes the exemplar set a swatch book
  // instead of an app. One theme carries the technique, the others are
  // variation: a pack proves itself with a coherent product, not a colour
  // carousel.
  //
  // What the surfaces must still prove is unchanged and still enforced above:
  // one layout language each, knowledge.purpose + laws, patterns exercised,
  // raw-colour cap.
  if (wornThemes.size === 0 && files.length) {
    fail(rel(SURFACES), `no surface declares appearance.use — the exemplars must wear the pack's theme`)
  }
  return files.length
}

// ── composesWith resolves ─────────────────────────────────────────────────────
/**
 * `knowledge.composesWith` is what the composer reads to pair things. When a
 * block is retired, or an id is simply misremembered (`nav.navbar`,
 * `code.block`), the pairing advice names something that does not exist —
 * while `usesBlocks`, which the gate enforces, keeps the snippets honest.
 */
function checkComposesWith() {
  const blockIds = new Set(catalogue.values().map ? [...catalogue.values()].map((b) => b.id) : [])
  const bare = new Set([...blockIds].map((id) => id.split('.')[1]))
  // The pattern-name universe INCLUDES the borrowed roots. A domain pack's
  // pattern naming the base's `footer` is not a ghost but the right direction
  // of dependency: the domain pack cannot install without the base anyway. The
  // reverse — the base naming a domain pattern — is still caught, because the
  // base is checked with no borrowed roots.
  const patternNames = new Set(
    PATTERN_ROOTS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
  )
  // capabilities are legitimate pairing targets too (`platform/entities` …)
  // …from the pack and its closure: `platform/entities` lives in foundation,
  // and a block in a pack built on it that pairs with it names a real atom.
  const capIds = new Set(
    partRoots('capabilities').flatMap((CAPS) =>
      readdirSync(CAPS).flatMap((d) => {
        const mf = join(CAPS, d, 'manifest.json')
        if (!existsSync(mf)) return []
        try { return [JSON.parse(readFileSync(mf, 'utf8')).id] } catch { return [] }
      })
    )
  )
  const ok = (ref) => blockIds.has(ref) || bare.has(ref) || patternNames.has(ref) || capIds.has(ref)
  // OWN blocks only: borrowed roots' manifests are checked in their own packs.
  // A pattern-only pack has no such directory at all.
  if (existsSync(BLOCKS)) for (const category of readdirSync(BLOCKS)) {
    const catDir = join(BLOCKS, category)
    if (!statSync(catDir).isDirectory()) continue
    for (const entry of readdirSync(catDir)) {
      const mf = join(catDir, entry, 'manifest.json')
      if (!existsSync(mf)) continue
      let m; try { m = JSON.parse(readFileSync(mf, 'utf8')) } catch { continue }
      for (const c of m.knowledge?.composesWith ?? []) {
        if (!ok(c)) fail(rel(mf), `knowledge.composesWith names "${c}", which is neither a block nor a pattern — the composer would pair with a ghost`)
      }
    }
  }
  if (existsSync(PATTERNS)) for (const f of readdirSync(PATTERNS).filter((f) => f.endsWith('.json'))) {
    let p; try { p = JSON.parse(readFileSync(join(PATTERNS, f), 'utf8')) } catch { continue }
    for (const c of p.knowledge?.composesWith ?? []) {
      if (!ok(c)) fail(`atoms/patterns/${f}`, `knowledge.composesWith names "${c}", which is neither a block nor a pattern`)
    }
  }
  if (existsSync(SURFACES)) for (const f of readdirSync(SURFACES).filter((f) => f.endsWith('.json'))) {
    let s; try { s = JSON.parse(readFileSync(join(SURFACES, f), 'utf8')) } catch { continue }
    for (const c of s.knowledge?.patternsExercised ?? []) {
      if (!patternNames.has(c)) fail(rel(join(SURFACES, f)), `knowledge.patternsExercised names "${c}", which is not a pattern`)
    }
  }
}

// ── the declaration law ──────────────────────────────────────────────────────
/**
 * A thing an atom REQUIRES is declared as a FIELD. Prose is not a declaration.
 *
 * WHAT THIS IS FOR. A connector that states its delegated permissions only in
 * a sentence of its knowledge brief is machine-unreadable: a host cannot seed a
 * consent screen from it and has to fall back to a hardcoded table, and a
 * missing scope surfaces only as a failed sign-in at run time.
 *
 * TWO DIRECTIONS, BOTH LOAD-BEARING:
 *
 *   1. Every scope the engine's own `scope:` constants declare must appear in
 *      the manifest. The `.ts` is the truth; the manifest is what SHIPS. A
 *      manifest that under-declares asks for too little and the panel 403s.
 *   2. A scope NAMED IN PROSE but absent from the declaration is REPORTED, not
 *      blocked — see below.
 *
 * WHY (2) IS A WARNING AND (1) IS NOT. Most prose mentions are deliberate
 * NON-requirements: a note that writing will LATER need a broader scope (the
 * first version is read-only), or that a scope is already consented by the
 * directory, which is a fact about the directory, not a need of the atom.
 * Forcing those into the declaration would make the consent screen ask for
 * permissions the atom chose not to take — the exact inversion of this law.
 *
 * A text scan cannot tell "requires" from "deliberately does not take", so it
 * belongs in the channel this file reserves for a rule whose SOURCE is
 * known-incomplete. It still earns its place: it is the only thing that would
 * catch a REAL requirement living only in a sentence.
 *
 * The eventual fix is another field — a declared list of deliberate exclusions,
 * so "this atom does not take X" stops being prose too. That widens the atom
 * contract, so it is a follow-up of its own, not a thing to smuggle in here.
 */
const PROVIDER_DIRS = [...(PROVIDER ? [join(ATOMS, 'providers', PROVIDER, 'entities')] : []), join(ATOMS, 'connectors')]

/** Scope-shaped names appearing in free text: `Sites.Read.All`, `offline_access`. */
const SCOPE_IN_PROSE = /\b(?:[A-Z][A-Za-z]+(?:\.[A-Za-z]+){1,3}|offline_access)\b/g

/** Dotted names that look like scopes but are not — file paths, types, code. */
const NOT_A_SCOPE = /^(?:[A-Z][a-z]+\.(?:tsx?|json|mjs|md))$/

function declaredScopesOf(tsSource) {
  const found = new Set()
  for (const m of tsSource.matchAll(/scope:\s*'([^']+)'/g)) found.add(m[1])
  for (const m of tsSource.matchAll(/scope:\s*\[([^\]]+)\]/g)) {
    for (const raw of m[1].split(',')) {
      const s = raw.trim().replace(/'/g, '')
      if (s) found.add(s)
    }
  }
  return found
}

/** Every string in the brief, flattened — prose hides in nested arrays too. */
function proseOf(manifest) {
  const out = []
  const walkValue = (v) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walkValue)
    else if (v && typeof v === 'object') Object.values(v).forEach(walkValue)
  }
  walkValue(manifest.knowledge)
  walkValue(manifest._comment)
  return out.join('\n')
}

function readScopeDeclarations() {
  let checked = 0
  for (const dir of PROVIDER_DIRS) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.knowledge.json'))) {
      const file = `${relative(ROOT, dir).replace(/\\/g, '/')}/${f}`
      let manifest
      try {
        manifest = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      } catch (e) {
        fail(file, `unparseable — ${e.message}`)
        continue
      }
      if (manifest.kind !== 'connector' && manifest.kind !== 'provider') continue
      checked++

      const declared = new Set((manifest.scopes ?? []).map((s) => s?.name).filter(Boolean))
      for (const s of manifest.scopes ?? []) {
        if (typeof s?.name !== 'string' || s.name === '') {
          fail(file, 'a scope declaration has no name — {name, adminConsent?, reason?} is the shape')
        }
      }

      // 1 — the engine's own constants must be declared
      const sibling = join(dir, f.replace('.knowledge.json', '.ts'))
      if (existsSync(sibling)) {
        const needed = declaredScopesOf(readFileSync(sibling, 'utf8'))
        for (const s of needed) {
          if (!declared.has(s)) {
            fail(file, `engine declares scope '${s}' but the manifest does not — the manifest is what ships, so the consent screen would ask for too little`)
          }
        }
      }

      // 2 — prose may not name a scope the declaration omits
      if (declared.size > 0 || manifest.scopes) {
        const named = new Set(
          [...proseOf(manifest).matchAll(SCOPE_IN_PROSE)]
            .map((m) => m[0])
            .filter((s) => !NOT_A_SCOPE.test(s))
        )
        for (const s of named) {
          if (!declared.has(s)) {
            warn(file, `prose names scope '${s}', absent from the "scopes" declaration — if the atom REQUIRES it, declare it; if it is a deliberate exclusion or a note about the directory, this line is the reminder that the distinction still lives in a sentence`)
          }
        }
      }
    }
  }
  return checked
}

// ── run ──────────────────────────────────────────────────────────────────────
readCatalogue()
const patternCount = readPatterns()
const surfaceCount = readSurfaces()
checkComposesWith()
const scopeAtomCount = readScopeDeclarations()

// ── coverage: a block nothing shows is a block nobody can check ──────────────
/**
 * SHIPPED IS NOT SHOWN. Everything above this line asks "does what the packs
 * ship AGREE with itself" — every type resolves, every prop exists, every
 * required item key is present. None of it asks the prior question: is this
 * block placed ANYWHERE? A block in the catalogue that no pattern and no
 * surface ever renders is shipped, typechecked, published — and never once
 * looked at. It cannot regress visibly, because there is nothing to look at.
 *
 * A catalogue grows, and without a count a third of it can end up placed by
 * nothing — found only by hand, if at all.
 *
 * THE ONE EXEMPT FAMILY, AND WHY IT IS A FAMILY AND NOT A LIST. The catalogue
 * is cut by SHAPE — `overlay.*` (modal, drawer…), `container.*` (card,
 * tabs…) and `integration.*` (calendar, chat, files… the app views that
 * MUTATE through a connection). A read-only data view is a data-bound pattern,
 * not a block. What remains connection-bound is exactly the `integration.*`
 * family, so the exemption is the family, declared once by the block's own
 * category, not a list that has to be kept in step with the directory. An
 * integration block carries its connection in the manifest's `connection`
 * field and never enters a pattern; its proof is a live connection, not a
 * receipt.
 */
const EXEMPT_FAMILY = 'integration'

/**
 * A DEPENDENT'S PLACEMENT COUNTS. In a layered catalogue the pattern that
 * shows a base block often lives in a pack built on the base (a filter band
 * placing `chip`, a page placing the overlays). Those blocks are shown — one
 * layer up. Read-only: a dependent's patterns and
 * surfaces are judged in their own pack; here only the TYPES they place are
 * collected, and only for coverage.
 */
const SHOWN_ELSEWHERE = new Set()
{
  const collect = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(collect)
    if (typeof node.type === 'string') SHOWN_ELSEWHERE.add(node.type)
    for (const c of Array.isArray(node.children) ? node.children : []) collect(c)
  }
  for (const root of SHOWN_BY) {
    const pd = familyDir(root, 'patterns')
    if (existsSync(pd)) for (const f of readdirSync(pd).filter((x) => x.endsWith('.json'))) {
      try { collect(JSON.parse(readFileSync(join(pd, f), 'utf8')).snippet) } catch { /* judged in its own pack */ }
    }
    for (const sd of surfaceDirs(root)) for (const f of readdirSync(sd).filter((x) => x.endsWith('.json'))) {
      try { collect(JSON.parse(readFileSync(join(sd, f), 'utf8')).blocks) } catch { /* judged in its own pack */ }
    }
  }
  for (const t of SHOWN_ELSEWHERE) if (catalogue.get(t)?.own) COVERED.add(t)
}

const shown =[...catalogue.keys()].filter((n) => COVERED.has(n))
const exempt = [...catalogue.values()].filter((b) => b.id.startsWith(EXEMPT_FAMILY + '.')).length
for (const [name, block] of catalogue) {
  if (COVERED.has(name)) {
    if (block.own && block.id.startsWith(EXEMPT_FAMILY + '.')) {
      fail(
        block.file,
        `${block.id} is an integration app view and a pattern or surface places it — an integration renders nothing without its connection, so the placement is an inert preview lying about coverage`
      )
    }
    continue
  }
  if (block.id.startsWith(EXEMPT_FAMILY + '.')) continue
  if (!block.own) continue
  fail(
    block.file,
    `${block.id} is shipped but no pattern and no surface places it — nothing renders it, so nothing can see it break. ` +
      `Give it a home in a pattern or a showcase page, ` +
      `or, if it genuinely cannot render without a live connection, it is an integration.* block and belongs in that family.`
  )
}

console.log(`catalogue : ${catalogue.size} block(s) · ${ICONS ? ICONS.size : '?'} icon(s)`)
console.log(`patterns  : ${patternCount} file(s)`)
if (patternCount) {
  console.log(
    `wiring    : ${wiringCensus.wired} wired (${WIRING_FIELDS.join('|')}) · ${wiringCensus.layoutOnly} layoutOnly · ${wiringCensus.neither} neither` +
      (wiringCensus.neither ? (WIRING_STRICT ? ' — FAILED (--strict-wiring)' : ' — reported, not blocking (--strict-wiring fails them)') : '')
  )
}
console.log(`surfaces  : ${surfaceCount} file(s)`)
console.log(`scopes    : ${scopeAtomCount} connector/provider manifest(s)`)
console.log(
  `coverage  : ${shown.length}/${catalogue.size} block(s) placed by a pattern or surface · ${exempt} integration.* app view(s), exempt by family`
)

// ── theme atoms clear WCAG AA, in light AND in the derived dark mode ─────────
//
// The contrast check above only sees a surface's inline `theme`, and surfaces
// no longer carry one — so without this block no theme would be checked at
// all. White button ink under AA and a focus ring that disappears on its own
// dark ground are the two misses it exists for.
//
// A theme is also worn in DARK. Runtime and publish derive a dark variant for
// every themed surface (`deriveDarkTheme`, @media prefers-color-scheme:dark),
// and that derivation passes `textOnPrimary` and `focus.ringColor` through
// untouched. So those two are checked in both modes and fail in both: the pack
// is the only place their value comes from. The dark NEUTRALS (text, textMuted,
// background, card) are computed by the cascade, not written here — a miss
// there is reported as a warning naming the cascade, because no manifest value
// can fix it.
//
// The derivation is the engine's own (`deriveDarkTheme` from contracts),
// imported rather than restated: a second copy is how the dark mode in the
// editor and the dark mode on the published page came to disagree. This script stays
// zero-dependency: without an installed contracts package the dark half says
// it did not run instead of passing.
const THEME_TEXT_PAIRS = [
  ['text', 'background'],
  ['text', 'card'],
  ['textMuted', 'background'],
  ['textMuted', 'card'],
  ['textOnPrimary', 'primary'],
  // `error` is TEXT: the form's missing-field message and the required-field
  // asterisk paint with it, so it is held to the text line. The derived dark mode passes the hue
  // through untouched, so a dark-mode miss is the cascade's and only warns.
  ['error', 'background'],
  ['error', 'card'],
]

/**
 * The edge a form control draws (`CONTROL_BORDER` in blocks/_shared-utils.ts):
 * `controlBorder` when a theme declares one, else 80% of textMuted mixed into
 * border — the same srgb mix the browser computes for the color-mix(). The
 * divider colour alone sits far under 3:1 on the ground, and an
 * input's edge is the only thing that shows where the field is.
 */
const CONTROL_BORDER_MIX = 0.8
function controlBorderOf(c) {
  if (c.controlBorder) return c.controlBorder
  const m = hexToRgb(c.textMuted)
  const b = hexToRgb(c.border)
  if (!m || !b) return null
  return '#' + m.map((v, i) => Math.round(v * CONTROL_BORDER_MIX + b[i] * (1 - CONTROL_BORDER_MIX)).toString(16).padStart(2, '0')).join('')
}
/** Pairs whose value the pack alone decides, in either mode. */
const PACK_OWNED = new Set(['textOnPrimary'])
const THEME_TEXT_MIN = 4.5
const THEME_UI_MIN = 3

let themeAtomCount = 0
{
  const APPEARANCE = join(ATOMS, 'appearance')
  const themeFiles = existsSync(APPEARANCE)
    ? readdirSync(APPEARANCE)
        .filter((d) => existsSync(join(APPEARANCE, d, 'manifest.json')))
        .map((d) => join(APPEARANCE, d, 'manifest.json'))
    : []

  let contracts = null
  if (themeFiles.length) {
    try {
      contracts = await import('@pwfabric/contracts')
    } catch {
      contracts = null
    }
  }

  const colorsOf = (theme) => ({ ...(theme?.colors ?? {}) })

  const judge = (file, mode, theme) => {
    const c = colorsOf(theme)
    for (const [fg, bg] of THEME_TEXT_PAIRS) {
      const ratio = contrastRatio(c[fg], c[bg])
      if (ratio === null) continue
      if (ratio >= THEME_TEXT_MIN) continue
      const msg = `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 — below WCAG AA ${THEME_TEXT_MIN}:1 for text`
      if (mode === 'light' || PACK_OWNED.has(fg)) fail(file, msg)
      else warn(file, `${msg} (derived by the cascade's deriveDarkTheme, not by this manifest)`)
    }
    const edge = controlBorderOf(c)
    for (const bg of ['background', 'card']) {
      const ratio = contrastRatio(edge, c[bg])
      if (ratio === null || ratio >= THEME_UI_MIN) continue
      const msg = `${mode}: the form-control edge ${edge} on ${bg} is ${ratio.toFixed(2)}:1 — below the ${THEME_UI_MIN}:1 floor for a component boundary (WCAG 1.4.11)`
      if (mode === 'light') fail(file, msg)
      else warn(file, `${msg} (derived by the cascade's deriveDarkTheme, not by this manifest)`)
    }
    const ring = theme?.focus?.ringColor
    for (const bg of ['background', 'card']) {
      const ratio = contrastRatio(ring, c[bg])
      if (ratio === null) continue
      if (ratio < THEME_UI_MIN) {
        fail(file, `${mode}: focus.ringColor ${ring} on ${bg} is ${ratio.toFixed(2)}:1 — below the ${THEME_UI_MIN}:1 floor for a focus indicator (WCAG 1.4.11 / 2.4.11)`)
      }
    }
  }

  for (const path of themeFiles) {
    const file = rel(path)
    let atom
    try {
      atom = JSON.parse(readFileSync(path, 'utf8'))
    } catch (e) {
      fail(file, `unparseable — ${e.message}`)
      continue
    }
    if (atom.kind !== 'ui-appearance' || !atom.theme) continue
    themeAtomCount++
    if (!atom.theme.focus?.ringColor) {
      fail(file, 'theme.focus.ringColor is missing — the platform default ring is not this palette')
    }
    judge(file, 'light', atom.theme)
    if (contracts?.deriveDarkTheme && contracts?.DEFAULT_APPEARANCE_THEME) {
      // Merge over the platform baseline exactly as the runtime does before it
      // derives (appearance-resolver mergeThemeOverDefaults).
      const d = contracts.DEFAULT_APPEARANCE_THEME
      const merged = {}
      for (const k of new Set([...Object.keys(d), ...Object.keys(atom.theme)])) {
        merged[k] = { ...(d[k] ?? {}), ...(atom.theme[k] ?? {}) }
      }
      judge(file, 'derived dark', contracts.deriveDarkTheme(merged))
    }
  }
  if (themeFiles.length && !contracts?.deriveDarkTheme) {
    warn('atoms/appearance', 'derived dark mode NOT checked — @pwfabric/contracts is not installed (run pnpm install); light mode was checked')
  }
  if (themeAtomCount) {
    console.log(`themes    : ${themeAtomCount} appearance atom(s) · light${contracts?.deriveDarkTheme ? ' + derived dark' : ' only'} · text + error ≥${THEME_TEXT_MIN}:1, focus ring + control edge ≥${THEME_UI_MIN}:1`)
  }
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s) — reported, not blocking:`)
  for (const w of warnings) console.log('  ! ' + w)
}

// `mobileCollapse` is DERIVED from the chrome × body tables.
// A hand-written stamp is not a stamp — the texts were the cartesian product
// of the tables, and nobody noticed when copies drifted. Drift fails.
{
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  try {
    // Shells can live in more than one pack: the derivation checks the
    // patterns of the pack under test, not the base's.
    execFileSync('node', [join(here, 'derive-mobile-collapse.mjs'), '--check', '--pack', ROOT], { stdio: 'inherit' })
  } catch {
    problems.push('mobileCollapse has drifted from the derivation — see the list above')
  }
}

// ── the shell blocks carry the account control ───────────────────────────────
//
// Sign-in, the session control and sign-out drawn as DOM overlays on top of
// an app cover its own chrome (a fixed pill over the bottom bar's last tab)
// and offer no menu and no way out. The account control
// belongs to the app's own shell, themed like everything around it.
//
// The contract is shared with the runner (it injects `account` into whichever
// shell block the app declares) and the composer/validator (they read the
// manifest). So three things are checked, not one:
//   1. each shell block DECLARES `account` in its manifest, with the agreed
//      shape — a prop the manifest omits is dropped by the validator silently;
//   2. each shell block renders it through the ONE shared menu — three private
//      copies are three places for the keyboard/ARIA behaviour to drift;
//   3. the shared menu emits exactly the two action types the runner handles.
{
  const ACCOUNT_SHELLS = ['navbar', 'bottom-bar', 'app-rail']
  const ACCOUNT_FIELDS = ['state', 'name', 'email', 'avatarSrc', 'profileHref', 'profileLabel', 'links', 'signInLabel', 'signOutLabel']
  const SHARED_MENU = join(LIB, '_shared-account-menu.tsx')
  for (const type of ACCOUNT_SHELLS) {
    const block = catalogue.get(type)
    // SHELL BLOCKS SPAN PACKS: navbar and bottom-bar live in this pack,
    // app-rail in a pack built on it. A pack without app-rail in its closure never sees
    // it, and that is not a gap; a shell block really going missing is caught
    // by the gate that tracks per-pack counts.
    if (!block) continue
    // A shell block is accounted for by its OWNER, not by a pack that borrows it.
    if (!block.own) continue
    const schema = block.schema.get('account')
    if (!schema) {
      fail(block.file, `${block.id} declares no "account" prop — the runner injects it into every shell block, and an undeclared prop is dropped`)
    } else {
      const props = schema.properties ?? {}
      const missing = ACCOUNT_FIELDS.filter((f) => !(f in props))
      if (schema.type !== 'object' || missing.length) {
        fail(block.file, `${block.id} "account" schema is not the agreed shape — missing [${missing.join(', ')}]`)
      }
      const states = props.state?.enum ?? []
      if (states.join('|') !== 'signed-in|signed-out' || !(schema.required ?? []).includes('state')) {
        fail(block.file, `${block.id} "account.state" must be a required enum of signed-in | signed-out`)
      }
    }
    const component = join(BLOCKS, 'layout', type, 'component.tsx')
    if (existsSync(component) && !readFileSync(component, 'utf8').includes("from '../../../lib/_shared-account-menu.js'")) {
      fail(rel(component), `${block.id} does not render the shared account menu (_shared-account-menu.tsx)`)
    }
  }
  // The shared menu is a common part of the shell blocks; demanding it from a
  // pack that ships no shells would hold it to account for something it does not own.
  if (!existsSync(SHARED_MENU)) {
    if (catalogue.get('navbar')?.own) fail('atoms/lib/_shared-account-menu.tsx', 'the shared account menu is missing')
  } else {
    const src = readFileSync(SHARED_MENU, 'utf8')
    for (const action of ['auth:signIn', 'auth:signOut']) {
      if (!src.includes(`'${action}'`)) fail(rel(SHARED_MENU), `never emits the "${action}" action the runner handles`)
    }
  }
}

// ── a component must not hardcode a dead link ────────────────────────────────
//
// A component that renders a link to `#` puts a link to nowhere on every page
// that uses it, and a publish-time link check cannot name it: such checks walk
// RECEIPT props, and this address lives in the component.
//
// Checked HERE because this is the only place that reads component SOURCE, and
// checked across ALL blocks on purpose.
//
// An `href={expression}` is untouched: a value that flows from props is a
// receipt's business and the publish report does see those. Only a literal
// address written into the markup is refused. The pack's own answer to "no
// destination" is next door in `breadcrumb` — render a span, not a link.
{
  const DEAD = /href=("#"|'#')/
  const walkTsx = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walkTsx(full)
      else if (entry.name.endsWith('.tsx')) {
        readFileSync(full, 'utf8')
          .split(String.fromCharCode(10))
          .forEach((line, i) => {
            // Comment lines are skipped: prose that QUOTES the banned pattern
            // (including the note above) is not an occurrence of it.
            const t = line.trim()
            if (t.startsWith('*') || t.startsWith('//')) return
            if (DEAD.test(line)) {
              fail(
                rel(full),
                'line ' + (i + 1) + ' hardcodes a link to "#" — an address with no destination. ' +
                  'Render a <span> when there is nowhere to go (see blocks/control/breadcrumb), ' +
                  'or take the address as a prop.'
              )
            }
          })
      }
    }
  }
  // Own source only — a borrowed root's components are its own pack's to answer
  // for, and a patterns-only pack has no component source at all.
  for (const dir of [BLOCKS, LIB]) if (existsSync(dir)) walkTsx(dir)
}

// ── a relative import must resolve INSIDE its own pack ───────────────────────
//
// A block moved into another pack that still imports `../../_shared-utils.js`
// from FOUNDATION builds and passes every other check — and ships an archive
// whose block cannot compile, because the file is not in its pack.
//
// Nothing else here reads import specifiers: the catalogue check reads
// manifests, the composition checks read receipts, and the dead-link check
// reads component source but only for `href="#"`.
//
// This is not a style rule, it is the PUBLISH contract. A published tgz carries
// only the pack's OWN files (`export-tgz` walks `atoms/<part>` and `atoms/lib`),
// so a specifier that climbs out of the pack resolves on this disk and nowhere
// else. The answer is to copy the needed symbols into the pack (a catalogue
// can generate that copy and verify it still matches foundation).
//
// Own source only, and `--resolve-against` roots are deliberately exempt: a
// borrowed root is its own pack's to answer for.
{
  // `.d.ts` COUNTS AS RESOLVED. A declaration file is erased at build, so it
  // never needs to travel in the tgz — `atoms/lib/generated/active-project.d.ts` is
  // the pack's own example and the first version of this check called it a
  // defect.
  const CANDIDATES = (p) => [
    p,
    p.replace(/\.js$/, '.ts'), p.replace(/\.js$/, '.tsx'), p.replace(/\.js$/, '.d.ts'),
    p + '.ts', p + '.tsx', p + '.d.ts',
    join(p, 'index.ts'), join(p, 'index.tsx'),
  ]
  const walkSrc = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walkSrc(full); continue }
      // WHAT THE PACKAGER SKIPS, THIS SKIPS. `export-tgz`'s SKIP_EXT leaves
      // tests out of the tgz: a test that reaches an installation is dead
      // weight whose imports — another pack's bridge, a fixture — do not even
      // exist on the other side. A file that
      // never ships cannot break the publish contract, so reaching across the
      // boundary is exactly what a test is allowed to do.
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
      // Comment lines are skipped, exactly as the dead-link check below does:
      // `connectors/registry.ts` DOCUMENTS this very failure in prose, and a
      // scanner that reads its own explanation as an occurrence reports the
      // file that warns about the bug as the bug.
      const text = readFileSync(full, 'utf8')
        .split(String.fromCharCode(10))
        .filter((l) => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
        .join(String.fromCharCode(10))
      for (const m of text.matchAll(/\bfrom\s+'(\.[^']*)'/g)) {
        const target = resolve(dirname(full), m[1])
        // Outside the pack entirely — the clearest form of the defect.
        if (!target.startsWith(ATOMS)) {
          fail(rel(full), `imports '${m[1]}', which resolves OUTSIDE this pack. A published archive carries only this pack's files — copy what it needs into the pack.`)
          continue
        }
        if (CANDIDATES(target).some((c) => existsSync(c))) continue
        // A DECLARED DEPENDENCY MAY ANSWER — BUT NOT FOR A BLOCK. A pack can
        // require another, and non-atom source that glues engines together
        // (a connector tool, an auth provider) is read from the ONE catalogue
        // tree those packs are mounted into, never bundled on its own. Such an import resolves when a `--resolve-against`
        // root — every one of which the pack declares — carries the file at the
        // SAME path. A block is different: the server bundles each block atom
        // by itself (esbuild), so its imports must stay inside its own pack —
        // that is the defect this gate exists for, and it stays shut.
        const inPack = relative(ATOMS, target)
        const isBlock = relative(ATOMS, full).split(/[\\/]/)[0] === 'blocks'
        if (!isBlock && BORROWED.some((r) => CANDIDATES(join(atomsDir(r), inPack)).some((c) => existsSync(c)))) continue
        fail(rel(full), `imports '${m[1]}', which does not exist in this pack${isBlock ? '' : ' or at the same path in a declared dependency'}. Copy what it needs into the pack.`)
      }
    }
  }
  if (existsSync(ATOMS)) walkSrc(ATOMS)
}

// ── an identity method atom names a method the platform implements ───────────
//
// Sign-in methods are one atom each:
// `auth/<method>.knowledge.json`, classified by the platform as
// `{ kind: 'auth-provider', id: 'auth.<method>' }` — and ONLY when `<method>`
// is in contracts' closed `IDENTITY_METHODS`. Any other name is not
// classified at all: the file ships, installs nothing, and no app ever gains
// the method. The file name is the address, so the declared `method` and `name`
// must agree with it; a copy-pasted `password` body in `github.knowledge.json`
// would otherwise offer the wrong button under the right name.
//
// Mirrors contracts `IDENTITY_METHODS`; this script has no dependencies, so the
// list is restated — a new method is added here in the same change that ships
// its atom. `AuthProvider.knowledge.json` is the runtime atom (`auth`), not a
// method, and is left alone.
{
  const IDENTITY_METHODS = ['password', 'host', 'google', 'github', 'microsoft']
  const AUTH = familyDir(ROOT, 'auth')
  let methodAtoms = 0
  for (const f of existsSync(AUTH) ? readdirSync(AUTH).filter((x) => x.endsWith('.knowledge.json')) : []) {
    if (f === 'AuthProvider.knowledge.json') continue
    const file = rel(join(AUTH, f))
    const method = f.slice(0, -'.knowledge.json'.length)
    if (!IDENTITY_METHODS.includes(method)) {
      fail(file, `'${method}' is not an identity method (${IDENTITY_METHODS.join(' | ')}) — the platform does not classify it, so it ships and installs nothing`)
      continue
    }
    let a
    try { a = JSON.parse(readFileSync(join(AUTH, f), 'utf8')) } catch (e) { fail(file, `not valid JSON: ${e.message}`); continue }
    methodAtoms++
    if (a.method !== method) fail(file, `declares method '${a.method}' but the file name makes it '${method}'`)
    if (a.name !== `auth.${method}`) fail(file, `name must be 'auth.${method}' (the id the platform derives from the path), got '${a.name}'`)
    if (a.kind !== 'auth-provider') fail(file, `kind must be 'auth-provider', got '${a.kind}'`)
    if (!a.configSchema || !Array.isArray(a.configSchema.fields)) fail(file, 'configSchema.fields must be an array (empty when the method has nothing to configure)')
    checkKnowledge(file, a)
    if (typeof a.knowledge?.when !== 'string' || !a.knowledge.when.trim()) {
      fail(file, 'knowledge.when is missing — it is what lets a composer choose between methods')
    }
  }
  if (methodAtoms) console.log(`identity  : ${methodAtoms} method atom(s)`)
}

if (problems.length === 0) {
  console.log('\nPASS — every block resolves, and every pattern and surface agrees with the catalogue')
  process.exit(0)
}

console.log(`\nFAIL — ${problems.length} problem(s):`)
for (const p of problems) console.log('  x ' + p)
process.exit(1)
