/**
 * The link's icon is drawn beside its text, not instead of it.
 *
 * A link that renders `icon ? <svg/> : text` turns a `tel:` link with icon
 * "phone" into a 16px glyph — the number invisible and the anchor without an
 * accessible name. The icon sits before the text (aria-hidden), and the name
 * is the visible text, or `ariaLabel` if given.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { render, cleanup } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { LinkBlock } from '../atoms/blocks/control/link/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>
const LIVE = { interactionMode: 'live' }

function mount(props: Record<string, unknown>): HTMLElement {
  const Comp = LinkBlock as unknown as AnyBlock
  const block = { id: 'b', type: 'link', props, layout: {} }
  return render(
    <BehaviorSurfaceProvider surfaceId="t">
      <Comp props={props} block={block} context={LIVE} />
    </BehaviorSurfaceProvider>,
  ).container
}

describe('link icon beside the text', () => {
  it('a tel: link with an icon shows the icon AND the number', () => {
    const c = mount({ href: 'tel:+15555550100', text: '+1 555 555 0100', icon: 'phone' })
    const a = c.querySelector('a')!
    expect(a).not.toBeNull()
    expect(a.querySelector('svg')).not.toBeNull()
    expect(a.textContent).toBe('+1 555 555 0100')
    // icon first, then the text
    expect(a.firstChild?.nodeName.toLowerCase()).toBe('svg')
    expect(a.style.display).toBe('inline-flex')
    expect(a.style.gap).not.toBe('')
  })

  it('the icon is decoration; the accessible name is the text', () => {
    const c = mount({ href: 'tel:+15555550100', text: '+1 555 555 0100', icon: 'phone' })
    const a = c.querySelector('a')!
    expect(a.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    // no aria-label overriding the visible text
    expect(a.getAttribute('aria-label')).toBeNull()
  })

  it('ariaLabel wins when the author gives one', () => {
    const c = mount({ href: 'tel:+15555550100', text: '+1 555 555 0100', icon: 'phone', ariaLabel: 'Call us' })
    expect(c.querySelector('a')!.getAttribute('aria-label')).toBe('Call us')
  })

  it('icon-only link (no text) is still named', () => {
    const c = mount({ href: 'tel:+15555550100', icon: 'phone' })
    const a = c.querySelector('a')!
    expect(a.querySelector('svg')).not.toBeNull()
    expect(a.getAttribute('aria-label')).toBe('phone')
  })

  it('a target-less link with an icon is a label that also keeps both', () => {
    const c = mount({ text: 'Destek', icon: 'phone' })
    const span = c.querySelector('span[data-block-type="link"]')!
    expect(span.querySelector('svg')).not.toBeNull()
    expect(span.textContent).toBe('Destek')
  })

  it('without an icon the link draws its text as before (guard)', () => {
    const c = mount({ href: '/help', text: 'Help' })
    const a = c.querySelector('a')!
    expect(a.textContent).toBe('Help')
    expect(a.querySelector('svg')).toBeNull()
    expect(a.style.display).toBe('')
  })

  it('no text and no icon renders nothing (guard)', () => {
    const c = mount({ href: '/yardim' })
    expect(c.querySelector('a')).toBeNull()
  })
})
