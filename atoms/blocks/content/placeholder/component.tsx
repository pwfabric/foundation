import { z } from 'zod'
import * as React from 'react'
import type { BlockCategory, BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, safeRenderValue, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

/** What the unmet need is — a generator or a marketplace install fills it later. */
export const placeholderNeedKindSchema = z.enum(['block', 'capability', 'connector', 'pattern', 'icon'])

export const placeholderPropsSchema = z.object({
  // A short human name for what will stand here ("Booking calendar").
  label: z.string().default(''),
  // The need key the composer recorded; the editor and gates find the tile by it.
  need: z.string().default(''),
  kind: placeholderNeedKindSchema.default('block'),
  minHeight: z.union([z.number(), z.string()]).optional(),
})

export type PlaceholderProps = z.infer<typeof placeholderPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

// `content` is a pack family the core `BlockCategory` union does not list yet.
// The manifest's category is a plain string (contracts keep it open on
// purpose), so the value is honest; the cast only keeps the in-code definition
// typed until the union learns the family.
const CONTENT = 'content' as unknown as BlockCategory

export const placeholderDefinition: BlockDefinition = {
  type: 'placeholder',
  name: 'Placeholder',
  category: CONTENT,
  icon: '⬚',
  schema: placeholderPropsSchema,
  defaultProps: {
    label: '',
    need: '',
    kind: 'block',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

const KIND_NOUN: Record<string, string> = {
  block: 'block',
  capability: 'capability',
  connector: 'connection',
  pattern: 'section',
  icon: 'icon',
}

/**
 * A slot for something the app needs and the catalogue does not carry yet.
 * A composer places it for an unmet block need; the need is fulfilled later
 * (a new block, a market install) and the tile is replaced.
 *
 * Editor: the label and what is coming. Live: the same themeable ground and
 * nothing else — like an unfilled image slot, no text reaches the visitor and
 * the tile is hidden from assistive tech; there is nothing to read or act on.
 */
export const PlaceholderBlock: BlockComponent = ({ props, block, context }) => {
  const inert = context?.interactionMode === 'inert'
  const label = typeof props.label === 'string' ? props.label.trim() : ''
  const need = typeof props.need === 'string' ? props.need.trim() : ''
  const kind = typeof props.kind === 'string' && props.kind in KIND_NOUN ? props.kind : 'block'

  const style: React.CSSProperties = {
    width: '100%',
    maxWidth: '100%',
    minHeight: cssUnit(props.minHeight as CSSUnit) ?? '120px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '16px',
    borderRadius: 'var(--pw-border-radius)',
    backgroundColor: 'var(--pw-color-card)',
    border: '1px dashed var(--pw-color-border)',
    color: 'var(--pw-color-text-muted)',
    fontSize: 'var(--pw-font-size-sm)',
    textAlign: 'center',
    ...block.style,
  }

  return (
    <div
      id={block.id}
      data-block-id={block.id}
      data-block-type="placeholder"
      data-pw-need={need || undefined}
      data-pw-need-kind={kind}
      style={style}
      aria-hidden={inert ? undefined : 'true'}
    >
      {inert && label ? <span>{safeRenderValue(label)}</span> : null}
      {inert ? (
        <span style={{ opacity: 0.8 }}>
          {`Still to come — ${KIND_NOUN[kind]}${need ? ` · ${need}` : ''}`}
        </span>
      ) : null}
    </div>
  )
}
