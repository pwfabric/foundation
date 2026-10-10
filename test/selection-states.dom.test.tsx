/**
 * Selected states and theme-driven sizes:
 *
 *   badge: primary is filled with an ink edge, default is empty; variantMap
 *   segmented-control: the selected pill is filled, aria-checked is right;
 *     boolean mode and "nothing selected"
 *   destructive button ink by the error fill
 *   text follows the theme body size; card and badge corners from the theme
 *   motion tokens: normal / slow / bounce reach the blocks
 *   shells: the frame escapes the measure box, content sits in a measured,
 *     guttered container, the slot still works
 *   split-view: field mapping, no forced first selection
 *   repeater: wrapping chip layout
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { BadgeBlock, resolveBadgeVariant } from '../atoms/blocks/control/badge/component.js'
import { SegmentedControlBlock } from '../atoms/blocks/form/segmented-control/component.js'
import { FormBlock } from '../atoms/blocks/form/form/component.js'
import { ButtonBlock } from '../atoms/blocks/control/button/component.js'
import { TextBlock, textDefinition, textPropsSchema } from '../atoms/blocks/text/text/component.js'
import { CardBlock } from '../atoms/blocks/container/card/component.js'
import { AccordionBlock } from '../atoms/blocks/container/accordion/component.js'
import { ToastBlock } from '../atoms/blocks/feedback/toast/component.js'
import { SplitViewBlock, toSplitItems } from '../atoms/blocks/layout/split-view/component.js'
import { RepeaterBlock } from '../atoms/blocks/data/repeater/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>
type Ev = { type: string; payload?: Record<string, unknown> }
const LIVE = { interactionMode: 'live' }

function el(
  C: unknown,
  id: string,
  type: string,
  props: Record<string, unknown>,
  children?: React.ReactNode,
  context: Record<string, unknown> = LIVE,
) {
  const Comp = C as AnyBlock
  return (
    <Comp key={id} props={props} block={{ id, type, props, layout: {} }} context={context}>
      {children}
    </Comp>
  )
}

function mount(tree: React.ReactNode): { events: Ev[]; container: HTMLElement } {
  const events: Ev[] = []
  const { container } = render(
    <BehaviorSurfaceProvider surfaceId="t" onEvent={(e) => events.push(e as Ev)}>
      {tree}
    </BehaviorSurfaceProvider>,
  )
  return { events, container }
}

const styleOf = (node: Element | null): string => (node as HTMLElement | null)?.getAttribute('style') ?? ''
const changes = (events: Ev[]) => events.filter((e) => e.type === 'input:change')

// ── badge ───────────────────────────────────────────────────────────────

describe('the selected badge is a different KIND, not a shade', () => {
  it('primary is filled in the brand with the on-primary ink and a 2px ink edge', () => {
    const { container } = render(el(BadgeBlock, 'b', 'badge', { text: '1', variant: 'primary' }))
    const s = (container.firstChild as HTMLElement).style
    expect(s.backgroundColor).toBe('var(--pw-color-primary)')
    expect(s.color).toBe('var(--pw-color-text-on-primary)')
    expect(s.boxShadow).toContain('inset 0 0 0 2px var(--pw-color-primary-ink')
  })
  it('default is empty: transparent, a control edge, muted ink', () => {
    const { container } = render(el(BadgeBlock, 'b', 'badge', { text: '2' }))
    const s = (container.firstChild as HTMLElement).style
    expect(s.backgroundColor).toBe('transparent')
    expect(s.color).toBe('var(--pw-color-text-muted)')
    expect(s.boxShadow).toContain('--pw-color-control-border')
  })
  it('status variants keep their tint and gain an edge', () => {
    const { container } = render(el(BadgeBlock, 'b', 'badge', { text: 'ok', variant: 'success' }))
    expect(styleOf(container.firstChild as Element)).toContain('inset 0 0 0 1px')
  })
})

describe('a status badge bound to data picks its variant per value (keys match case-insensitively, Turkish casing included)', () => {
  const map = { Doldu: 'error', 'Kayıt açık': 'success', '*': 'default' }
  it('exact, then case/space-insensitive, then "*", then variant', () => {
    expect(resolveBadgeVariant({ text: 'Doldu', variantMap: map })).toBe('error')
    expect(resolveBadgeVariant({ text: '  kayıt   AÇIK ', variantMap: map })).toBe('success')
    expect(resolveBadgeVariant({ text: 'Bekliyor', variantMap: map })).toBe('default')
    expect(resolveBadgeVariant({ text: 'Bekliyor', variant: 'info', variantMap: { Doldu: 'error' } })).toBe('info')
  })
  it('matches English keys case-insensitively too (I is not read as Turkish ı)', () => {
    const en = { Info: 'info', Open: 'success', Closed: 'error' }
    expect(resolveBadgeVariant({ text: 'info', variantMap: en })).toBe('info')
    expect(resolveBadgeVariant({ text: 'INFO', variantMap: en })).toBe('info')
    expect(resolveBadgeVariant({ text: ' open ', variantMap: en })).toBe('success')
    expect(resolveBadgeVariant({ text: 'CLOSED', variantMap: en })).toBe('error')
  })
  it('`status` is the key when given, so the label and the value may differ', () => {
    expect(resolveBadgeVariant({ text: 'Full', status: 'closed', variantMap: { closed: 'error' } })).toBe('error')
    expect(resolveBadgeVariant({ text: 'Full', status: true, variantMap: { true: 'warning' } })).toBe('warning')
  })
  it('an unknown variant in the map is ignored', () => {
    expect(resolveBadgeVariant({ text: 'x', variant: 'primary', variantMap: { x: 'solid' } })).toBe('primary')
  })
  it('two rows of the same badge render in two variants', () => {
    render(
      <>
        {el(BadgeBlock, 'r1', 'badge', { text: 'Doldu', variantMap: map })}
        {el(BadgeBlock, 'r2', 'badge', { text: 'Kayıt açık', variantMap: map })}
      </>,
    )
    expect(screen.getByText('Doldu').getAttribute('style')).toContain('--pw-color-error')
    expect(screen.getByText('Kayıt açık').getAttribute('style')).toContain('--pw-color-success')
  })
})

// ── segmented-control selected state ────────────────────────────────────

const pills = (container: HTMLElement) => Array.from(container.querySelectorAll('[role="radio"]')) as HTMLElement[]

describe('the selected pill is filled and announced', () => {
  it('selected: brand fill, on-primary ink, 2px ink edge; the others transparent and muted', () => {
    const { container } = mount(
      el(SegmentedControlBlock, 's', 'segmented-control', { options: [{ label: 'All', value: 'all' }, { label: 'Open', value: 'open' }] }),
    )
    const [on, off] = pills(container)
    expect(on!.style.background).toBe('var(--pw-color-primary, #18181b)')
    expect(on!.style.color).toBe('var(--pw-color-text-on-primary, #ffffff)')
    expect(on!.style.boxShadow).toContain('inset 0 0 0 2px var(--pw-color-primary-ink')
    expect(off!.style.background).toBe('transparent')
    expect(off!.style.color).toBe('var(--pw-color-text-muted, #71717a)')
  })
  it('aria-checked is "true" on the lit pill and "false" on the rest, before and after a click', () => {
    const { container } = mount(
      el(SegmentedControlBlock, 's', 'segmented-control', { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }),
    )
    expect(pills(container).map((p) => p.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    fireEvent.click(pills(container)[1]!)
    expect(pills(container).map((p) => p.getAttribute('aria-checked'))).toEqual(['false', 'true'])
  })
})

// ── segmented-control boolean mode and "nothing selected" ─────────────

const yesNo = [
  { label: 'Evet', value: true },
  { label: 'No', value: false },
]

describe('boolean mode writes real booleans', () => {
  it('true/false options write true/false to state, not "true"/"false"', () => {
    const { container, events } = mount(el(SegmentedControlBlock, 'k', 'segmented-control', { options: yesNo, stateKey: 'coming' }))
    // Seed on mount: the shown answer (the first option) as a boolean.
    expect(changes(events)[0]?.payload?.action).toEqual({ type: 'setState', key: 'coming', value: true })
    fireEvent.click(pills(container)[1]!)
    const last = changes(events).at(-1)!
    expect(last.payload?.value).toBe(false)
    expect(last.payload?.action).toEqual({ type: 'setState', key: 'coming', value: false })
  })
  it('valueType: "boolean" turns "true"/"false" text options into booleans too', () => {
    const { container, events } = mount(
      el(SegmentedControlBlock, 'k', 'segmented-control', {
        options: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }],
        valueType: 'boolean',
      }),
    )
    fireEvent.click(pills(container)[1]!)
    expect(changes(events).at(-1)?.payload?.value).toBe(false)
  })
  it('a bound value `false` lights the "no" option', () => {
    const { container } = mount(el(SegmentedControlBlock, 'k', 'segmented-control', { options: yesNo, value: false }))
    expect(pills(container).map((p) => p.getAttribute('aria-checked'))).toEqual(['false', 'true'])
  })
  it('inside form.form the answer is submitted as a boolean', async () => {
    const { container, events } = mount(
      el(FormBlock, 'f', 'form', { submitLabel: 'Send' }, el(SegmentedControlBlock, 'k', 'segmented-control', { name: 'attending', options: yesNo })),
    )
    const hidden = container.querySelector('input[type=hidden][name=attending]') as HTMLInputElement
    expect(hidden.dataset.pwValueType).toBe('boolean')
    fireEvent.click(pills(container)[1]!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    const submit = events.find((e) => e.type === 'form:submit')
    expect((submit?.payload?.values as Record<string, unknown>).attending).toBe(false)
  })
  it('text options stay text', () => {
    const { container, events } = mount(
      el(SegmentedControlBlock, 't', 'segmented-control', { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }),
    )
    fireEvent.click(pills(container)[1]!)
    expect(changes(events).at(-1)?.payload?.value).toBe('b')
    expect(container.querySelector('input[type=hidden]')).toBeNull()
  })
})

describe('"nothing selected"', () => {
  it('allowNone: no pill is lit, the state seed is empty, the lit pill clears on a second click', () => {
    const { container, events } = mount(
      el(SegmentedControlBlock, 'n', 'segmented-control', { options: yesNo, allowNone: true, stateKey: 'answer', name: 'answer' }),
    )
    expect(pills(container).every((p) => p.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(changes(events)[0]?.payload?.action).toEqual({ type: 'setState', key: 'answer', value: null })
    expect((container.querySelector('input[type=hidden]') as HTMLInputElement).value).toBe('')
    fireEvent.click(pills(container)[0]!)
    expect(changes(events).at(-1)?.payload?.value).toBe(true)
    fireEvent.click(pills(container)[0]!)
    expect(changes(events).at(-1)?.payload?.value).toBe(null)
    expect(pills(container).every((p) => p.getAttribute('aria-checked') === 'false')).toBe(true)
  })
  it('a one-option control (a consent pill) starts unselected — its gate is not open for everyone', () => {
    const { container, events } = mount(
      el(SegmentedControlBlock, 'c', 'segmented-control', { options: [{ label: 'I agree', value: true }], stateKey: 'consent' }),
    )
    expect(pills(container)[0]!.getAttribute('aria-checked')).toBe('false')
    expect(changes(events)[0]?.payload?.action).toEqual({ type: 'setState', key: 'consent', value: null })
  })
  it('without allowNone an unmatched value still falls back to the first option', () => {
    const { container } = mount(el(SegmentedControlBlock, 'x', 'segmented-control', { options: yesNo, value: 'nope' }))
    expect(pills(container)[0]!.getAttribute('aria-checked')).toBe('true')
  })
})

// ── destructive ink ─────────────────────────────────────────────────────

describe('the destructive label is inked by the error fill, not the brand', () => {
  it('reads --pw-color-on-error first, then black/white by the error luminance', () => {
    const { container } = mount(el(ButtonBlock, 'd', 'button', { label: 'Sil', variant: 'destructive' }))
    const style = styleOf(container.querySelector('button'))
    expect(style).not.toContain('color: var(--pw-color-text-on-primary)')
    expect(style).toContain('var(--pw-color-on-error, color(from var(--pw-color-error) srgb-linear')
  })
})

// ── theme sizes ────────────────────────────────────────────────────────

describe('hard-coded sizes follow the theme', () => {
  it('text declares no 14px default — not in the schema, the definition or the manifest', () => {
    expect(textPropsSchema.parse({ content: 'x' }).fontSize).toBeUndefined()
    expect(textDefinition.defaultProps).not.toHaveProperty('fontSize')
    const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'atoms', 'blocks', 'text', 'text', 'manifest.json'), 'utf8'))
    expect(manifest.definition.defaultProps).not.toHaveProperty('fontSize')
  })
  it('text with no fontSize takes the theme body size, not 14px', () => {
    const { container } = render(el(TextBlock, 't', 'text', { content: 'Merhaba' }))
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('var(--pw-font-size-base)')
  })
  it('an explicit fontSize still wins', () => {
    const { container } = render(el(TextBlock, 't', 'text', { content: 'x', fontSize: 20 }))
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('20px')
  })
  it('card corner is the theme large radius', () => {
    const { container } = render(el(CardBlock, 'c', 'card', {}, 'x'))
    expect((container.firstChild as HTMLElement).style.borderRadius).toBe('var(--pw-border-radius-lg, 8px)')
  })
  it('badge corners come from the theme scale', () => {
    const { container: a } = render(el(BadgeBlock, 'a', 'badge', { text: 'a' }))
    const { container: b } = render(el(BadgeBlock, 'b', 'badge', { text: 'b', rounded: true }))
    expect((a.firstChild as HTMLElement).style.borderRadius).toBe('var(--pw-border-radius-sm, 4px)')
    expect((b.firstChild as HTMLElement).style.borderRadius).toBe('var(--pw-border-radius-full, 9999px)')
    expect(styleOf(a.firstChild as Element)).not.toContain('font-size: 13px')
  })
})

// ── motion tokens ───────────────────────────────────────────────────────

describe('the motion tokens reach the blocks', () => {
  it('button: colour at normal, a press/lift on the bounce easing', () => {
    const { container } = mount(el(ButtonBlock, 'b', 'button', { label: 'Tamam' }))
    const t = (container.querySelector('button') as HTMLElement).style.transition
    expect(t).toContain('var(--pw-duration-normal')
    expect(t).toContain('var(--pw-easing-bounce')
    expect(t).not.toContain('all var(--pw-duration-fast)')
  })
  it('card: normal + bounce', () => {
    const { container } = render(el(CardBlock, 'c', 'card', {}, 'x'))
    const t = (container.firstChild as HTMLElement).style.transition
    expect(t).toContain('var(--pw-duration-normal')
    expect(t).toContain('var(--pw-easing-bounce')
  })
  it('accordion: the panel opens at slow, the chevron springs', () => {
    const { container } = render(
      el(AccordionBlock, 'a', 'accordion', { items: [{ id: 'q1', title: 'Soru', content: 'Cevap' }] }),
    )
    expect(container.innerHTML).toContain('var(--pw-duration-slow')
    expect(container.innerHTML).toContain('var(--pw-easing-bounce')
  })
  it('toast: enters on slow + bounce', () => {
    const { container } = mount(el(ToastBlock, 't', 'toast', { message: 'Kaydedildi' }))
    const s = (container.querySelector('[data-block-type="toast"]') as HTMLElement).style.animation
    expect(s).toContain('pw-toast-in')
    expect(s).toContain('var(--pw-duration-slow')
    expect(s).toContain('var(--pw-easing-bounce')
  })
  it('segmented: the selection moves at normal', () => {
    const { container } = mount(el(SegmentedControlBlock, 's', 'segmented-control', { options: [{ label: 'A', value: 'a' }] , allowNone: false }))
    expect(pills(container)[0]!.style.transition).toContain('var(--pw-duration-normal')
  })
})

// ── shells ──────────────────────────────────────────────────────────────

const PATTERNS = join(dirname(fileURLToPath(import.meta.url)), '..', 'atoms', 'patterns')
type Node = { id: string; type: string; props?: Record<string, unknown>; layout?: Record<string, unknown>; style?: Record<string, unknown>; children?: Node[] }
const shells = readdirSync(PATTERNS)
  .filter((f) => f.startsWith('shell-') && f.endsWith('.json'))
  .map((f) => ({ f, atom: JSON.parse(readFileSync(join(PATTERNS, f), 'utf8')) as { snippet: Node; chrome: string } }))

/** The slot the pattern expander fills: the first node whose `children` is an empty array. */
function findSlot(n: Node): Node | null {
  if (Array.isArray(n.children) && n.children.length === 0) return n
  for (const c of n.children ?? []) {
    const hit = findSlot(c)
    if (hit) return hit
  }
  return null
}
function pathTo(n: Node, target: Node, trail: Node[] = []): Node[] | null {
  if (n === target) return [...trail, n]
  for (const c of n.children ?? []) {
    const hit = pathTo(c, target, [...trail, n])
    if (hit) return hit
  }
  return null
}
const CHROME_TYPES = ['navbar', 'bottom-bar']

