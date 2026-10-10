import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { safeHref } from '../../../lib/_shared-utils.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

export const breadcrumbItemSchema = z.object({
  label: z.string(),
  href: z.string().optional(),
})

export const breadcrumbPropsSchema = z.object({
  items: z.array(breadcrumbItemSchema).default([]),
  separator: z.enum(['/', '›', '>']).default('/'),
})

export type BreadcrumbProps = z.infer<typeof breadcrumbPropsSchema>
export type BreadcrumbItem = z.infer<typeof breadcrumbItemSchema>

// ============================================================
// DEFINITION
// ============================================================

export const breadcrumbDefinition: BlockDefinition = {
  type: 'breadcrumb',
  name: 'Breadcrumb',
  category: 'control',
  icon: '›',
  schema: breadcrumbPropsSchema,
  defaultProps: {
    items: [],
    separator: '/',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

interface BreadcrumbItemData {
  label: string
  href?: string
}

export const BreadcrumbBlock: BlockComponent = ({ props, block, context }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const items = Array.isArray(props.items) ? (props.items as BreadcrumbItemData[]) : []
  const separator = (props.separator as string) ?? '/'

  // Native <a href> anchors navigate via the browser default. Real navigation
  // is a SIDE-EFFECT: in inert (editor/preview) mode cancel it and emit a
  // `navigate` notification instead, so a preview doesn't leave the page.
  const handleNavClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (context?.interactionMode === 'inert') {
      e.preventDefault()
      emit({ type: SURFACE_EVENTS.BLOCK_CLICK, surfaceId, blockId: block.id, payload: { href } })
    }
  }

  const navStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
  }

  const olStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    listStyle: 'none',
    padding: 0,
    margin: 0,
    flexWrap: 'wrap',
  }

  const separatorStyle: React.CSSProperties = {
    color: 'var(--pw-color-text-muted)',
    fontSize: 'var(--pw-font-size-sm)',
    userSelect: 'none',
  }

  return (
    <nav aria-label="breadcrumb" data-block-type="breadcrumb" style={{ ...navStyle, ...block.style }}>
      <ol id={block.id} data-block-id={block.id} style={olStyle}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          // Two separate facts decide whether a crumb is a link: the href is
          // present at all, and `safeHref` accepts it (it rejects javascript:,
          // data: and friends). Hoisting both lets the anchor branch keep the
          // RAW href for the click handler — the emitted `navigate` payload has
          // always carried the author's value, not the trimmed copy.
          const rawHref = item.href
          const href = safeHref(rawHref)
          return (
            <React.Fragment key={i}>
              <li
                style={{ display: 'flex', alignItems: 'center' }}
                aria-current={isLast ? 'page' : undefined}
              >
                {isLast || rawHref === undefined || !href ? (
                  <span
                    style={{
                      fontSize: 'var(--pw-font-size-sm)',
                      color: isLast ? 'var(--pw-color-text)' : 'var(--pw-color-text-muted)',
                      fontWeight: isLast ? 500 : 400,
                    }}
                  >
                    {item.label}
                  </span>
                ) : (
                  <a
                    href={href}
                    onClick={handleNavClick(rawHref)}
                    style={{
                      fontSize: 'var(--pw-font-size-sm)',
                      color: 'var(--pw-color-primary-ink, #18181b)',
                      textDecoration: 'none',
                    }}
                  >
                    {item.label}
                  </a>
                )}
              </li>
              {!isLast && (
                <span style={separatorStyle} aria-hidden="true">
                  {separator}
                </span>
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
