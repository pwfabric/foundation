/**
 * Three defects, each proven by a describe block that fails without the fix.
 *
 * Brand slot — an image-only brand in `shell-none-flow` drew a dashed
 *   "⊟ Image" box where an app without a logo should show its name, and the
 *   bottom-bar shells had no brand at all.
 * split-view — the detail body scrolled alone and the action area sat
 *   below it in an `overflow: hidden` box: 2713px of app in a 619px window.
 *   On a phone only the list was shown, and with an empty list nothing could
 *   open the detail — an empty sidebar and no app.
 * segmented-control — a required yes/no answer failed with "Required": the
 *   hidden input carried a value no pill showed (the label written as the
 *   value, a boolean option), or kept its first value after the bound
 *   `value` changed.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { BehaviorSurfaceProvider, resolveBlockExpressions } from '@pwfabric/runtime'
import type { Block } from '@pwfabric/core'
import { FormBlock } from '../atoms/blocks/form/form/component.js'
import { SegmentedControlBlock } from '../atoms/blocks/form/segmented-control/component.js'
import { SplitViewBlock } from '../atoms/blocks/layout/split-view/component.js'
import { ImageBlock } from '../atoms/blocks/media/image/component.js'

const here = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // split-view projects its selection onto the URL; one test's choice must not
  // become the next test's selection.
  window.history.replaceState(null, '', '/')
})

type AnyBlock = React.FC<Record<string, unknown>>
type Ev = { type: string; payload?: Record<string, unknown> }

function el(C: unknown, id: string, type: string, props: Record<string, unknown>, children?: React.ReactNode, context?: Record<string, unknown>) {
  const Comp = C as AnyBlock
  return (
    <Comp key={id} props={props} block={{ id, type, props, layout: {} }} context={context}>
      {children}
    </Comp>
  )
}

function mount(tree: React.ReactNode): { events: Ev[]; rerender: (t: React.ReactNode) => void } {
  const events: Ev[] = []
  const wrapIn = (t: React.ReactNode) => (
    <BehaviorSurfaceProvider surfaceId="t" onEvent={(e) => events.push(e as Ev)}>
      {t}
    </BehaviorSurfaceProvider>
  )
  const r = render(wrapIn(tree))
  return { events, rerender: (t) => r.rerender(wrapIn(t)) }
}

// ── brand slot ────────────────────────────────────────────────────────────────

/**
 * Slot filling as a pattern expander does it (`fillTemplate`): a whole-value
 * token takes a non-string value as it is, every other token is text.
 */
function fillTemplate(node: unknown, fill: Record<string, unknown>): unknown {
  if (Array.isArray(node)) return node.map((n) => fillTemplate(n, fill))
  if (typeof node === 'string') {
    const whole = node.match(/^\{\{([A-Z0-9_]+)\}\}$/)
    if (whole && whole[1] !== 'ID' && whole[1]! in fill && typeof fill[whole[1]!] !== 'string') return fill[whole[1]!]
    return node.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k: string) => (k === 'ID' ? 'shell' : k in fill ? String(fill[k]) : m))
  }
  if (!node || typeof node !== 'object') return node
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillTemplate(v, fill)]))
}

function walk(block: Block, out: Block[] = []): Block[] {
  out.push(block)
  for (const c of (block.children ?? []) as Block[]) walk(c, out)
  return out
}

/** The shell as a visitor gets it: slots filled, then the runtime's visibility pass. */
function shellAsRendered(name: string, fill: Record<string, unknown>): Block[] {
  const atom = JSON.parse(readFileSync(join(here, '..', 'atoms', 'patterns', `${name}.json`), 'utf8'))
  const filled = fillTemplate(atom.snippet, {
    BAR_ITEMS: [{ label: 'Ana sayfa', href: '/', icon: 'home' }],
    ACTIVE: '/',
    CRUMBS: [{ label: 'Ana sayfa' }],
    LEGAL: '© 2026',
    ...fill,
  }) as Block
  return resolveBlockExpressions([filled], {}).flatMap((b) => walk(b))
}

