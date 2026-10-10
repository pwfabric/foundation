/**
 * The shell and brand-mark logo is sized by height, and the name is drawn
 * only when there is no logo.
 *
 * A fixed `width: 40` — a square-icon assumption — renders a 420×120
 * wordmark at 40×11 px, and a name printed beside a logo that already carries
 * it splits the bar in two. The logo takes a height (28px, the navbar's logo
 * height) with its width following the picture, and the name carries
 * `hideWhenSet: "{{LOGO}}"`. The brand-mark band gets the same rule.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { TextBlock } from '../atoms/blocks/text/text/component.js'
import { ImageBlock } from '../atoms/blocks/media/image/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>
const LIVE = { interactionMode: 'live' }

function mount(C: unknown, type: string, props: Record<string, unknown>, style?: Record<string, unknown>): HTMLElement {
  const Comp = C as AnyBlock
  const block = { id: 'b', type, props, layout: {}, ...(style ? { style } : {}) }
  return render(
    <BehaviorSurfaceProvider surfaceId="t">
      <Comp props={props} block={block} context={LIVE} />
    </BehaviorSurfaceProvider>,
  ).container
}

describe('text hideWhenSet', () => {
  it('a name beside a logo is not drawn', () => {
    const c = mount(TextBlock, 'text', { content: 'SwiftCargo', hideWhenSet: '/media/logo.svg' })
    expect(c.textContent).toBe('')
  })

  it('no logo: the name is drawn (guard)', () => {
    const c = mount(TextBlock, 'text', { content: 'SwiftCargo', hideWhenSet: '' })
    expect(c.textContent).toBe('SwiftCargo')
  })

  it('an unfilled {{LOGO}} slot counts as no logo', () => {
    const c = mount(TextBlock, 'text', { content: 'SwiftCargo', hideWhenSet: '{{LOGO}}' })
    expect(c.textContent).toBe('SwiftCargo')
  })

  it('without the prop the text draws as before (guard)', () => {
    const c = mount(TextBlock, 'text', { content: 'Merhaba' })
    expect(c.textContent).toBe('Merhaba')
  })
})

describe('logo sized by height', () => {
  it('height 28 + width auto reaches the img, never a 100% width', () => {
    const c = mount(ImageBlock, 'image', { src: 'https://example.com/logo.svg', alt: 'SwiftCargo', height: 28, width: 'auto', objectFit: 'contain', hideWhenEmpty: true })
    const img = c.querySelector('img') as HTMLImageElement
    expect(img.style.height).toBe('28px')
    expect(img.style.width).toBe('auto')
    expect(img.style.objectFit).toBe('contain')
  })
})

describe('shell brand rows', () => {
  const dir = join(__dirname, '..', 'atoms', 'patterns')
  const shells = readdirSync(dir).filter((f) => f.startsWith('shell-') && f.endsWith('.json'))
  const withBrandRow: string[] = []

  type Node = { id?: string; props?: Record<string, unknown>; style?: Record<string, unknown>; children?: Node[] }
  const find = (n: Node, id: string): Node | undefined =>
    n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean)

  for (const f of shells) {
    const pattern = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { snippet: Node }
    const logo = find(pattern.snippet, '{{ID}}-brand-logo')
    if (!logo) continue
    withBrandRow.push(f)
    it(`${f}: the logo has a height, no fixed width, and keeps its own width in the row`, () => {
      expect(logo.props?.height).toBe(28)
      expect(typeof logo.props?.width).not.toBe('number')
      expect(logo.style?.flex).toBe('0 0 auto')
    })
    it(`${f}: the name is drawn only without a logo`, () => {
      const name = find(pattern.snippet, '{{ID}}-brand-name')
      expect(name?.props?.hideWhenSet).toBe('{{LOGO}}')
    })
  }

  it('brand-mark: the logo has a height, no fixed width, and the name is drawn only without a logo', () => {
    const band = JSON.parse(readFileSync(join(dir, 'brand-mark.json'), 'utf8')) as { snippet: Node }
    const logo = find(band.snippet, '{{ID}}-i')
    const name = find(band.snippet, '{{ID}}-n')
    expect(logo?.props?.src).toBe('{{LOGO}}')
    expect(logo?.props?.height).toBe(28)
    expect(typeof logo?.props?.width).not.toBe('number')
    expect(logo?.style?.flex).toBe('0 0 auto')
    expect(name?.props?.hideWhenSet).toBe('{{LOGO}}')
  })

  it('every shell with a logo slot was measured (positive control)', () => {
    expect(withBrandRow.sort()).toEqual([
      'shell-bottombar-dense.json',
      'shell-bottombar-flow.json',
      'shell-bottombar-grid.json',
      'shell-none-flow.json',
    ])
  })
})
