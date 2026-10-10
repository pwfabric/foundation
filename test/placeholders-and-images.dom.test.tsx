/**
 * Unfilled slots keep the layout.
 *
 *   image-live   an empty image src renders the themeable slot in the live app
 *                (quiet, alt kept for screen readers); hideWhenEmpty still hides
 *   image-mark   a placeholder src (data:image/svg+xml carrying
 *                pw-placeholder:<key>) draws the slot, not the grey SVG, and
 *                exposes data-pw-placeholder="<key>"
 *   need-tile    content.placeholder — label, need, kind, minHeight; the editor
 *                says what is coming, the live app stays quiet
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { ImageBlock, placeholderKey, readPlaceholder } from '../atoms/blocks/media/image/component.js'
import { PlaceholderBlock, placeholderPropsSchema } from '../atoms/blocks/content/placeholder/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>
const LIVE = { interactionMode: 'live' }
const INERT = { interactionMode: 'inert' }

function el(
  C: unknown,
  id: string,
  type: string,
  props: Record<string, unknown>,
  context: Record<string, unknown> = LIVE,
  style?: Record<string, unknown>
) {
  const Comp = C as AnyBlock
  return <Comp key={id} props={props} block={{ id, type, props, layout: {}, ...(style ? { style } : {}) }} context={context} />
}

/** The platform placeholder as an app builder writes it: URL-encoded SVG, marker in <desc>. */
const svg = (key: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" data-pw-placeholder="${key}"><desc>pw-placeholder:${key}</desc><rect width="100%" height="100%" fill="#e5e8ec" fill-opacity=".35"/></svg>`
const urlEncoded = (key: string) => `data:image/svg+xml,${encodeURIComponent(svg(key))}`
const base64 = (key: string) => `data:image/svg+xml;base64,${btoa(svg(key))}`

describe('placeholderKey — the platform marker, read locally', () => {
  it('reads the key from a URL-encoded placeholder', () => {
    expect(placeholderKey(urlEncoded('hero.image'))).toBe('hero.image')
  })
  it('reads the key from a base64 and a raw placeholder', () => {
    expect(placeholderKey(base64('team-1'))).toBe('team-1')
    expect(placeholderKey(`data:image/svg+xml;utf8,${svg('raw_key')}`)).toBe('raw_key')
  })
  it('is null for a real image, a data URI without the marker and a non-SVG data URI', () => {
    expect(placeholderKey('https://cdn.example.com/pw-placeholder:x.png')).toBeNull()
    expect(placeholderKey(`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`)).toBeNull()
    expect(placeholderKey('data:image/png;base64,cHctcGxhY2Vob2xkZXI6eA==')).toBeNull()
  })
  it('reads the SVG size, or the viewBox when width/height are absent', () => {
    expect(readPlaceholder(urlEncoded('s'))).toEqual({ key: 's', width: 1200, height: 800 })
    const vb = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><desc>pw-placeholder:v</desc></svg>')}`
    expect(readPlaceholder(vb)).toEqual({ key: 'v', width: 640, height: 480 })
    const none = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><desc>pw-placeholder:n</desc></svg>')}`
    expect(readPlaceholder(none)).toEqual({ key: 'n' })
  })
  it('a percent-sized SVG falls through to its viewBox', () => {
    const pct = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1200 800"><desc>pw-placeholder:p</desc></svg>')}`
    expect(readPlaceholder(pct)).toEqual({ key: 'p', width: 1200, height: 800 })
    const { container } = render(el(ImageBlock, 'pc', 'image', { src: pct }))
    expect((container.querySelector('[data-pw-placeholder="p"]') as HTMLElement).style.aspectRatio).toBe('1200/800')
  })
  it('survives a malformed encoding without throwing', () => {
    expect(placeholderKey('data:image/svg+xml,%E0%A4%A')).toBeNull()
  })
})

describe('P-image-live — an empty src keeps its slot in the live app', () => {
  it('renders the themeable slot live, with the size it was given and no label text', () => {
    const { container } = render(el(ImageBlock, 'hero', 'image', { src: '', alt: 'Studio front', aspectRatio: '16/9' }))
    const slot = container.querySelector('[data-image-placeholder]') as HTMLElement
    expect(slot).not.toBeNull()
    expect(slot.getAttribute('data-block-type')).toBe('image')
    expect(slot.style.aspectRatio).toBe('16/9')
    expect(slot.style.backgroundColor).toBe('var(--pw-color-card)')
    expect(container.textContent).toBe('')
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps the alt for screen readers', () => {
    const { container } = render(el(ImageBlock, 'hero', 'image', { src: '', alt: 'Studio front' }))
    const slot = container.querySelector('[data-image-placeholder]') as HTMLElement
    expect(slot.getAttribute('role')).toBe('img')
    expect(slot.getAttribute('aria-label')).toBe('Studio front')
  })

  it('a slot with no alt is decorative and hidden from assistive tech', () => {
    const { container } = render(el(ImageBlock, 'deco', 'image', { src: '' }))
    const slot = container.querySelector('[data-image-placeholder]') as HTMLElement
    expect(slot.getAttribute('aria-hidden')).toBe('true')
    expect(slot.getAttribute('role')).toBeNull()
  })

  it('keeps a fixed height when one is given', () => {
    const { container } = render(el(ImageBlock, 'h', 'image', { src: '', height: 320 }))
    expect((container.querySelector('[data-image-placeholder]') as HTMLElement).style.height).toBe('320px')
  })

  it('the editor still labels the slot', () => {
    const { container } = render(el(ImageBlock, 'hero', 'image', { src: '', alt: 'Kapak' }, INERT))
    expect(container.textContent).toContain('Kapak')
  })

  it('a broken src in the live app: no <img>, the quiet slot, no text', async () => {
    const { container } = render(el(ImageBlock, 'b', 'image', { src: 'https://x.test/gone.jpg', alt: 'Gone', aspectRatio: '4/3' }))
    await act(async () => fireEvent.error(container.querySelector('img') as HTMLImageElement))
    expect(container.querySelector('img')).toBeNull()
    const slot = container.querySelector('[data-image-placeholder]') as HTMLElement
    expect(slot).not.toBeNull()
    expect(slot.style.aspectRatio).toBe('4/3')
    expect(container.textContent).toBe('')
  })

  it('a broken src with hideWhenEmpty leaves nothing', async () => {
    const { container } = render(el(ImageBlock, 'b', 'image', { src: 'https://x.test/gone.png', hideWhenEmpty: true }))
    await act(async () => fireEvent.error(container.querySelector('img') as HTMLImageElement))
    expect(container.innerHTML).toBe('')
  })

  it('an aligned slot sits in the alignment wrapper', () => {
    const { container } = render(el(ImageBlock, 'al', 'image', { src: urlEncoded('al'), align: 'right' }))
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.justifyContent).toBe('flex-end')
    expect(wrapper.querySelector('[data-pw-placeholder="al"]')).not.toBeNull()
  })

  it('block.style overrides the slot', () => {
    const { container } = render(el(ImageBlock, 'st', 'image', { src: '' }, LIVE, { borderRadius: '0px', backgroundColor: 'transparent' }))
    const slot = container.querySelector('[data-image-placeholder]') as HTMLElement
    expect(slot.style.borderRadius).toBe('0px')
    expect(slot.style.backgroundColor).toBe('transparent')
  })

  it('hideWhenEmpty still draws nothing, live and in the editor', () => {
    for (const ctx of [LIVE, INERT]) {
      const { container, unmount } = render(el(ImageBlock, 'logo', 'image', { src: '', alt: 'Acme logo', hideWhenEmpty: true }, ctx))
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
})

describe('P-image-mark — a platform placeholder src is a slot, not a picture', () => {
  for (const [name, value] of [
    ['URL-encoded', urlEncoded('about.hero')],
    ['base64', base64('about.hero')],
  ] as const) {
    it(`${name}: draws the themeable slot with data-pw-placeholder, never the grey SVG`, () => {
      const { container } = render(el(ImageBlock, 'a', 'image', { src: value, alt: 'Our team' }))
      expect(container.querySelector('img')).toBeNull()
      const slot = container.querySelector('[data-pw-placeholder]') as HTMLElement
      expect(slot).not.toBeNull()
      expect(slot.getAttribute('data-pw-placeholder')).toBe('about.hero')
      expect(slot.hasAttribute('data-image-placeholder')).toBe(true)
      expect(slot.getAttribute('aria-label')).toBe('Our team')
    })
  }

  it('the editor sees the same slot and key', () => {
    const { container } = render(el(ImageBlock, 'a', 'image', { src: urlEncoded('k1') }, INERT))
    expect(container.querySelector('[data-pw-placeholder="k1"]')).not.toBeNull()
  })

  it('with no declared ratio or height, the slot takes the placeholder SVG ratio', () => {
    const { container } = render(el(ImageBlock, 'r', 'image', { src: urlEncoded('r') }))
    const slot = container.querySelector('[data-pw-placeholder]') as HTMLElement
    expect(slot.style.aspectRatio).toBe('1200/800')
    expect(slot.style.height).toBe('auto')
  })

  it('a declared aspectRatio or height wins over the SVG ratio', () => {
    const a = render(el(ImageBlock, 'r1', 'image', { src: urlEncoded('r1'), aspectRatio: '1/1' }))
    expect((a.container.querySelector('[data-pw-placeholder]') as HTMLElement).style.aspectRatio).toBe('1/1')
    a.unmount()
    const h = render(el(ImageBlock, 'r2', 'image', { src: urlEncoded('r2'), height: 300 }))
    const slot = h.container.querySelector('[data-pw-placeholder]') as HTMLElement
    expect(slot.style.height).toBe('300px')
    expect(slot.style.aspectRatio).toBe('')
  })

  it('hideWhenEmpty treats a placeholder as empty', () => {
    const { container } = render(el(ImageBlock, 'logo', 'image', { src: urlEncoded('logo'), hideWhenEmpty: true }))
    expect(container.innerHTML).toBe('')
  })

  it('a real src is still an <img> without the attribute', () => {
    const { container } = render(el(ImageBlock, 'r', 'image', { src: 'https://cdn.example.com/a.jpg', alt: 'A' }))
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/a.jpg')
    expect(container.querySelector('[data-pw-placeholder]')).toBeNull()
  })
})

describe('P-need-tile — content.placeholder', () => {
  it('schema defaults: empty label and need, kind block', () => {
    expect(placeholderPropsSchema.parse({})).toEqual({ label: '', need: '', kind: 'block' })
    expect(() => placeholderPropsSchema.parse({ kind: 'widget' })).toThrow()
  })

  it('exposes the need and its kind on the root, and honours minHeight', () => {
    const { container } = render(
      el(PlaceholderBlock, 'p', 'placeholder', { label: 'Booking calendar', need: 'booking-calendar', kind: 'capability', minHeight: 240 })
    )
    const root = container.querySelector('[data-block-type="placeholder"]') as HTMLElement
    expect(root.id).toBe('p')
    expect(root.getAttribute('data-pw-need')).toBe('booking-calendar')
    expect(root.getAttribute('data-pw-need-kind')).toBe('capability')
    expect(root.style.minHeight).toBe('240px')
  })

  it('live: quiet — no text, no role, hidden from assistive tech, no call to action', () => {
    const { container } = render(el(PlaceholderBlock, 'p', 'placeholder', { label: 'Booking calendar', need: 'booking-calendar' }))
    const root = container.querySelector('[data-block-type="placeholder"]') as HTMLElement
    expect(container.textContent).toBe('')
    expect(root.getAttribute('role')).toBeNull()
    expect(root.getAttribute('aria-label')).toBeNull()
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('a,button')).toBeNull()
  })

  it('block.style overrides the tile', () => {
    const { container } = render(el(PlaceholderBlock, 'p', 'placeholder', { need: 'x' }, LIVE, { minHeight: '48px', backgroundColor: 'transparent' }))
    const root = container.querySelector('[data-block-type="placeholder"]') as HTMLElement
    expect(root.style.minHeight).toBe('48px')
    expect(root.style.backgroundColor).toBe('transparent')
  })

  it('editor: says what is coming, by kind and need', () => {
    const { container } = render(el(PlaceholderBlock, 'p', 'placeholder', { label: 'Map', need: 'store-map', kind: 'connector' }, INERT))
    expect(container.textContent).toContain('Map')
    expect(container.textContent).toContain('Still to come')
    expect(container.textContent).toContain('connection')
    expect(container.textContent).toContain('store-map')
  })

  it('defaults: 120px tall, kind block, no text', () => {
    const { container } = render(el(PlaceholderBlock, 'p', 'placeholder', {}))
    const root = container.querySelector('[data-block-type="placeholder"]') as HTMLElement
    expect(root.style.minHeight).toBe('120px')
    expect(root.getAttribute('data-pw-need-kind')).toBe('block')
    expect(root.hasAttribute('data-pw-need')).toBe(false)
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('')
  })

  it('an unknown kind falls back to block', () => {
    const { container } = render(el(PlaceholderBlock, 'p', 'placeholder', { kind: 'nonsense' }))
    expect(container.querySelector('[data-pw-need-kind="block"]')).not.toBeNull()
  })
})