const SHELLS = ['shell-none-flow', 'shell-bottombar-flow', 'shell-bottombar-grid', 'shell-bottombar-dense']

describe('brand slot — every chrome-less and bottom-bar shell names the app in text', () => {
  for (const shell of SHELLS) {
    it(`${shell}: without a logo the name is text and no empty image box is drawn`, () => {
      const blocks = shellAsRendered(shell, { BRAND: 'Denge Pilates', LOGO: '' })
      const texts = blocks.filter((b) => b.type === 'text').map((b) => (b.props as { content?: string }).content)
      expect(texts).toContain('Denge Pilates')
      // The logo image stays in the tree (the nested-slot visibleWhen
      // `{{length('{{LOGO}}') > 0}}` broke on a URL with a quote)
      // and the image block itself draws NOTHING for an empty src when live.
      for (const img of blocks.filter((b) => b.type === 'image')) {
        const { container } = render(el(ImageBlock, img.id, 'image', img.props as Record<string, unknown>, undefined, { interactionMode: 'live' }))
        expect(container.innerHTML).toBe('')
      }
    })

    it(`${shell}: a logo, when given, is drawn beside the name`, () => {
      const blocks = shellAsRendered(shell, { BRAND: 'Denge Pilates', LOGO: 'https://cdn.example.com/logo.png' })
      const images = blocks.filter((b) => b.type === 'image')
      expect(images).toHaveLength(1)
      expect((images[0]!.props as { src?: string }).src).toBe('https://cdn.example.com/logo.png')
      const texts = blocks.filter((b) => b.type === 'text').map((b) => (b.props as { content?: string }).content)
      expect(texts).toContain('Denge Pilates')
    })
  }
})

// ── split-view on a phone and with scroll ─────────────────────────────────────

/** A ResizeObserver that reports the block's box as `width` px wide. */
function boxWidth(width: number): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: Array<{ contentRect: { width: number } }>) => void) {}
      observe(): void {
        this.cb([{ contentRect: { width } }])
      }
      disconnect(): void {}
      unobserve(): void {}
    }
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
}

const records = [
  { id: 'a', title: 'Ada Lovelace', meta: 'Accounting', body: 'Extension 204' },
  { id: 'b', title: 'Alan Turing', meta: 'Sales', body: 'Extension 311' },
]
const root = () => document.querySelector('[data-block-type="split-view"]') as HTMLElement

describe('split-view stacks on a narrow box and nothing in it is out of reach', () => {
  beforeEach(() => boxWidth(375))

  it('with an EMPTY list the action area is on the page (its "add" button was invisible)', () => {
    mount(el(SplitViewBlock, 'directory', 'split-view', { items: [], listTitle: 'Sections' }, <button type="button">Add a section</button>))
    expect(screen.getByRole('button', { name: 'Add a section' })).toBeTruthy()
    // and no empty sidebar in its place
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('list and detail are BOTH on the page, stacked, and the box takes its content height', () => {
    mount(el(SplitViewBlock, 'directory', 'split-view', { items: records, listTitle: 'People', height: '619px' }, <button type="button">Add a person</button>))
    expect(root().getAttribute('data-pw-split')).toBe('stack')
    expect(root().style.flexDirection).toBe('column')
    expect(root().style.height).toBe('auto')
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Ada Lovelace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a person' })).toBeTruthy()
  })

  it('choosing a record shows it in the detail below the list', async () => {
    mount(el(SplitViewBlock, 'directory', 'split-view', { items: records }))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Alan Turing/ }))
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Alan Turing' })).toBeTruthy()
    expect(screen.getByRole('listbox')).toBeTruthy()
  })
})