describe('shells: the frame escapes the measure box, content is measured and guttered', () => {
  it('there are 8 foundation shells', () => {
    expect(shells).toHaveLength(8)
  })
  it.each(shells)('$f: the shell root is viewport-scoped at every width (navbar top = 0, full width)', ({ atom }) => {
    // The runtime lifts only TOP-LEVEL blocks whose widthScope is viewport
    // out of the padded 1280px box (renderer chunkByWidthScope); the shell is
    // the top-level block, so the scope must sit on its root.
    expect((atom.snippet.layout?.widthScope as Record<string, string>)?.xs).toBe('viewport')
  })
  it.each(shells)('$f: chrome sits on the root; the slot sits in a measured, guttered container', ({ atom }) => {
    const root = atom.snippet
    const all = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap(all)]
    const chrome = all(root).filter((c) => CHROME_TYPES.includes(c.type))
    // Every navbar / bottom-bar is a DIRECT child of the root: full width.
    for (const c of chrome) expect(root.children).toContain(c)
    const slot = findSlot(root)!
    expect(slot.id).toBe('{{ID}}-main')
    const trail = pathTo(root, slot)!
    const measured = trail.find((n) => typeof n.style?.paddingInline === 'string')
    expect(measured, 'a container between the root and the slot carries the gutter').toBeDefined()
    // ≥ 16px on a phone, the theme layout padding on desktop.
    expect(measured!.style!.paddingInline).toBe('max(16px, var(--pw-layout-surface-padding, 24px))')
    expect(measured!.style!.maxWidth).toBe('var(--pw-layout-container-max-width, 1280px)')
    expect(measured!.style!.marginInline).toBe('auto')
    expect(measured!.style!.width).toBe('100%')
    // No chrome inside the measured box.
    const inside = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap(inside)]
    expect(inside(measured!).some((n) => CHROME_TYPES.includes(n.type))).toBe(false)
  })
})

