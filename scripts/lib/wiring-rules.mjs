// The pattern WIRING rules. Most patterns carry none of `dataSources` /
// `behaviors` / `initialState`, and without a rule NOTHING tells the composer,
// an app builder or a reader which of them are layout by intent and which are
// a list page waiting for its data. Validating the SHAPE of a declared source
// never asks about absence, so a "wired pattern" would be an unmeasurable
// claim.
//
// Each rule here is a pure function over the parsed pattern JSON — zero
// dependencies, so check-integrity.mjs imports it and test/wiring-rules.test.ts
// proves every rule against a fixture that must report and one that must pass.
//
//   wired ⊕ layoutOnly     a pattern either carries wiring or declares
//                          `layoutOnly: true`; neither is reported (and fails
//                          under --strict-wiring), both is a
//                          contradiction and fails everywhere
//   stateKeyConstant       a literal `"stateKey": "x"` in the snippet is a
//                          pattern constant and must be seeded in
//                          `initialState.x`; a SLOT-valued stateKey cannot be
//                          seeded by name and is reported until the key is
//                          fixed (a state key is never a slot)
//   writesSeeded           every state key a behavior writes (`setState.key`)
//                          or a form binding writes (`statusKeys.*`) is seeded
//   formBindings           `{formId, sourceId, statusKeys}`: the form is a node
//                          of the snippet, the source is one of the pattern's
//                          dataSources, the status keys are the four the
//                          `form` block reads
//   slotTypes              a placeholder may be declared as an object
//                          `{description, type, optional?}`; `type` is one of
//                          SLOT_TYPES — the kinds the kits already distinguish
//                          (url, url-template, json-path, field, state-key)

export const WIRING_FIELDS = ['dataSources', 'behaviors', 'initialState', 'formBindings']

/**
 * What a slot is FOR, read by whoever fills it (composer `use-pattern`, a
 * pattern expander, a composer prompt's slot lines). `text` is the default a
 * bare string declaration means; the rest are the kinds the app kits' build
 * step tells apart.
 */
export const SLOT_TYPES = ['text', 'url', 'url-template', 'json-path', 'field', 'state-key']

/** The four status keys the `form` block binds (form/manifest.json 115, 135). */
export const STATUS_KEYS = ['loading', 'success', 'error', 'message']

const UPPER_TOKEN = /\{\{([A-Z0-9_]+)\}\}/g

/** True when the pattern carries any wiring field (declared at all, even empty). */
export function isWired(p) {
  return WIRING_FIELDS.some((f) => p?.[f] !== undefined)
}

/** `{{SLOT}}` tokens found anywhere in the wiring fields (not the snippet). */
export function wiringSlotTokens(p, into = new Set()) {
  for (const f of WIRING_FIELDS) {
    if (p?.[f] === undefined) continue
    for (const m of JSON.stringify(p[f]).matchAll(UPPER_TOKEN)) into.add(m[1])
  }
  return into
}

/**
 * `placeholders` normalised: `{ TOKEN: { description, type, optional, raw } }`.
 * A bare string is a `text` slot; an object declares its kind. `raw` keeps the
 * value as written so shape errors can name it.
 */
export function slotDeclarations(p) {
  const out = {}
  for (const [k, v] of Object.entries(p?.placeholders ?? {})) {
    const token = String(k).replace(/^\{\{|\}\}$/g, '')
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[token] = { description: v.description, type: v.type ?? 'text', optional: v.optional === true, raw: v }
    } else {
      out[token] = { description: v, type: 'text', optional: false, raw: v }
    }
  }
  return out
}

