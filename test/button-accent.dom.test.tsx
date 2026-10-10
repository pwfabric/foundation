/**
 * The accent button's label reads the accent's own ink.
 *
 * The accent variant painted `--pw-color-accent` but took its label colour
 * from `--pw-color-text-on-primary`, the primary fill's pair. contracts derives
 * `--pw-color-on-accent` and a theme can set it via styleVariables, so the
 * label reads `var(--pw-color-on-accent, var(--pw-color-text-on-primary))`.
 * The primary-variant test is a guard: it holds before and after.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { render, cleanup } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { ButtonBlock } from '../atoms/blocks/control/button/component.js'

afterEach(() => cleanup())

type AnyBlock = React.FC<Record<string, unknown>>

function mountButton(props: Record<string, unknown>): HTMLButtonElement {
  const Comp = ButtonBlock as unknown as AnyBlock
  const block = { id: 'b', type: 'button', props, layout: {} }
  return render(
    <BehaviorSurfaceProvider surfaceId="t">
      <Comp props={props} block={block} context={{ interactionMode: 'live' }} />
    </BehaviorSurfaceProvider>,
  ).container.querySelector('button')!
}

describe('button accent ink', () => {
  it('the accent variant reads --pw-color-on-accent first', () => {
    const b = mountButton({ label: 'Rezervasyon', variant: 'accent' })
    expect(b.style.backgroundColor).toBe('var(--pw-color-accent)')
    expect(b.style.color).toBe('var(--pw-color-on-accent, var(--pw-color-text-on-primary))')
  })

  it('the primary variant keeps text-on-primary (guard)', () => {
    const b = mountButton({ label: 'Send', variant: 'primary' })
    expect(b.style.color).toBe('var(--pw-color-text-on-primary)')
  })
})
