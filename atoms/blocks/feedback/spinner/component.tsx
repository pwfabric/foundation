import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { safeRenderValue } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const spinnerPropsSchema = z.object({
  size: z.enum(['sm', 'md', 'lg']).default('md'),
  label: z.string().default(''),
  variant: z.enum(['primary', 'muted']).default('primary'),
})

export type SpinnerProps = z.infer<typeof spinnerPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const spinnerDefinition: BlockDefinition = {
  type: 'spinner',
  name: 'Spinner',
        category: 'feedback',
  icon: '◠',
  schema: spinnerPropsSchema,
  defaultProps: {
    size: 'md',
    label: '',
    variant: 'primary',
  },
  defaultLayout: { span: { xs: 1, sm: 1, md: 1, lg: 1 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const SpinnerBlock: BlockComponent = ({ props, block }) => {
  const size = (props.size as string) ?? 'md'
  const variant = (props.variant as string) ?? 'primary'
  const label = (props.label as string) ?? ''

  const sizeMap: Record<string, number> = { sm: 16, md: 24, lg: 36 }
  const px = sizeMap[size] ?? 24
  const borderW = Math.max(2, Math.round(px / 8))
  const color =
    variant === 'muted'
      ? 'var(--pw-color-text-muted, #71717a)'
      : 'var(--pw-color-primary, #18181b)'

  // Scope the keyframe animation to this block instance so multiple spinners
  // never collide. block.id is sanitized to a valid CSS class token.
  const scope = `pw-spin-${String(block.id).replace(/[^a-zA-Z0-9_-]/g, '')}`
  // A loading spinner is essential feedback (WCAG 2.3.3 "essential" exception),
  // so it keeps a gentle, slower spin even under reduced-motion. The surface
  // base CSS blanket-kills animation under reduced-motion with
  // `[data-pw-surface] * { animation-iteration-count:1 !important }` (specificity
  // 0,1,0); the doubled-class selector below is 0,2,0 so it out-specifies and
  // wins regardless of source order, reclaiming a slow infinite spin.
  const css = `
@keyframes pw-spin { to { transform: rotate(360deg); } }
.${scope} { animation: pw-spin var(--pw-duration-slow, 300ms) linear infinite; }
@media (prefers-reduced-motion: reduce) { .${scope}.${scope} { animation: pw-spin 1.4s linear infinite !important; } }
`

  const ringStyle: React.CSSProperties = {
    display: 'inline-block',
    width: `${px}px`,
    height: `${px}px`,
    borderRadius: '50%',
    border: `${borderW}px solid color-mix(in srgb, ${color} 25%, transparent)`,
    borderTopColor: color,
    boxSizing: 'border-box',
  }

  return (
    <span
      id={block.id}
      data-block-id={block.id}
      data-block-type="spinner"
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        ...block.style,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <span className={scope} style={ringStyle} aria-hidden="true" />
      {label ? (
        <span
          style={{
            fontSize: 'var(--pw-font-size-sm, 14px)',
            color: 'var(--pw-color-text-muted, #71717a)',
          }}
        >
          {safeRenderValue(label)}
        </span>
      ) : null}
    </span>
  )
}

// This block's width is its content: in a flex row it must not take an equal
// share. Declared here, applied by the runtime (>= 4.3).
// `Object.assign` rather than a property assignment so the pack compiles against
// runtime type versions that predate `BlockComponent.sizing`.
Object.assign(SpinnerBlock, { sizing: 'intrinsic' })