/** Every literal `"stateKey"` value in the snippet, split by whether it is a slot. */
export function stateKeysOf(snippet) {
  const text = JSON.stringify(snippet ?? {})
  const literal = []
  const slot = []
  for (const m of text.matchAll(/"stateKey"\s*:\s*"([^"]*)"/g)) {
    ;(/\{\{/.test(m[1]) ? slot : literal).push(m[1])
  }
  return { literal: [...new Set(literal)], slot: [...new Set(slot)] }
}

/**
 * The findings, each `{ rule, severity: 'fail' | 'warn', msg }`.
 * `strict` turns the `unwired` report into a failure (the eventual default,
 * and the positive control).
 */
export function wiringFindings(p, { strict = false } = {}) {
  const out = []
  const fail = (rule, msg) => out.push({ rule, severity: 'fail', msg })
  const warn = (rule, msg) => out.push({ rule, severity: 'warn', msg })
  const wired = isWired(p)
  const seeded = (k) => p.initialState && typeof p.initialState === 'object' && k in p.initialState

  // ── wired ⊕ layoutOnly ────────────────────────────────────────────────────
  if (p.layoutOnly !== undefined && p.layoutOnly !== true) {
    fail('layoutOnlyShape', `"layoutOnly" is ${JSON.stringify(p.layoutOnly)} — the marker is the literal true or absent; a false marker says nothing a missing one does not`)
  }
  if (p.layoutOnly === true && wired) {
    const carried = WIRING_FIELDS.filter((f) => p[f] !== undefined)
    fail('contradiction', `declares layoutOnly: true but carries ${carried.join(', ')} — a pattern is layout by intent OR it is wired; the marker exists so the composer does not expect data from a band that has none, and a wired band marked layout-only is taught wrong`)
  }
  if (p.layoutOnly !== true && !wired) {
    const msg = 'carries none of dataSources, behaviors, initialState or formBindings and does not declare layoutOnly: true — either wire it or declare it layout-only so composers stop expecting data from it'
    ;(strict ? fail : warn)('unwired', msg)
  }

  // ── stateKeyConstant ──────────────────────────────────────────────────────
  const { literal, slot } = stateKeysOf(p.snippet)
  for (const k of literal) {
    if (!seeded(k)) fail('stateKeyUnseeded', `snippet writes stateKey "${k}" but initialState does not seed "${k}" — a control that writes a key the surface never seeded binds undefined on the first render; a stateKey is a pattern constant, seed it`)
  }
  for (const k of slot) {
    warn('stateKeySlot', `snippet writes stateKey ${k} — a state key is a pattern constant, not a slot: the key cannot be seeded by name until the slot is fixed, and every control, chip and source that reads it must agree on the name`)
  }

  // ── writesSeeded: behaviors ───────────────────────────────────────────────
  if (Array.isArray(p.behaviors)) {
    p.behaviors.forEach((b, i) => {
      for (const [j, a] of (Array.isArray(b?.actions) ? b.actions : []).entries()) {
        if (a?.type === 'setState' && typeof a.key === 'string' && !seeded(a.key)) {
          fail('writeUnseeded', `behaviors[${i}].actions[${j}] writes state "${a.key}" but initialState does not seed it — a visibleWhen reading it binds undefined until the event fires`)
        }
      }
    })
  }

  // ── formBindings ──────────────────────────────────────────────────────────
  if (p.formBindings !== undefined) {
    if (!Array.isArray(p.formBindings)) {
      fail('formBindingsShape', '"formBindings" must be an array — the composer moves it into the platform/entities capability config as a list')
    } else {
      const ids = nodeIds(p.snippet)
      const sourceIds = new Set((Array.isArray(p.dataSources) ? p.dataSources : []).map((s) => s?.id))
      p.formBindings.forEach((fb, i) => {
        const at = `formBindings[${i}]`
        if (!fb || typeof fb !== 'object') { fail('formBindingsShape', `${at} is not an object`); return }
        if (typeof fb.formId !== 'string' || !fb.formId) fail('formBindingsShape', `${at}.formId is missing — a binding names the form it submits`)
        else if (!ids.has(fb.formId)) fail('formBindingsForm', `${at}.formId "${fb.formId}" is not a node id of the snippet — the expander substitutes {{ID}} in both places, so they must match textually`)
        if (typeof fb.sourceId !== 'string' || !fb.sourceId) fail('formBindingsShape', `${at}.sourceId is missing — a binding names the source (entity or rest) the form writes`)
        else if (!sourceIds.has(fb.sourceId)) fail('formBindingsSource', `${at}.sourceId "${fb.sourceId}" is not one of this pattern's dataSources — a form's counter source IS the one the form writes`)
        if (fb.statusKeys !== undefined) {
          if (!fb.statusKeys || typeof fb.statusKeys !== 'object' || Array.isArray(fb.statusKeys)) fail('formBindingsShape', `${at}.statusKeys must be an object`)
          else {
            for (const [k, v] of Object.entries(fb.statusKeys)) {
              if (!STATUS_KEYS.includes(k)) fail('formBindingsStatus', `${at}.statusKeys.${k} — the form block reads ${STATUS_KEYS.join(' | ')} and nothing else`)
              if (typeof v !== 'string' || !v) fail('formBindingsShape', `${at}.statusKeys.${k} must be a state key name`)
              else if (!seeded(v)) fail('writeUnseeded', `${at}.statusKeys.${k} writes state "${v}" but initialState does not seed it — the form's submittingWhen and the feedback card bind undefined until the first submit`)
            }
          }
        }
      })
    }
  }

  // ── slotTypes ─────────────────────────────────────────────────────────────
  for (const [token, d] of Object.entries(slotDeclarations(p))) {
    if (d.raw && typeof d.raw === 'object' && !Array.isArray(d.raw)) {
      if (typeof d.description !== 'string' || !d.description.trim()) fail('slotTypeShape', `placeholders {{${token}}} is an object with no "description" — the composer prints the description; without it the slot is a name and nothing else`)
      if (!SLOT_TYPES.includes(d.type)) fail('slotTypeUnknown', `placeholders {{${token}}}.type "${d.type}" — expected ${SLOT_TYPES.join(' | ')}`)
      if (d.raw.optional !== undefined && typeof d.raw.optional !== 'boolean') fail('slotTypeShape', `placeholders {{${token}}}.optional must be a boolean`)
    } else if (typeof d.raw !== 'string') {
      fail('slotTypeShape', `placeholders {{${token}}} is ${JSON.stringify(d.raw)} — a slot is declared as a description string or as {description, type, optional?}`)
    }
  }
  return out
}

function nodeIds(node, into = new Set()) {
  if (!node || typeof node !== 'object') return into
  if (typeof node.id === 'string') into.add(node.id)
  ;(node.children ?? []).forEach((c) => nodeIds(c, into))
  return into
}
