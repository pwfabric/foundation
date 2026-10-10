/**
 * A button with an external address opens it like the link does.
 *
 * `control.button` navigated with `window.location.href`, so an external
 * address (https://example.com) replaced the app in the same tab, while
 * `control.link` opens external addresses in a new tab. The button now takes an
 * optional `target` (_self | _blank); unset, an external absolute http(s)
 * address opens in a new tab (noopener, noreferrer), everything else stays.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import * as React from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { ButtonBlock, buttonPropsSchema } from '../atoms/blocks/control/button/component.js'
import manifest from '../atoms/blocks/control/button/manifest.json'

type AnyBlock = React.FC<Record<string, unknown>>
let openSpy: ReturnType<typeof vi.fn>
const realLocation = window.location

beforeEach(() => {
  openSpy = vi.fn()
  vi.stubGlobal('open', openSpy)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'http://localhost:3000/', origin: 'http://localhost:3000' },
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
})

function click(props: Record<string, unknown>, mode = 'live'): void {
  const Comp = ButtonBlock as unknown as AnyBlock
  const p = { label: 'Go', ...props }
  const block = { id: 'b', type: 'button', props: p, layout: {} }
  const { container } = render(
    <BehaviorSurfaceProvider surfaceId="t">
      <Comp props={p} block={block} context={{ interactionMode: mode }} />
    </BehaviorSurfaceProvider>,
  )
  fireEvent.click(container.querySelector('button')!)
}

describe('button href target', () => {
  it('an external https address opens in a new tab with noopener,noreferrer', () => {
    click({ href: 'https://example.com' })
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(window.location.href).toBe('http://localhost:3000/')
  })

  it('an external http address opens in a new tab', () => {
    click({ href: 'http://docs.example.com/x' })
    expect(openSpy).toHaveBeenCalledTimes(1)
  })

  it('a relative address, # and a query stay in this tab', () => {
    for (const href of ['/pricing', '#top', '?a=1', './x']) {
      click({ href })
      expect(window.location.href).toBe(href)
      cleanup()
    }
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('a same-origin absolute address stays in this tab', () => {
    click({ href: 'http://localhost:3000/pricing' })
    expect(openSpy).not.toHaveBeenCalled()
    expect(window.location.href).toBe('http://localhost:3000/pricing')
  })

  it('mailto: and tel: are unchanged (this tab)', () => {
    click({ href: 'mailto:a@b.co' })
    expect(window.location.href).toBe('mailto:a@b.co')
    cleanup()
    click({ href: 'tel:+15555550100' })
    expect(window.location.href).toBe('tel:+15555550100')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('target _self keeps an external address in this tab', () => {
    click({ href: 'https://example.com', target: '_self' })
    expect(openSpy).not.toHaveBeenCalled()
    expect(window.location.href).toBe('https://example.com')
  })

  it('target _blank opens even an internal address in a new tab', () => {
    click({ href: '/pricing', target: '_blank' })
    expect(openSpy).toHaveBeenCalledWith('/pricing', '_blank', 'noopener,noreferrer')
  })

  it('inert mode navigates nowhere', () => {
    click({ href: 'https://example.com' }, 'inert')
    expect(openSpy).not.toHaveBeenCalled()
    expect(window.location.href).toBe('http://localhost:3000/')
  })

  it('target is in the schema and the manifest', () => {
    expect(buttonPropsSchema.safeParse({ target: '_blank' }).success).toBe(true)
    expect(buttonPropsSchema.safeParse({ target: '_top' }).success).toBe(false)
    const names = (manifest as { definition: { props: { name: string }[] } }).definition.props.map((p) => p.name)
    expect(names).toContain('target')
  })
})
