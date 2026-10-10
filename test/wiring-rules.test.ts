/**
 * The pattern wiring rules (scripts/lib/wiring-rules.mjs), each proven both
 * ways: the defective shape must be reported, the fixed shape must pass. The
 * same rules run inside scripts/check-integrity.mjs on every pack;
 * `--strict-wiring` is the positive control for the one rule that is still
 * only reported.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — a zero-dependency .mjs with no type declarations
import { wiringFindings, isWired, wiringSlotTokens, slotDeclarations, stateKeysOf, SLOT_TYPES } from '../scripts/lib/wiring-rules.mjs'

type Finding = { rule: string; severity: 'fail' | 'warn'; msg: string }
const rules = (p: unknown, opts?: { strict?: boolean }) => (wiringFindings(p, opts) as Finding[]).map((f) => `${f.severity}:${f.rule}`)

const section = (children: unknown[] = []) => ({ id: '{{ID}}', type: 'section', props: {}, children })

// A static band with no wiring field and no marker.
const hero = { name: 'hero', role: 'band', placeholders: { '{{HEADLINE}}': 'main heading' }, snippet: section([{ id: '{{ID}}-h', type: 'heading', props: { text: '{{HEADLINE}}' } }]) }

describe('wired ⊕ layoutOnly', () => {
  it('reports a pattern that is neither, and fails it under strict', () => {
    expect(rules(hero)).toEqual(['warn:unwired'])
    expect(rules(hero, { strict: true })).toEqual(['fail:unwired'])
  })
  it('passes the marker, and passes wiring', () => {
    expect(rules({ ...hero, layoutOnly: true })).toEqual([])
    expect(rules({ ...hero, initialState: {} })).toEqual([])
    expect(isWired({ ...hero, initialState: {} })).toBe(true)
    expect(isWired(hero)).toBe(false)
  })
  it('fails the contradiction and a non-literal marker', () => {
    expect(rules({ ...hero, layoutOnly: true, dataSources: [] })).toEqual(['fail:contradiction'])
    expect(rules({ ...hero, layoutOnly: false })).toEqual(['fail:layoutOnlyShape', 'warn:unwired'])
  })
})

describe('stateKey is a pattern constant', () => {
  // A settings form: segmented-control stateKey "density", initialState {submitting:false}.
  const form = (initialState: Record<string, unknown>) => ({
    ...hero,
    initialState,
    snippet: section([{ id: '{{ID}}-d', type: 'segmented-control', props: { name: 'density', stateKey: 'density' } }]),
  })
  it('fails a literal stateKey the pattern never seeds', () => {
    expect(rules(form({ submitting: false }))).toEqual(['fail:stateKeyUnseeded'])
  })
  it('passes once initialState seeds it', () => {
    expect(rules(form({ submitting: false, density: '' }))).toEqual([])
  })
  it('reports a slot-valued stateKey (cannot be seeded by name) without failing', () => {
    const p = { ...hero, initialState: {}, placeholders: { '{{SEARCH_STATE_KEY}}': 'state key' }, snippet: section([{ id: '{{ID}}-s', type: 'input', props: { stateKey: '{{SEARCH_STATE_KEY}}' } }]) }
    expect(rules(p)).toEqual(['warn:stateKeySlot'])
    expect(stateKeysOf(p.snippet)).toEqual({ literal: [], slot: ['{{SEARCH_STATE_KEY}}'] })
  })
})

describe('every written key is seeded', () => {
  const withBehavior = (initialState: Record<string, unknown>) => ({
    ...hero,
    initialState,
    behaviors: [{ id: '{{ID}}-on-save', event: 'form:submit', targetBlockId: '{{ID}}-form', actions: [{ type: 'setState', key: 'submitted', value: true }] }],
  })
  it('fails a behavior writing an unseeded key, passes a seeded one', () => {
    expect(rules(withBehavior({}))).toEqual(['fail:writeUnseeded'])
    expect(rules(withBehavior({ submitted: false }))).toEqual([])
  })
})

describe('formBindings — the kit shape (ladder.entity-write build.mjs:181)', () => {
  const ladder = (fb: Record<string, unknown>, initialState: Record<string, unknown> = { sendLoading: false, sendSuccess: false, sendError: false, sendMessage: '' }) => ({
    ...hero,
    initialState,
    dataSources: [{ id: 'records', kind: 'entity', entityType: '{{ENTITY}}' }],
    formBindings: [fb],
    placeholders: { ...hero.placeholders, '{{ENTITY}}': 'entity type' },
    snippet: section([{ id: '{{ID}}-form', type: 'form', props: {}, children: [] }]),
  })
  const good = { formId: '{{ID}}-form', sourceId: 'records', statusKeys: { loading: 'sendLoading', success: 'sendSuccess', error: 'sendError', message: 'sendMessage' } }

  it('passes the kit binding', () => {
    expect(rules(ladder(good))).toEqual([])
  })
  it('fails a form the snippet does not contain', () => {
    expect(rules(ladder({ ...good, formId: '{{ID}}-other' }))).toEqual(['fail:formBindingsForm'])
  })
  it('fails a source the pattern does not declare', () => {
    expect(rules(ladder({ ...good, sourceId: 'items' }))).toEqual(['fail:formBindingsSource'])
  })
  it('fails a status key the form block does not read, and an unseeded one', () => {
    expect(rules(ladder({ ...good, statusKeys: { busy: 'sendLoading' } }))).toEqual(['fail:formBindingsStatus'])
    expect(rules(ladder(good, { sendLoading: false }))).toEqual(['fail:writeUnseeded', 'fail:writeUnseeded', 'fail:writeUnseeded'])
  })
  it('fails a non-array', () => {
    expect(rules({ ...hero, formBindings: {} })).toEqual(['fail:formBindingsShape'])
  })
})

describe('typed slots', () => {
  it('a bare string is a text slot; an object declares its kind', () => {
    const d = slotDeclarations({ placeholders: { '{{TITLE}}': 'heading', '{{COLLECTION}}': { description: 'REST collection URL', type: 'url' }, '{{RETURNS}}': { description: 'rows path', type: 'json-path', optional: true } } })
    expect(d.TITLE).toMatchObject({ description: 'heading', type: 'text', optional: false })
    expect(d.COLLECTION).toMatchObject({ type: 'url', optional: false })
    expect(d.RETURNS).toMatchObject({ type: 'json-path', optional: true })
  })
  it('passes every declared kind, fails an unknown one and a missing description', () => {
    for (const type of SLOT_TYPES as string[]) {
      expect(rules({ ...hero, layoutOnly: true, placeholders: { '{{X}}': { description: 'x', type } } })).toEqual([])
    }
    expect(rules({ ...hero, layoutOnly: true, placeholders: { '{{X}}': { description: 'x', type: 'colour' } } })).toEqual(['fail:slotTypeUnknown'])
    expect(rules({ ...hero, layoutOnly: true, placeholders: { '{{X}}': { type: 'url' } } })).toEqual(['fail:slotTypeShape'])
    expect(rules({ ...hero, layoutOnly: true, placeholders: { '{{X}}': 3 } })).toEqual(['fail:slotTypeShape'])
  })
})

describe('slots inside wiring fields', () => {
  it('finds the uppercase tokens a source carries', () => {
    const p = { dataSources: [{ id: 'items', kind: 'rest', endpoint: '{{COLLECTION}}?limit={{PAGE_SIZE}}&skip={{state.skip}}', returns: '{{RETURNS}}' }], initialState: { skip: 0 } }
    expect([...wiringSlotTokens(p)].sort()).toEqual(['COLLECTION', 'PAGE_SIZE', 'RETURNS'])
    expect([...wiringSlotTokens({ snippet: { props: { x: '{{NOT_SCANNED}}' } } })]).toEqual([])
  })
})