// ── split-view ─────────────────────────────────────────────────────────

const records = [
  { code: 'b1', heading: 'Welcome', content: 'Hello and welcome.', summary: 'The first section' },
  { code: 'b2', heading: 'Rules', content: 'The rules.' },
]

describe('split-view reads the record fields it is told to', () => {
  it('toSplitItems maps through the *Key props, dotted paths included', () => {
    expect(toSplitItems(records, { idKey: 'code', titleKey: 'heading', bodyKey: 'content', excerptKey: 'summary' })[0]).toEqual({
      id: 'b1',
      title: 'Welcome',
      meta: undefined,
      excerpt: 'The first section',
      body: 'Hello and welcome.',
      entries: undefined,
    })
    expect(toSplitItems([{ data: { t: 'X' }, id: 7 }], { titleKey: 'data.t' })[0]).toMatchObject({ id: '7', title: 'X' })
  })
  it('renders the mapped title and body', () => {
    render(el(SplitViewBlock, 'sv', 'split-view', { items: records, idKey: 'code', titleKey: 'heading', bodyKey: 'content' }))
    expect(screen.getAllByText('Welcome').length).toBeGreaterThan(0)
    expect(screen.getByText('Hello and welcome.')).toBeTruthy()
  })
  it('the old item shape still works without keys', () => {
    render(el(SplitViewBlock, 'sv', 'split-view', { items: [{ id: 'a', title: 'A', body: 'Body A' }] }))
    expect(screen.getByText('Body A')).toBeTruthy()
  })
})