describe('split-view side by side: the document pane scrolls as one', () => {
  beforeEach(() => boxWidth(1200))

  it('the action area is inside the scrolling detail pane, not clipped below it', () => {
    mount(el(SplitViewBlock, 'directory', 'split-view', { items: records, height: '619px' }, <button type="button">Add a person</button>))
    expect(root().getAttribute('data-pw-split')).toBe('both')
    expect(root().style.height).toBe('619px')
    const action = screen.getByRole('button', { name: 'Add a person' })
    let scroller: HTMLElement | null = action.parentElement
    while (scroller && scroller !== root() && scroller.style.overflowY !== 'auto') scroller = scroller.parentElement
    expect(scroller && scroller !== root()).toBe(true)
    // the scroller holds the detail heading too: header, body and actions read top-down together
    expect(scroller!.contains(screen.getByRole('heading', { level: 2, name: 'Ada Lovelace' }))).toBe(true)
  })

  it('stream mode keeps the composer pinned: the thread scrolls, the composer is the last child', () => {
    mount(
      el(
        SplitViewBlock,
        'sohbet',
        'split-view',
        { detailMode: 'stream', items: [{ id: 'k', title: 'Genel', entries: [{ from: 'Ali', text: 'Merhaba' }] }] },
        <textarea aria-label="Mesaj" />
      )
    )
    const composer = screen.getByRole('textbox', { name: 'Mesaj' })
    const actions = composer.closest('[data-pw-split-actions]') as HTMLElement
    expect(actions.parentElement!.lastElementChild).toBe(actions)
    expect(actions.style.overflowY).toBe('auto')
  })
})

// ── segmented-control always submits the value it shows ──────────────────────

const hidden = (name: string) => document.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement | null
const checkedPill = () => screen.getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true')?.textContent

const yesNo = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
]

describe('segmented-control carries a named hidden input with the value it shows', () => {
  it('the label written as the value selects that option and submits its VALUE', () => {
    mount(el(SegmentedControlBlock, 'k', 'segmented-control', { name: 'attending', value: 'No', options: yesNo }))
    expect(checkedPill()).toBe('No')
    expect(hidden('attending')?.value).toBe('false')
  })

  it('boolean option values are compared and submitted as text', () => {
    mount(
      el(SegmentedControlBlock, 'k', 'segmented-control', {
        name: 'beyan',
        value: false,
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      })
    )
    expect(checkedPill()).toBe('No')
    expect(hidden('beyan')?.value).toBe('false')
  })

  it('a value that matches no option falls back to the option on screen, never an invisible value', () => {
    mount(el(SegmentedControlBlock, 'k', 'segmented-control', { name: 'attending', value: 'maybe', options: yesNo }))
    expect(checkedPill()).toBe('Yes')
    expect(hidden('attending')?.value).toBe('true')
  })

  it('a bound value that changes after the first render re-selects', () => {
    const props = (value: string) => ({ name: 'attending', value, options: yesNo })
    const { rerender } = mount(el(SegmentedControlBlock, 'k', 'segmented-control', props('true')))
    expect(hidden('attending')?.value).toBe('true')
    rerender(el(SegmentedControlBlock, 'k', 'segmented-control', props('false')))
    expect(checkedPill()).toBe('No')
    expect(hidden('attending')?.value).toBe('false')
  })

  const form = () =>
    el(FormBlock, 'f', 'form', { submitLabel: 'Send' }, [
      el(SegmentedControlBlock, 'k', 'segmented-control', { name: 'attending', value: 'Yes', options: yesNo, stateKey: 'attending' }),
    ])
  const submitted = async (events: Ev[]) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    return events.filter((e) => e.type === 'form:submit').map((e) => e.payload?.values)
  }

  it('in a form, the named value is submitted when the visitor never touched it', async () => {
    const { events } = mount(form())
    expect(await submitted(events)).toEqual([{ attending: 'true' }])
  })

  it('in a form, the named value is submitted after a click', async () => {
    const { events } = mount(form())
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    })
    expect(await submitted(events)).toEqual([{ attending: 'false' }])
  })
})
