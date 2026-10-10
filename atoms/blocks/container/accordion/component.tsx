import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { MOTION, safeRenderValue, transitionOf } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const accordionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  disabled: z.boolean().optional(),
})

export const accordionPropsSchema = z.object({
  items: z.array(accordionItemSchema).default([]),
  allowMultiple: z.boolean().default(false),
  defaultOpen: z.array(z.string()).optional(),
  variant: z.enum(['default', 'bordered', 'separated']).default('default'),
})

export type AccordionProps = z.infer<typeof accordionPropsSchema>
export type AccordionItem = z.infer<typeof accordionItemSchema>

// ============================================================
// DEFINITION
// ============================================================

export const accordionDefinition: BlockDefinition = {
  type: 'accordion',
  name: 'Accordion',
  category: 'container',
  icon: '⊟',
  schema: accordionPropsSchema,
  defaultProps: {
    items: [],
    allowMultiple: false,
    variant: 'default',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

interface AccordionItemData {
  id: string
  title: string
  content: string
  disabled?: boolean
}

export const AccordionBlock: BlockComponent = ({ props, block }) => {
  // Not an array (unset, or a binding that has not resolved yet) → nothing.
  // "Section 1 / Section 2" samples reached visitors.
  const items = Array.isArray(props.items) ? (props.items as AccordionItemData[]) : []
  const allowMultiple = props.allowMultiple as boolean
  const defaultOpen = Array.isArray(props.defaultOpen) ? (props.defaultOpen as string[]) : []
  const variant = (props.variant as string) ?? 'default'

  const [openItems, setOpenItems] = React.useState<Set<string>>(new Set(defaultOpen))

  const toggleItem = (id: string): void => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (!allowMultiple) {
          next.clear()
        }
        next.add(id)
      }
      return next
    })
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: variant === 'separated' ? '8px' : '0',
    border: variant === 'bordered' ? '1px solid var(--pw-color-border)' : undefined,
    borderRadius: variant === 'bordered' ? '8px' : undefined,
    overflow: variant === 'bordered' ? 'hidden' : undefined,
  }

  const itemStyle = (isFirst: boolean): React.CSSProperties => ({
    borderTop: variant === 'default' && !isFirst ? '1px solid var(--pw-color-border)' : undefined,
    border: variant === 'separated' ? '1px solid var(--pw-color-border)' : undefined,
    borderRadius: variant === 'separated' ? '8px' : undefined,
    overflow: 'hidden',
  })

  const headerBtnStyle = (isOpen: boolean, disabled?: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: isOpen ? 'var(--pw-color-card)' : 'transparent',
    // NOT the UA button black: inherit the ambient colour when closed, card ink when open
    color: isOpen ? 'var(--pw-color-text-on-card, var(--pw-color-text))' : 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontWeight: 500,
    fontSize: 'var(--pw-font-size-sm)',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: `background-color ${MOTION.normal}`,
  })

  const contentStyle = (isOpen: boolean): React.CSSProperties => ({
    padding: isOpen ? '12px 16px' : '0 16px',
    maxHeight: isOpen ? '500px' : '0',
    overflow: 'hidden',
    // The panel opens at the theme's slow pace: an entrance, not a flick.
    transition: transitionOf(['max-height', 'padding'], MOTION.slow),
    fontSize: 'var(--pw-font-size-sm)',
    color: 'var(--pw-color-text-muted-on-card, var(--pw-color-text-muted))',
  })

  const chevronStyle = (isOpen: boolean): React.CSSProperties => ({
    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
    // The chevron springs on the theme's bounce easing — a lively theme's turn.
    transition: `transform ${MOTION.spring}`,
  })

  return (
    <div id={block.id} data-block-id={block.id} style={{ ...containerStyle, ...block.style }} data-block-type="accordion">
      {items.map((item: AccordionItemData, index: number) => {
        // `id` is REQUIRED by the manifest, but a receipt that omits it used to
        // produce `…-header-undefined` for every row — duplicate DOM ids, broken
        // aria-controls and a React key warning, none of which fail loudly.
        // Falling back to the index keeps the rows addressable and distinct.
        const itemId = item.id ?? String(index)
        const isOpen = openItems.has(itemId)
        const headerId = `${block.id}-header-${itemId}`
        const panelId = `${block.id}-panel-${itemId}`
        return (
          <div key={itemId} style={itemStyle(index === 0)}>
            <button
              type="button"
              id={headerId}
              style={headerBtnStyle(isOpen, item.disabled)}
              onClick={() => !item.disabled && toggleItem(itemId)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              aria-disabled={item.disabled ?? false}
            >
              <span>{safeRenderValue(item.title)}</span>
              <span style={chevronStyle(isOpen)} aria-hidden="true">
                {'\u25BC'}
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              style={contentStyle(isOpen)}
              hidden={!isOpen}
            >
              {isOpen && safeRenderValue(item.content)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
