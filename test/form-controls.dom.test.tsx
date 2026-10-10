/**
 * Form controls and the blocks around them, one describe per behaviour:
 *
 *   - the form payload is built from the form's elements
 *   - no "Submit" / "Enter value..." / "Select an option..." defaults
 *   - input step, min, max; no inline outline:'none' on the input
 *   - segmented-control wraps and draws nothing without options
 *   - active labels are primary-INK; the bottom bar clears the safe area
 *   - select defaultValue / string options / chevron; textarea label + defaultValue
 *   - tint() closes its color-mix(
 *   - prose links are sanitised
 *   - repeater template contract; a single record is a list of one
 *   - navbar drawer, hamburger, search, empty brand/CTA
 *   - grid tablet step; container paints gradient + border; box-sizing
 *   - non-submit buttons are type="button"
 *   - unset text shows nothing to a visitor
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as React from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { tint, safeFrameSrc, safeHref, CONTROL_BORDER } from '../atoms/lib/_shared-utils.js'
import { FormBlock, collectFormValues } from '../atoms/blocks/form/form/component.js'
import { InputBlock } from '../atoms/blocks/form/input/component.js'
import { SelectBlock, normaliseOptions } from '../atoms/blocks/form/select/component.js'
import { TextareaBlock } from '../atoms/blocks/form/textarea/component.js'
import { SegmentedControlBlock } from '../atoms/blocks/form/segmented-control/component.js'
import { AlertBlock } from '../atoms/blocks/text/alert/component.js'
import { BadgeBlock } from '../atoms/blocks/control/badge/component.js'
import { ChipBlock } from '../atoms/blocks/control/chip/component.js'
import { ButtonBlock } from '../atoms/blocks/control/button/component.js'
import { LinkBlock } from '../atoms/blocks/control/link/component.js'
import { TextBlock } from '../atoms/blocks/text/text/component.js'
import { HeadingBlock } from '../atoms/blocks/text/heading/component.js'
import { ProseBlock, safeUrl, regexStrip } from '../atoms/blocks/text/prose/component.js'
import { ToastBlock } from '../atoms/blocks/feedback/toast/component.js'
import { ListBlock } from '../atoms/blocks/data/list/component.js'
import { AccordionBlock } from '../atoms/blocks/container/accordion/component.js'
import { RepeaterBlock, asItems } from '../atoms/blocks/data/repeater/component.js'
import { ImageBlock } from '../atoms/blocks/media/image/component.js'
import { VideoBlock } from '../atoms/blocks/media/video/component.js'
import { NavbarBlock } from '../atoms/blocks/layout/navbar/component.js'
import { GridBlock } from '../atoms/blocks/layout/grid/component.js'
import { ContainerBlock } from '../atoms/blocks/layout/container/component.js'
import { SectionBlock } from '../atoms/blocks/layout/section/component.js'
import { BottomBarBlock } from '../atoms/blocks/layout/bottom-bar/component.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

function mount(tree: React.ReactNode): { events: Ev[]; container: HTMLElement } {
  const events: Ev[] = []
  const { container } = render(
    <BehaviorSurfaceProvider surfaceId="t" onEvent={(e) => events.push(e as Ev)}>
      {tree}
    </BehaviorSurfaceProvider>
  )
  return { events, container }
}
const submits = (events: Ev[]) => events.filter((e) => e.type === 'form:submit')

// ────────────────────────────────────────────────────────────────────────

describe('the form payload is built from the form elements', () => {
  const formOf = (html: string): HTMLFormElement => {
    const host = document.createElement('div')
    host.innerHTML = `<form>${html}</form>`
    document.body.appendChild(host)
    return host.querySelector('form') as HTMLFormElement
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('an unchecked yes/no checkbox is false, a checked one true', () => {
    expect(collectFormValues(formOf('<input type="checkbox" name="agree">'))).toEqual({ agree: false })
    expect(collectFormValues(formOf('<input type="checkbox" name="agree" checked>'))).toEqual({ agree: true })
    expect(collectFormValues(formOf('<input type="checkbox" name="agree" value="true">'))).toEqual({ agree: false })
    expect(collectFormValues(formOf('<input type="checkbox" name="agree" data-pw-value-type="boolean" value="yes" checked>'))).toEqual({ agree: true })
  })

  it('a checkbox group keeps every checked value, and [] when none', () => {
    const f = formOf('<input type="checkbox" name="tags" value="a" checked><input type="checkbox" name="tags" value="b"><input type="checkbox" name="tags" value="c" checked>')
    expect(collectFormValues(f)).toEqual({ tags: ['a', 'c'] })
    const none = formOf('<input type="checkbox" name="tags" value="a"><input type="checkbox" name="tags" value="b">')
    expect(collectFormValues(none)).toEqual({ tags: [] })
  })

  it('a multi-select keeps an array', () => {
    const f = formOf('<select name="days" multiple><option value="mon" selected>Mon</option><option value="tue">Tue</option><option value="wed" selected>Wed</option></select>')
    expect(collectFormValues(f)).toEqual({ days: ['mon', 'wed'] })
  })

  it('a radio group with nothing picked is present as ""', () => {
    const f = formOf('<input type="radio" name="size" value="s"><input type="radio" name="size" value="m">')
    expect(collectFormValues(f)).toEqual({ size: '' })
    ;(f.querySelector('input[value="m"]') as HTMLInputElement).checked = true
    expect(collectFormValues(f)).toEqual({ size: 'm' })
  })

  it('a name on several fields is not collapsed to the last one', () => {
    const f = formOf('<input type="hidden" name="ids" value="1"><input type="hidden" name="ids" value="2">')
    expect(collectFormValues(f)).toEqual({ ids: ['1', '2'] })
  })

  it('the hidden-fallback idiom resolves to the checkbox answer', () => {
    const f = formOf('<input type="hidden" name="news" value="false"><input type="checkbox" name="news" value="true">')
    expect(collectFormValues(f)).toEqual({ news: false })
    ;(f.querySelector('input[type=checkbox]') as HTMLInputElement).checked = true
    expect(collectFormValues(f)).toEqual({ news: true })
  })

  it('numbers stay strings (the backend coerces), unnamed and disabled fields and buttons stay out', () => {
    const f = formOf('<input type="number" name="qty" value="2"><input value="x"><input name="off" value="y" disabled><button name="go" value="1">Go</button>')
    expect(collectFormValues(f)).toEqual({ qty: '2' })
  })

  it('the submitted event carries the same payload', async () => {
    const { events } = mount(
      el(FormBlock, 'f', 'form', { submitLabel: 'Kaydet' }, [
        el(InputBlock, 'full-name', 'input', { name: 'fullName', type: 'text' }),
        <input key="cb" type="checkbox" name="consent" />,
      ])
    )
    fireEvent.change(document.getElementById('full-name') as HTMLElement, { target: { value: 'Ada' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    })
    expect(submits(events)[0]?.payload?.values).toEqual({ fullName: 'Ada', consent: false })
  })
})

// ──────────────────────────────────────────────────────────────────

describe('no English default labels or placeholders', () => {
  it('a form without submitLabel uses the browser submit button, not "Submit"', () => {
    mount(el(FormBlock, 'f', 'form', {}, []))
    const submit = document.querySelector('input[type="submit"]') as HTMLInputElement
    expect(submit).not.toBeNull()
    expect(submit.hasAttribute('value')).toBe(false)
    expect(document.body.textContent).not.toContain('Submit')
  })

  it('input, select and textarea show no placeholder unless one is written', () => {
    mount(
      <>
        {el(InputBlock, 'i', 'input', { name: 'i' })}
        {el(SelectBlock, 's', 'select', { name: 's', options: ['A'] })}
        {el(TextareaBlock, 't', 'textarea', { name: 't' })}
      </>
    )
    expect((document.getElementById('i') as HTMLInputElement).hasAttribute('placeholder')).toBe(false)
    expect((document.getElementById('t-textarea') as HTMLTextAreaElement).hasAttribute('placeholder')).toBe(false)
    expect(document.body.textContent).not.toMatch(/Enter value|Select an option|Enter text/)
  })
})

// ──────────────────────────────────────────────────────────────────

describe('input step, min, max; no outline:none', () => {
  it('passes step, min and max to the native input', () => {
    mount(el(InputBlock, 'price', 'input', { name: 'price', type: 'number', step: 0.01, min: 0, max: 1000, required: true }))
    const input = document.getElementById('price') as HTMLInputElement
    expect(input.getAttribute('step')).toBe('0.01')
    expect(input.getAttribute('min')).toBe('0')
    expect(input.getAttribute('max')).toBe('1000')
    expect(input.required).toBe(true)
    expect(input.getAttribute('inputmode')).toBe('decimal')
  })

  it('a date input takes ISO min/max strings', () => {
    mount(el(InputBlock, 'd', 'input', { name: 'd', type: 'date', min: '2026-01-01', step: 'any' }))
    expect((document.getElementById('d') as HTMLInputElement).getAttribute('min')).toBe('2026-01-01')
  })

  it('keeps the focus ring (no inline outline) and draws the control edge', () => {
    mount(el(InputBlock, 'x', 'input', { name: 'x' }))
    const input = document.getElementById('x') as HTMLInputElement
    expect(input.style.outline).toBe('')
    expect(input.getAttribute('style')).toContain('--pw-color-control-border')
  })
})

// ────────────────────────────────────────────────────────────

describe('segmented-control', () => {
  it('draws nothing without options (no Day/Week/Month sample)', () => {
    const { container } = mount(el(SegmentedControlBlock, 's', 'segmented-control', { name: 'v' }))
    expect(container.innerHTML).toBe('')
  })

  it('wraps by default, and paints the active label with primary-ink', () => {
    mount(el(SegmentedControlBlock, 's', 'segmented-control', { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], value: 'a' }))
    const group = screen.getByRole('radiogroup')
    expect(group.style.flexWrap).toBe('wrap')
    const active = screen.getByRole('radio', { name: 'A' })
    expect(active.getAttribute('style')).toContain('--pw-color-primary-ink')
  })

  it('wrap:false keeps one row that scrolls', () => {
    mount(el(SegmentedControlBlock, 's', 'segmented-control', { options: [{ label: 'A', value: 'a' }], wrap: false }))
    expect(screen.getByRole('radiogroup').style.flexWrap).toBe('nowrap')
  })
})

describe('bottom-bar active label is primary-ink and the bar respects the safe area', () => {
  it('uses the ink token and grows by the safe-area inset', () => {
    mount(el(BottomBarBlock, 'bb', 'bottom-bar', { items: [{ label: 'Home', href: '/', icon: 'home' }], activeHref: '/' }))
    const link = screen.getByText('Home').closest('a') as HTMLElement
    expect(link.getAttribute('style')).toContain('--pw-color-primary-ink')
    const nav = document.querySelector('nav') as HTMLElement
    expect(nav.getAttribute('style')).toContain('safe-area-inset-bottom')
  })
})

// ────────────────────────────────────────────────────────────────────

describe('select', () => {
  it('accepts plain strings and data records as options', () => {
    expect(normaliseOptions(['A', 'B'])).toEqual([
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
    ])
    expect(normaliseOptions([{ id: 'lon', name: 'London' }], 'id', 'name')).toEqual([{ value: 'lon', label: 'London' }])
  })

  it('selects its bound defaultValue and draws a chevron', () => {
    mount(el(SelectBlock, 'sort', 'select', { name: 'sort', options: ['new', 'old'], defaultValue: 'old' }))
    const sel = document.getElementById('sort-select') as HTMLSelectElement
    expect(sel.value).toBe('old')
    expect(sel.style.borderRadius).toBe('var(--pw-border-radius)')
    expect(document.querySelector('#sort svg polyline')).not.toBeNull()
  })

  it('a multi-select takes a comma list and emits the whole set', () => {
    const { events } = mount(el(SelectBlock, 'm', 'select', { name: 'm', multiple: true, options: ['a', 'b', 'c'], defaultValue: 'a,c', stateKey: 'm' }))
    const sel = document.getElementById('m-select') as HTMLSelectElement
    expect(Array.from(sel.selectedOptions, (o) => o.value)).toEqual(['a', 'c'])
    fireEvent.change(sel)
    const change = events.find((e) => e.type === 'input:change')
    expect(change?.payload?.value).toEqual(['a', 'c'])
  })
})

describe('textarea label is bound, defaultValue fills it', () => {
  it('label htmlFor points at the field and the stored text shows', () => {
    mount(el(TextareaBlock, 'n', 'textarea', { name: 'notes', label: 'Notes', defaultValue: 'earlier note' }))
    const field = screen.getByLabelText(/Notes/) as HTMLTextAreaElement
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.value).toBe('earlier note')
  })
})

// ────────────────────────────────────────────────────────────────────

const balanced = (s: string): boolean => {
  let d = 0
  for (const c of s) {
    if (c === '(') d++
    if (c === ')' && --d < 0) return false
  }
  return d === 0
}

describe('tint() closes its color-mix(', () => {
  it('the helper is balanced', () => {
    expect(tint('var(--pw-color-error)', 10)).toBe('color-mix(in srgb, var(--pw-color-error) 10%, var(--pw-color-card))')
    expect(balanced(tint('var(--pw-color-info)'))).toBe(true)
    expect(balanced(CONTROL_BORDER)).toBe(true)
  })

  it('alert, badge and chip styles keep padding and block.style after the tint', () => {
    mount(
      <>
        {el(AlertBlock, 'al', 'alert', { message: 'Kaydedildi', variant: 'success' }, undefined, LIVE, { style: { marginTop: '7px' } })}
        {el(BadgeBlock, 'ba', 'badge', { text: 'Yeni', variant: 'primary' }, undefined, LIVE, { style: { marginTop: '7px' } })}
        {el(ChipBlock, 'ch', 'chip', { label: 'Etiket', tone: 'primary' })}
      </>
    )
    for (const id of ['al', 'ba', 'ch']) {
      const style = (document.getElementById(id) as HTMLElement).getAttribute('style') ?? ''
      expect(balanced(style)).toBe(true)
    }
    expect((document.getElementById('al') as HTMLElement).style.marginTop).toBe('7px')
    expect((document.getElementById('ba') as HTMLElement).style.marginTop).toBe('7px')
  })
})

// ────────────────────────────────────────────────────────────────────────

const HOSTILE = [
  'javascript:alert(1)',
  'JAVASCRIPT:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java&Tab;script:alert(1)',
  '&#106;avascript:alert(1)',
  'jav&#x61;script:alert(1)',
  'javascript&colon;alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
]

describe('prose links carry only safe schemes', () => {
  it('safeUrl refuses hostile schemes, keeps safe ones', () => {
    for (const v of HOSTILE) expect(safeUrl(v)).toBeNull()
    expect(safeUrl('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&c=2')
    expect(safeUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com')
    expect(safeUrl('/pricing')).toBe('/pricing')
  })

  it('safeHref (every block link) sees the scheme a browser sees', () => {
    expect(safeHref('java\tscript:alert(1)')).toBeUndefined()
    expect(safeHref('java\nscript:alert(1)')).toBeUndefined()
    expect(safeHref('/ok')).toBe('/ok')
  })

  it('the server-side strip removes a handler glued to a quote and rewrites unsafe hrefs', () => {
    const out = regexStrip('<a href="x"onmouseover="alert(1)">a</a><a href="java&#x09;script:alert(1)">b</a><p style="x">c</p>')
    expect(out).not.toMatch(/onmouseover|javascript|style=/i)
    expect(out).toContain('href="x"')
  })

  it('a markdown link with a quote in its URL cannot open an attribute', () => {
    mount(el(ProseBlock, 'p', 'prose', { content: 'see [x](a"onmouseover="alert(1)) now' }))
    const a = document.querySelector('[data-prose-id] a') as HTMLAnchorElement
    expect(a.getAttribute('onmouseover')).toBeNull()
    expect(a.getAttributeNames().sort()).toEqual(['href'])
  })

  it('a markdown javascript: link renders as plain text', () => {
    mount(el(ProseBlock, 'p', 'prose', { content: '[click](javascript:alert(1))' }))
    expect(document.querySelector('[data-prose-id] a')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────

describe('repeater template contract', () => {
  const row = (id: string) => <p key={id} data-testid="row">{id}</p>

  it('an unexpanded {{item.*}} template draws nothing live and says why', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const kids = [{ id: 'row', type: 'text', props: { content: '' } }]
    const { container } = mount(el(RepeaterBlock, 'rep-a', 'repeater', { items: [{ a: 1 }, { a: 2 }] }, [row('row')], LIVE, { children: kids }))
    expect(container.querySelector('[data-testid="row"]')).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"repeat"'))
  })

  it('in the editor the template is shown under a notice', () => {
    const kids = [{ id: 'row', type: 'text', props: {} }]
    mount(el(RepeaterBlock, 'rep-b', 'repeater', { items: [{ a: 1 }] }, [row('row')], INERT, { children: kids }))
    expect(screen.getByRole('note').textContent).toContain('repeat')
    expect(screen.getAllByTestId('row')).toHaveLength(1)
  })

  it('an expanded template (clone ids --N) renders every clone', () => {
    const kids = [{ id: 'row--0' }, { id: 'row--1' }]
    mount(el(RepeaterBlock, 'rep-c', 'repeater', { items: [{ a: 1 }, { a: 2 }] }, [row('row--0'), row('row--1')], LIVE, { children: kids }))
    expect(screen.getAllByTestId('row')).toHaveLength(2)
  })

  it('a single bound record is a list of one', () => {
    expect(asItems({ heading: 'Tek' })).toEqual([{ heading: 'Tek' }])
    mount(el(RepeaterBlock, 'rep-d', 'repeater', { items: { heading: 'A single record' } }))
    expect(screen.getByText('A single record')).toBeTruthy()
  })
})

// ── navbar ───────────────────────────────────────────────────────────

describe('navbar', () => {
  const PHONE = { interactionMode: 'live', viewport: 'xs' }
  const links = [{ label: 'About us', href: '#about' }]

  it('the drawer: aria-expanded, closes on a link, closes on Escape and returns focus', async () => {
    mount(el(NavbarBlock, 'nav', 'navbar', { logoText: 'Denge', links }, undefined, PHONE))
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.style.color).toBe('inherit')
    await act(async () => fireEvent.click(button))
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await act(async () => fireEvent.click(screen.getByText('About us')))
    expect(screen.queryByText('About us')).toBeNull()
    await act(async () => fireEvent.click(button))
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }))
    expect(screen.queryByText('About us')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('the phone layout keeps block.style and carries the search box', async () => {
    mount(el(NavbarBlock, 'nav', 'navbar', { logoText: 'Denge', showSearch: true, searchPlaceholder: 'Ara' }, undefined, PHONE, { style: { marginTop: '9px' } }))
    expect((document.getElementById('nav') as HTMLElement).style.marginTop).toBe('9px')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' })))
    expect(screen.getByRole('search')).toBeTruthy()
  })

  it('search answers Enter with an event and a state write', async () => {
    const { events } = mount(el(NavbarBlock, 'nav', 'navbar', { showSearch: true, searchPlaceholder: 'Ara', searchStateKey: 'q' }))
    const box = screen.getByRole('searchbox', { name: 'Ara' }) as HTMLInputElement
    expect(box.style.outline).toBe('')
    fireEvent.change(box, { target: { value: 'pilates' } })
    await act(async () => fireEvent.submit(screen.getByRole('search')))
    expect(events).toContainEqual(expect.objectContaining({ type: 'block:click', payload: { action: 'search', value: 'pilates' } }))
    const change = events.find((e) => e.type === 'input:change')
    expect(change?.payload?.action).toEqual({ type: 'setState', key: 'q', value: 'pilates' })
  })

  it('no "Brand" and no "Get Started": unset brand is empty, a CTA without a label is not drawn', () => {
    mount(el(NavbarBlock, 'nav', 'navbar', { showCTA: true }))
    expect(document.body.textContent).not.toMatch(/Brand|Get Started/)
    expect(document.querySelector('a[href="#"]')).toBeNull()
  })

  it('a sticky bar publishes its height for anchor scrolling', () => {
    mount(el(NavbarBlock, 'nav', 'navbar', { logoText: 'Denge', sticky: true }))
    expect(document.querySelector('style')?.textContent).toContain('scroll-padding-top')
  })

  it('desktop links wrap instead of overflowing at md', () => {
    mount(el(NavbarBlock, 'nav', 'navbar', { links: [{ label: 'A', href: '/a' }] }, undefined, { interactionMode: 'live', viewport: 'md' }))
    const row = screen.getByText('A').parentElement as HTMLElement
    expect(row.style.flexWrap).toBe('wrap')
    expect(row.style.minWidth).toMatch(/^0(px)?$/)
  })
})

// ────────────────────────────────────────────────────────────────────

describe('grid, container, section', () => {
  it('a three-column grid steps to two between 641 and 1024px', () => {
    mount(el(GridBlock, 'g', 'grid', { columns: 3 }))
    const css = document.querySelector('#g style')?.textContent ?? ''
    expect(css).toContain('max-width: 1024px')
    expect(css).toContain('repeat(2,minmax(0,1fr))')
    expect(css).toContain('max-width: 640px')
    expect((document.getElementById('g') as HTMLElement).style.boxSizing).toBe('border-box')
  })

  it('a grid with minChildWidth uses auto-fit tracks', () => {
    mount(el(GridBlock, 'g2', 'grid', { columns: 3, minChildWidth: 240 }))
    expect((document.getElementById('g2') as HTMLElement).style.gridTemplateColumns).toContain('240px')
  })

  it('a container paints its gradient and border', () => {
    mount(el(ContainerBlock, 'c', 'container', { backgroundGradient: 'linear-gradient(red, blue)', borderWidth: 2 }))
    const c = document.getElementById('c') as HTMLElement
    expect(c.style.backgroundImage).toContain('linear-gradient')
    expect(c.style.borderWidth).toBe('2px')
    expect(c.style.borderStyle).toBe('solid')
    expect(c.style.boxSizing).toBe('border-box')
  })

  it('a section keeps its padding inside its width', () => {
    mount(el(SectionBlock, 's', 'section', {}))
    expect((document.getElementById('s') as HTMLElement).style.boxSizing).toBe('border-box')
  })
})

// ────────────────────────────────────────────────────────────────────────

describe('a non-submit button inside a form does not submit it', () => {
  it('accordion and alert buttons are type="button"', async () => {
    const { events } = mount(
      el(FormBlock, 'f', 'form', { submitLabel: 'Send' }, [
        el(AccordionBlock, 'acc', 'accordion', { items: [{ id: 'a', title: 'Soru', content: 'Cevap' }] }),
        el(AlertBlock, 'al', 'alert', { message: 'Not', closeable: true }),
      ])
    )
    const buttons = Array.from((document.getElementById('f') as HTMLElement).querySelectorAll('button')).filter((b) => b.textContent !== 'Send')
    expect(buttons.length).toBeGreaterThan(1)
    for (const b of buttons) expect(b.getAttribute('type')).toBe('button')
    await act(async () => {
      for (const b of buttons) fireEvent.click(b)
    })
    expect(submits(events)).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────

describe('unset text shows nothing to a visitor', () => {
  const nothing: Array<[string, unknown, string, Record<string, unknown>]> = [
    ['text', TextBlock, 'text', {}],
    ['button', ButtonBlock, 'button', {}],
    ['badge', BadgeBlock, 'badge', {}],
    ['chip', ChipBlock, 'chip', {}],
    ['link', LinkBlock, 'link', {}],
    ['alert', AlertBlock, 'alert', {}],
    ['toast', ToastBlock, 'toast', {}],
    ['list', ListBlock, 'list', {}],
    ['accordion', AccordionBlock, 'accordion', {}],
    ['image', ImageBlock, 'image', {}],
    ['video', VideoBlock, 'video', {}],
  ]
  for (const [name, C, type, props] of nothing) {
    it(`${name} prints no placeholder text`, () => {
      const { container } = mount(el(C, `b-${name}`, type, props))
      expect(container.textContent).toBe('')
      expect(container.textContent).not.toMatch(/Heading|Add your text|Button|Badge|Chip|Link text|Notification|shipped|Item 1|Section 1|⊟|Image|placeholder|No items/)
    })
  }

  it('heading without text renders no empty heading element', () => {
    const { container } = mount(el(HeadingBlock, 'h', 'heading', {}))
    expect(container.querySelector('h1,h2,h3,h4,h5,h6')).toBeNull()
  })

  it('the editor still sees the image slot', () => {
    mount(el(ImageBlock, 'im', 'image', { alt: 'Kapak' }, undefined, INERT))
    expect(document.querySelector('[data-image-placeholder]')).not.toBeNull()
  })

  // Not "hide it": the broken picture goes, the quiet slot
  // stays so the layout holds (hideWhenEmpty removes it).
  it('a broken image src drops the picture and keeps the quiet slot in the live app', async () => {
    const { container } = mount(el(ImageBlock, 'im2', 'image', { src: 'https://x/missing.png', alt: 'x' }))
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.style.maxWidth).toBe('100%')
    await act(async () => fireEvent.error(img))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-image-placeholder]')).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('an autoplaying video is muted, so the browser lets it play', () => {
    mount(el(VideoBlock, 'v', 'video', { src: 'https://x/v.mp4', autoplay: true }))
    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)
  })
})