describe('split-view does not force the first selection', () => {
  it('with an emptyLabel nothing is selected and the prompt shows', () => {
    const { container } = render(
      el(SplitViewBlock, 'sv', 'split-view', { items: records, titleKey: 'heading', bodyKey: 'content', emptyLabel: 'Pick a section on the left', selectionKey: 'p11a' }),
    )
    expect(screen.getByText('Pick a section on the left')).toBeTruthy()
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(0)
    expect(screen.queryByText('Hello and welcome.')).toBeNull()
  })
  it('autoSelect: false without a label leaves the detail empty until a pick; a pick selects', () => {
    const { container } = render(
      el(SplitViewBlock, 'sv', 'split-view', { items: records, titleKey: 'heading', bodyKey: 'content', autoSelect: false, selectionKey: 'p11b' }),
    )
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('option', { name: /Rules/ }))
    expect(screen.getByText('The rules.')).toBeTruthy()
  })
  it('by default (no emptyLabel) the first row is selected, as before', () => {
    render(el(SplitViewBlock, 'sv', 'split-view', { items: records, titleKey: 'heading', bodyKey: 'content', selectionKey: 'p11c' }))
    expect(screen.getByText('Hello and welcome.')).toBeTruthy()
  })
  it('no English filler reaches the visitor', () => {
    const { container } = render(el(SplitViewBlock, 'sv', 'split-view', { items: records, autoSelect: false, selectionKey: 'p11d' }))
    expect(container.textContent).not.toContain('Select a record on the left.')
  })
})

