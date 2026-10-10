import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import { SURFACE_EVENTS } from '@pwfabric/runtime'
import type { BlockComponent } from '../../../lib/component-types.js'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'
import { safeHref, tint } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const chipPropsSchema = z.object({
  label: z.string().default(''),
  /** Carried in the event payload so a strip can tell its chips apart. */
  value: z.string().optional(),
  href: z.string().optional(),
  tone: z.enum(['neutral', 'primary', 'accent', 'success', 'warning', 'error']).default('neutral'),
  size: z.enum(['sm', 'md']).default('md'),
  selected: z.boolean().default(false),
  removable: z.boolean().default(false),
  count: z.number().optional(),
})

export type ChipProps = z.infer<typeof chipPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const chipDefinition: BlockDefinition = {
  type: 'chip',
  name: 'Chip',
  category: 'control',
  icon: '◗',
  schema: chipPropsSchema,
  defaultProps: { label: '', tone: 'neutral', size: 'md', selected: false, removable: false },
  defaultLayout: { span: { xs: 2, sm: 2, md: 2, lg: 2 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * A small labelled token the reader can act on.
 *
 * NOT `control.badge`, which states a STATUS and is not actionable, and not
 * `form.tag-input`, which is an input that produces tokens. This is the third
 * thing both of those were being stretched to cover: a token that carries a
 * value and can be chosen, followed or dismissed — a facet value, a filter in
 * force, a tag on a card, a session track.
 *
 * Tones mirror `control.badge` exactly, including its reasoning: the
 * fill is a `color-mix` wash of the SAME token that drives the label, so a chip
 * re-skins with the theme and stays legible inside a card, where
 * `--pw-color-text` is overridden but `--pw-color-border` is not.
 */
export const ChipBlock: BlockComponent = ({ props, context, block }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const interactive = context.interactionMode !== 'inert'

  // Unset means NOTHING shown — a "Chip" placeholder reached visitors.
  const label = typeof props.label === 'string' || typeof props.label === 'number' ? String(props.label) : ''
  const value = props.value == null ? label : String(props.value)
  const href = safeHref(props.href as string | undefined)
  const selected = Boolean(props.selected)
  const removable = Boolean(props.removable)
  const count = props.count == null ? null : Number(props.count)
  if (!label) return null

  const tones: Record<string, React.CSSProperties> = {
    neutral: {
      backgroundColor: 'color-mix(in srgb, var(--pw-color-text) 14%, transparent)',
      color: 'var(--pw-color-text)',
    },
    primary: {
      backgroundColor: tint('var(--pw-color-primary)'),
      color: 'color-mix(in srgb, var(--pw-color-primary) 45%, var(--pw-color-text-on-card, var(--pw-color-text)))',
    },
    accent: {
      backgroundColor: tint('var(--pw-color-accent)'),
      color: 'color-mix(in srgb, var(--pw-color-accent) 45%, var(--pw-color-text-on-card, var(--pw-color-text)))',
    },
    success: {
      backgroundColor: tint('var(--pw-color-success)'),
      color: 'color-mix(in srgb, var(--pw-color-success) 45%, var(--pw-color-text-on-card, var(--pw-color-text)))',
    },
    warning: {
      backgroundColor: tint('var(--pw-color-warning)'),
      color: 'color-mix(in srgb, var(--pw-color-warning) 45%, var(--pw-color-text-on-card, var(--pw-color-text)))',
    },
    error: {
      backgroundColor: tint('var(--pw-color-error)'),
      color: 'color-mix(in srgb, var(--pw-color-error) 45%, var(--pw-color-text-on-card, var(--pw-color-text)))',
    },
  }

  const sm = props.size === 'sm'
  const base: React.CSSProperties = {
    ...(tones[(props.tone as string) ?? 'neutral'] ?? tones.neutral),
    display: 'inline-flex',
    alignItems: 'center',
    gap: sm ? '4px' : '6px',
    padding: sm ? '2px 8px' : '4px 12px',
    borderRadius: '999px',
    fontSize: sm ? '12px' : '14px',
    fontWeight: selected ? 600 : 500,
    lineHeight: 1.4,
    maxWidth: '100%',
    minWidth: 0,
    textDecoration: 'none',
    // Selection is carried by a ring rather than a different fill: a filter
    // strip shows selected and unselected chips side by side, and changing the
    // fill would read as a different KIND of chip rather than the same chip in
    // a different state.
    boxShadow: selected ? 'inset 0 0 0 2px currentColor' : 'none',
  }

  const dismiss = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!interactive) return
    emit({ type: SURFACE_EVENTS.BLOCK_CLICK, surfaceId, blockId: block.id, payload: { removed: true, value } })
    context.onEvent?.({ type: 'click', blockId: block.id, payload: { removed: true, value } })
  }

  const choose = (): void => {
    if (!interactive || href) return
    emit({ type: SURFACE_EVENTS.BLOCK_CLICK, surfaceId, blockId: block.id, payload: { selected: !selected, value } })
    context.onEvent?.({ type: 'click', blockId: block.id, payload: { selected: !selected, value } })
  }

  const body = (
    <>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
      {count != null && Number.isFinite(count) ? (
        <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      ) : null}
      {removable ? (
        <span
          role="button"
          tabIndex={interactive ? 0 : -1}
          aria-label={`Remove ${label}`}
          onClick={dismiss}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') dismiss(e as unknown as React.MouseEvent)
          }}
          style={{ cursor: interactive ? 'pointer' : 'default', opacity: 0.75, fontSize: sm ? '14px' : '16px', lineHeight: 1 }}
        >
          ×
        </span>
      ) : null}
    </>
  )

  // An address makes it a link; no address and it is a button, so a chip is
  // never a div that merely looks clickable.
  if (href) {
    return (
      <a id={block.id} data-block-id={block.id} data-block-type="chip" href={href} style={base}>
        {body}
      </a>
    )
  }

  return (
    <button
      id={block.id}
      data-block-id={block.id}
      data-block-type="chip"
      type="button"
      aria-pressed={selected}
      onClick={choose}
      style={{ ...base, border: 'none', cursor: interactive ? 'pointer' : 'default', font: 'inherit' }}
    >
      {body}
    </button>
  )
}

export default ChipBlock
