/**
 * Narrow-viewport text, at 390px.
 *
 *   badge: the label stays on one line and the badge does not shrink, so a
 *     wrapping row of step badges wraps WHOLE badges
 *   heading, text, prose: a long single word breaks instead of overflowing
 *     the viewport; font sizes are unchanged
 *
 * Two tests are guards: the h1 font size is unchanged and block.style still
 * overrides the badge.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { render, cleanup } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { BadgeBlock } from '../atoms/blocks/control/badge/component.js'
import { HeadingBlock } from '../atoms/blocks/text/heading/component.js'
import { TextBlock } from '../atoms/blocks/text/text/component.js'
import { ProseBlock } from '../atoms/blocks/text/prose/component.js'
import { ContainerBlock } from '../atoms/blocks/layout/container/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>
const LIVE = { interactionMode: 'live' }

function el(C: unknown, id: string, type: string, props: Record<string, unknown>, children?: React.ReactNode) {
  const Comp = C as AnyBlock
  return (
    <Comp key={id} props={props} block={{ id, type, props, layout: {} }} context={LIVE}>
      {children}
    </Comp>
  )
}

function mount(tree: React.ReactNode): HTMLElement {
  return render(<BehaviorSurfaceProvider surfaceId="t">{tree}</BehaviorSurfaceProvider>).container
}

const byId = (root: HTMLElement, id: string): HTMLElement => root.querySelector(`#${id}`) as HTMLElement

// ── badge ───────────────────────────────────────────────────────────────

describe('a badge label is one line and the badge keeps its width', () => {
  it('every size and variant renders white-space: nowrap and flex-shrink: 0', () => {
    for (const size of ['sm', 'md', 'lg']) {
      for (const variant of ['default', 'primary', 'success']) {
        const root = mount(el(BadgeBlock, 'b', 'badge', { text: '1 · Personal details', size, variant, rounded: true }))
        const s = byId(root, 'b').style
        expect(s.whiteSpace).toBe('nowrap')
        expect(s.flexShrink).toBe('0')
        cleanup()
      }
    }
  })
  it('in a step row (row container, wrap) the row wraps and each badge stays whole', () => {
    const badges = ['1 · Personal details', '2 · Workshop choice', '3 · Summary', '4 · Confirm'].map((text, i) =>
      el(BadgeBlock, `step-${i + 1}`, 'badge', { text, size: 'md', rounded: true, variant: i === 0 ? 'primary' : 'default' }),
    )
    const root = mount(el(ContainerBlock, 'steps', 'container', { direction: 'row', wrap: true, gap: 8, justify: 'center' }, badges))
    expect(byId(root, 'steps').style.flexWrap).toBe('wrap')
    for (let i = 1; i <= 4; i++) {
      const s = byId(root, `step-${i}`).style
      expect(s.whiteSpace).toBe('nowrap')
      expect(s.flexShrink).toBe('0')
    }
  })
  it('block.style still overrides (an author may opt back into wrapping)', () => {
    const props = { text: 'long label' }
    const root = mount(
      <BadgeBlock
        props={props}
        block={{ id: 'b', type: 'badge', props, layout: {}, style: { whiteSpace: 'normal' } } as never}
        context={LIVE as never}
      />,
    )
    expect(byId(root, 'b').style.whiteSpace).toBe('normal')
  })
})

// ── long words ──────────────────────────────────────────────

describe('a long single word breaks instead of overflowing', () => {
  it('heading h1–h6 carry overflow-wrap: anywhere and min-width: 0', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const root = mount(el(HeadingBlock, 'h', 'heading', { text: 'Mahallenizin', level }))
      const s = byId(root, 'h').style
      expect(s.overflowWrap).toBe('anywhere')
      expect(s.minWidth).toBe('0')
      cleanup()
    }
  })
  it('the heading font size is unchanged (h1 still on the theme h1 / 4xl token)', () => {
    const root = mount(el(HeadingBlock, 'h', 'heading', { text: 'Mahallenizin', level: 1 }))
    expect(byId(root, 'h').style.fontSize).toBe('var(--pw-font-size-h1, var(--pw-font-size-4xl, 36px))')
  })
  it('the accent-bar heading (a flex child) carries the same rule', () => {
    const root = mount(el(HeadingBlock, 'h', 'heading', { text: 'Mahallenizin', level: 1, accentBar: true }))
    const h1 = root.querySelector('h1') as HTMLElement
    expect(h1.style.overflowWrap).toBe('anywhere')
    expect(h1.style.minWidth).toBe('0')
  })
  it('text carries overflow-wrap: anywhere and keeps pre-line', () => {
    const root = mount(el(TextBlock, 't', 'text', { content: 'https://example.com/a-very-long-unbroken-address' }))
    const s = byId(root, 't').style
    expect(s.overflowWrap).toBe('anywhere')
    expect(s.minWidth).toBe('0')
    expect(s.whiteSpace).toBe('pre-line')
  })
  it('prose wraps its article in overflow-wrap: anywhere (inherited by its headings)', () => {
    const root = mount(el(ProseBlock, 'p', 'prose', { content: '# Mahallenizin\n\nmetin' }))
    expect(byId(root, 'p').style.overflowWrap).toBe('anywhere')
  })
})