// ── repeater chips ─────────────────────────────────────────────────────

describe('repeater layout "inline" wraps its items as chips', () => {
  const tags = [
    { id: 't1', heading: 'Seramik' },
    { id: 't2', heading: 'Workshop', href: '/workshop' },
    { id: 't3', heading: 'Kids' },
  ]
  it('the wrapper is a wrapping row and every item is a chip', () => {
    const { container } = render(el(RepeaterBlock, 'r', 'repeater', { items: tags, layout: 'inline', ctaHrefField: 'href' }))
    const wrap = container.firstChild as HTMLElement
    expect(wrap.style.display).toBe('flex')
    expect(wrap.style.flexWrap).toBe('wrap')
    expect(container.querySelectorAll('[data-repeater-chip]')).toHaveLength(3)
    expect((screen.getByText('Workshop') as HTMLAnchorElement).getAttribute('href')).toBe('/workshop')
    expect(screen.getByText('Seramik').getAttribute('style')).toContain('var(--pw-border-radius-full')
  })
  it('template children (repeat) wrap the same way', () => {
    const { container } = render(
      el(RepeaterBlock, 'r', 'repeater', { layout: 'inline' }, [
        el(BadgeBlock, 'b--0', 'badge', { text: 'A' }),
        el(BadgeBlock, 'b--1', 'badge', { text: 'B' }),
      ]),
    )
    expect((container.firstChild as HTMLElement).style.flexWrap).toBe('wrap')
  })
})
