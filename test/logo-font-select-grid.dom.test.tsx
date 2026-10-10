/**
 * Shell brand, button font, select options, grid, form reset, segmented seed
 * and repeater layout — each fixed at the source:
 *
 *   logo       the shell brand row must not draw "⊟ <brand> logo" without a logo
 *   font       button text uses the theme's font, not the browser default
 *   select     options from {label} alone, labelKey/valueKey, raw rows
 *   grid       grid has a phone column count
 *   reset      a form clears after a successful submit
 *   seed       segmented-control's preselected value reaches state
 *   repeater   the repeater manifest describes `row` and `columns` correctly
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { ImageBlock } from '../atoms/blocks/media/image/component.js'
import { ButtonBlock } from '../atoms/blocks/control/button/component.js'
import { SelectBlock, normaliseOptions } from '../atoms/blocks/form/select/component.js'
import { GridBlock } from '../atoms/blocks/layout/grid/component.js'
import { FormBlock } from '../atoms/blocks/form/form/component.js'
import { InputBlock } from '../atoms/blocks/form/input/component.js'
import { SegmentedControlBlock } from '../atoms/blocks/form/segmented-control/component.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', 'atoms')
const readJson = (rel: string) => JSON.parse(readFileSync(join(src, rel), 'utf8'))

afterEach(() => cleanup())

type Ev = { type: string; blockId?: string; payload?: Record<string, unknown> }
type AnyBlock = React.FC<Record<string, unknown>>
const LIVE = { interactionMode: 'live' }
const INERT = { interactionMode: 'inert' }

function el(
  C: unknown,
  id: string,
  type: string,
  props: Record<string, unknown>,
  children?: React.ReactNode,
  context: Record<string, unknown> = LIVE,
  blockExtra: Record<string, unknown> = {}
) {
  const Comp = C as AnyBlock
  return (
    <Comp key={id} props={props} block={{ id, type, props, layout: {}, ...blockExtra }} context={context}>
      {children}
    </Comp>
  )
}

function withBus(tree: React.ReactNode, events: Ev[]) {
  return (
    <BehaviorSurfaceProvider surfaceId="t" onEvent={(e) => events.push(e as Ev)}>
      {tree}
    </BehaviorSurfaceProvider>
  )
}

type Node = { id?: string; type?: string; props?: Record<string, unknown>; children?: Node[] }
const walk = (n: Node, out: Node[] = []): Node[] => {
  out.push(n)
  for (const c of n.children ?? []) walk(c, out)
  return out
}

// ── logo ───────────────────────────────────────────────────────────────────

describe('an empty logo slot in a shell brand row draws nothing', () => {
  const shells = ['shell-bottombar-flow', 'shell-bottombar-dense', 'shell-bottombar-grid', 'shell-none-flow']
  for (const name of shells) {
    it(`${name}: the logo node renders nothing without a src, in the editor too; the text brand stays`, () => {
      const p = readJson(`patterns/${name}.json`) as { snippet: Node }
      const nodes = walk(p.snippet)
      const logo = nodes.find((n) => String(n.id).endsWith('-brand-logo'))
      expect(logo?.type).toBe('image')
      expect(logo?.props?.hideWhenEmpty).toBe(true)
      expect(nodes.some((n) => n.type === 'text' && n.props?.content === '{{BRAND}}')).toBe(true)
      // The pattern as a model fills it with no logo.
      const props = { ...logo!.props, src: '', alt: 'Acme logo' }
      for (const ctx of [LIVE, INERT]) {
        const { container, unmount } = render(el(ImageBlock, 'l', 'image', props, undefined, ctx))
        expect(container.textContent).toBe('')
        expect(container.querySelector('[data-image-placeholder]')).toBeNull()
        unmount()
      }
    })
  }

  it('a plain image slot still shows its editor placeholder (the affordance is opt-out, not gone)', () => {
    const { container } = render(el(ImageBlock, 'l', 'image', { src: '', alt: 'Hero' }, undefined, INERT))
    expect(container.querySelector('[data-image-placeholder]')).not.toBeNull()
  })

  it('a logo with a src is drawn', () => {
    const { container } = render(el(ImageBlock, 'l', 'image', { src: 'https://x.test/l.png', alt: 'Acme logo', hideWhenEmpty: true }))
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x.test/l.png')
  })
})

// ── font ───────────────────────────────────────────────────────────────────

describe('a button speaks the theme font', () => {
  it('sets font-family: inherit (a <button> does not inherit it by default)', () => {
    const events: Ev[] = []
    const { container } = render(withBus(el(ButtonBlock, 'b', 'button', { label: 'Kaydet' }), events))
    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn.style.fontFamily).toBe('inherit')
  })
})

// ── select ─────────────────────────────────────────────────────────────────

describe('select accepts {label, value} and names the keys of raw rows', () => {
  it('an option with only a label submits the label, not an empty value', () => {
    expect(normaliseOptions([{ label: 'Red' }])).toEqual([{ value: 'Red', label: 'Red' }])
  })

  it('labelKey / valueKey name the fields of bound rows', () => {
    const events: Ev[] = []
    const rows = [
      { id: 'r1', title: 'Morning session' },
      { id: 'r2', title: 'Evening session' },
    ]
    const { container } = render(withBus(el(SelectBlock, 's', 'select', { name: 'session', options: rows, labelKey: 'title', valueKey: 'id' }), events))
    const opts = Array.from(container.querySelectorAll('option')).filter((o) => o.value !== '')
    expect(opts.map((o) => [o.value, o.textContent])).toEqual([
      ['r1', 'Morning session'],
      ['r2', 'Evening session'],
    ])
  })

  it('a raw row without label/name falls back to its title, and a dotted key reaches a nested field', () => {
    expect(normaliseOptions([{ id: 'e1', title: 'Concert' }])).toEqual([{ value: 'e1', label: 'Concert' }])
    expect(normaliseOptions([{ id: 'e1', data: { title: 'Concert' } }], undefined, 'data.title')).toEqual([{ value: 'e1', label: 'Concert' }])
  })

  it('the manifest documents every accepted option shape and the key props', () => {
    const m = readJson('blocks/form/select/manifest.json') as { definition: { props: { name: string; jsonSchema: Record<string, unknown> }[] } }
    const names = m.definition.props.map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(['labelKey', 'valueKey']))
    const options = m.definition.props.find((p) => p.name === 'options')!
    const desc = String(options.jsonSchema.description)
    expect(desc).toMatch(/\{label, value\}/)
    expect(desc).toMatch(/labelKey/)
    // The schema no longer claims every item must be an object with both keys.
    expect(JSON.stringify(options.jsonSchema)).not.toContain('"required":["value","label"]')
  })
})

// ── grid ───────────────────────────────────────────────────────────────────

describe('columnsXs sets the phone column count', () => {
  const css = (container: HTMLElement) => container.querySelector('style')?.textContent ?? ''

  it('columnsXs: 2 keeps two columns at 640px and below', () => {
    const { container } = render(el(GridBlock, 'g', 'grid', { columns: 4, columnsXs: 2 }))
    expect(css(container)).toMatch(/@media \(max-width: 640px\)\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  })

  it('without columnsXs the phone still collapses to one column', () => {
    const { container } = render(el(GridBlock, 'g', 'grid', { columns: 3 }))
    expect(css(container)).toMatch(/@media \(max-width: 640px\)\{[^}]*grid-template-columns:1fr/)
  })

  it('the manifest declares columnsXs', () => {
    const m = readJson('blocks/layout/grid/manifest.json') as { definition: { props: { name: string }[] } }
    expect(m.definition.props.map((p) => p.name)).toContain('columnsXs')
  })
})

// ── reset ──────────────────────────────────────────────────────────────────

describe('a form clears itself on its success signal', () => {
  function tree(resetWhen: unknown) {
    return el(
      FormBlock,
      'f',
      'form',
      { submitLabel: 'Send', resetWhen },
      el(InputBlock, 'i', 'input', { name: 'fullName', label: 'Name' })
    )
  }

  it('resetWhen false → true empties the fields', () => {
    const events: Ev[] = []
    const { container, rerender } = render(withBus(tree(false), events))
    const input = container.querySelector('input[name="fullName"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Ada' } })
    expect(input.value).toBe('Ada')
    act(() => {
      rerender(withBus(tree(true), events))
    })
    expect((container.querySelector('input[name="fullName"]') as HTMLInputElement).value).toBe('')
  })

  it('a string "true" from an interpolated binding counts too; staying true does not reset again', () => {
    const events: Ev[] = []
    const { container, rerender } = render(withBus(tree('false'), events))
    act(() => {
      rerender(withBus(tree('true'), events))
    })
    const input = container.querySelector('input[name="fullName"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Alan' } })
    act(() => {
      rerender(withBus(tree('true'), events))
    })
    expect(input.value).toBe('Alan')
  })

  it('the manifest declares resetWhen', () => {
    const m = readJson('blocks/form/form/manifest.json') as { definition: { props: { name: string; bindable: boolean }[] } }
    const p = m.definition.props.find((x) => x.name === 'resetWhen')
    expect(p?.bindable).toBe(true)
  })

  it('a segmented-control goes back to its initial value on reset', () => {
    const events: Ev[] = []
    const opts = [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ]
    const t = (resetWhen: boolean) =>
      el(FormBlock, 'f', 'form', { submitLabel: 'Send', resetWhen }, el(SegmentedControlBlock, 's', 'segmented-control', { name: 'rsvp', options: opts, value: 'yes' }))
    const { container, rerender } = render(withBus(t(false), events))
    fireEvent.click(container.querySelector('button[role="radio"]:nth-of-type(2)') as HTMLElement)
    expect((container.querySelector('input[name="rsvp"]') as HTMLInputElement).value).toBe('no')
    act(() => {
      rerender(withBus(t(true), events))
    })
    expect((container.querySelector('input[name="rsvp"]') as HTMLInputElement).value).toBe('yes')
  })
})

// ── seed ───────────────────────────────────────────────────────────────────

describe('segmented-control seeds its state key with the value it shows', () => {
  const opts = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
  ]
  const seeds = (events: Ev[]) =>
    events
      .map((e) => e.payload?.action as { type?: string; key?: string; value?: unknown } | undefined)
      .filter((a) => a?.type === 'setState')

  it('on mount, the preselected value is written to state', () => {
    const events: Ev[] = []
    render(withBus(el(SegmentedControlBlock, 's', 'segmented-control', { options: opts, value: 'open', stateKey: 'filter' }), events))
    expect(seeds(events)).toEqual([{ type: 'setState', key: 'filter', value: 'open' }])
  })

  it('with no value, the first option — the one lit — is the seed', () => {
    const events: Ev[] = []
    render(withBus(el(SegmentedControlBlock, 's', 'segmented-control', { options: opts, stateKey: 'filter' }), events))
    expect(seeds(events)).toEqual([{ type: 'setState', key: 'filter', value: 'all' }])
  })

  it('without a stateKey nothing is emitted on mount', () => {
    const events: Ev[] = []
    render(withBus(el(SegmentedControlBlock, 's', 'segmented-control', { options: opts, value: 'open' }), events))
    expect(events.filter((e) => e.type !== 'surface:load')).toEqual([])
  })
})

// ── repeater ───────────────────────────────────────────────────────────────

describe('the manifest says what `row` and `columns` do', () => {
  const m = readJson('blocks/data/repeater/manifest.json') as { definition: { props: { name: string; jsonSchema: { description?: string } }[] } }
  const desc = (name: string) => String(m.definition.props.find((p) => p.name === name)?.jsonSchema.description)

  it('row is a vertical list, not "horizontal list rows"', () => {
    expect(desc('layout')).not.toMatch(/horizontal list rows/)
    expect(desc('layout')).toMatch(/vertical/)
  })

  it('columns is not a fixed count', () => {
    expect(desc('columns')).not.toMatch(/Fixed column count/)
    expect(desc('columns')).toMatch(/minCellWidth/)
  })
})
