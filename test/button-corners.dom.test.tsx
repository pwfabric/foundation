/**
 * A button's corner is its own token.
 *
 * When every button reads `--pw-border-radius` — the corner containers and
 * inputs read too — a theme cannot give pill buttons without turning every
 * card into a pill. Buttons read `--pw-button-radius` first and fall back to
 * the theme corner, so a theme that does not set it renders exactly as
 * before. The block.style and container tests are guards.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { render, cleanup } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { ButtonBlock } from '../atoms/blocks/control/button/component.js'
import { FormBlock } from '../atoms/blocks/form/form/component.js'
import { ContainerBlock } from '../atoms/blocks/layout/container/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>
const LIVE = { interactionMode: 'live' }
const BUTTON_CORNER = 'var(--pw-button-radius, var(--pw-border-radius))'

function mount(C: unknown, type: string, props: Record<string, unknown>, style?: Record<string, unknown>): HTMLElement {
  const Comp = C as AnyBlock
  const block = { id: 'b', type, props, layout: {}, ...(style ? { style } : {}) }
  return render(
    <BehaviorSurfaceProvider surfaceId="t">
      <Comp props={props} block={block} context={LIVE} />
    </BehaviorSurfaceProvider>,
  ).container
}

describe('button corner token', () => {
  it('control.button reads --pw-button-radius, then the theme corner', () => {
    const b = mount(ButtonBlock, 'button', { label: 'Join' }).querySelector('button') as HTMLElement
    expect(b.style.borderRadius).toBe(BUTTON_CORNER)
  })

  it('block.style still wins over the token (guard)', () => {
    const b = mount(ButtonBlock, 'button', { label: 'Join' }, { borderRadius: '2px' }).querySelector('button') as HTMLElement
    expect(b.style.borderRadius).toBe('2px')
  })

  it('the form submit and reset buttons read the same token', () => {
    const c = mount(FormBlock, 'form', { submitLabel: 'Send', showReset: true, resetLabel: 'Clear' })
    const buttons = Array.from(c.querySelectorAll('button')) as HTMLElement[]
    expect(buttons.map((x) => x.textContent)).toEqual(expect.arrayContaining(['Send', 'Clear']))
    for (const x of buttons) expect(x.style.borderRadius).toBe(BUTTON_CORNER)
  })

  it('a container keeps the theme corner (guard)', () => {
    const c = mount(ContainerBlock, 'container', { borderRadius: 'theme' })
    expect(c.innerHTML).not.toContain('--pw-button-radius')
  })
})
