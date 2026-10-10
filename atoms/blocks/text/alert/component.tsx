import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { safeRenderValue, tint } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const alertPropsSchema = z.object({
  title: z.string().optional(),
  message: z.string().default(''),
  variant: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  closeable: z.boolean().default(false),
  showIcon: z.boolean().default(true),
})

export type AlertProps = z.infer<typeof alertPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const alertDefinition: BlockDefinition = {
  type: 'alert',
  name: 'Alert',
  category: 'text',
  icon: '⚠',
  schema: alertPropsSchema,
  defaultProps: {
    message: '',
    variant: 'info',
    closeable: false,
    showIcon: true,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const AlertBlock: BlockComponent = ({ props, block }) => {
  const [dismissed, setDismissed] = React.useState(false)
  if (dismissed) return null
  // Unset means hidden: "This is an alert." reached visitors.
  const message = safeRenderValue(props.message)
  if (!message && !props.title) return null

  // Each variant derives its fill/border from the matching semantic theme
  // token (via color-mix) so alerts re-skin when the theme changes; the hex
  // literals are fallbacks for runtimes without the token defined.
  const colorMap: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    info: {
      bg: tint('var(--pw-color-info)', 10),
      border: tint('var(--pw-color-info)', 30),
      text: 'color-mix(in srgb, var(--pw-color-info) 55%, var(--pw-color-text-on-card, var(--pw-color-text)))',
      icon: 'ℹ',
    },
    success: {
      bg: tint('var(--pw-color-success)', 10),
      border: tint('var(--pw-color-success)', 30),
      text: 'color-mix(in srgb, var(--pw-color-success) 55%, var(--pw-color-text-on-card, var(--pw-color-text)))',
      icon: '✓',
    },
    warning: {
      bg: tint('var(--pw-color-warning)', 12),
      border: tint('var(--pw-color-warning)', 32),
      text: 'color-mix(in srgb, var(--pw-color-warning) 55%, var(--pw-color-text-on-card, var(--pw-color-text)))',
      icon: '⚠',
    },
    error: {
      bg: tint('var(--pw-color-error)', 10),
      border: tint('var(--pw-color-error)', 30),
      text: 'color-mix(in srgb, var(--pw-color-error) 55%, var(--pw-color-text-on-card, var(--pw-color-text)))',
      icon: '✕',
    },
  }
  const variant = (props.variant as string) ?? 'info'
  const c = colorMap[variant] ?? colorMap['info']!
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '6px',
    backgroundColor: c.bg,
    border: `1px solid ${c.border}`,
    color: c.text,
    ...block.style,
  }
  return (
    <div id={block.id} data-block-id={block.id} role="alert" style={style} data-block-type="alert">
      {!!props.showIcon && <span style={{ fontSize: '16px', flexShrink: 0 }}>{c.icon}</span>}
      <div style={{ flex: 1 }}>
        {!!props.title && (
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{safeRenderValue(props.title)}</div>
        )}
        {message ? <div>{message}</div> : null}
      </div>
      {!!props.closeable && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: c.text,
            fontSize: '16px',
            lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}
