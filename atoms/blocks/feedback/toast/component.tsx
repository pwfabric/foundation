import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { MOTION, safeRenderValue, ICON_PATHS } from '../../../lib/_shared-utils.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

export const toastVariantSchema = z.enum(['success', 'info', 'warning', 'error'])

export const toastPropsSchema = z.object({
  variant: toastVariantSchema.default('info'),
  title: z.string().default(''),
  message: z.string().default(''),
  dismissible: z.boolean().default(true),
  icon: z.string().default(''),
})

export type ToastProps = z.infer<typeof toastPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const toastDefinition: BlockDefinition = {
  type: 'toast',
  name: 'Toast',
        category: 'feedback',
  icon: '◧',
  schema: toastPropsSchema,
  defaultProps: {
    variant: 'info',
    title: '',
    message: '',
    dismissible: true,
    icon: '',
  },
  defaultLayout: { span: { xs: 4, sm: 6, md: 6, lg: 6 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

const VARIANT_TOKEN: Record<string, string> = {
  success: 'var(--pw-color-success, #16a34a)',
  info: 'var(--pw-color-info, #2563eb)',
  warning: 'var(--pw-color-warning, #d97706)',
  error: 'var(--pw-color-error, #dc2626)',
}

const DEFAULT_ICON: Record<string, string> = {
  success: 'check',
  info: 'bell',
  warning: 'bell',
  error: 'x',
}

/**
 * `ICON_PATHS` is keyed by `string`, so every lookup is `readonly string[] |
 * undefined` — falling back to another key of the same table proved nothing,
 * because that read is equally indefinite. The last resort is a named value:
 * the same geometry the generated `circle` entry carries, so an icon name that
 * is absent from the table still renders a glyph rather than throwing on
 * `.join`.
 */
const FALLBACK_ICON_PATHS: readonly string[] = ['<circle cx="12" cy="12" r="10"/>']

const TOAST_KEYFRAMES = '@keyframes pw-toast-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}'

export const ToastBlock: BlockComponent = ({ props, block, context }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const [visible, setVisible] = React.useState(true)

  const variant = (props.variant as string) ?? 'info'
  const title = (props.title as string) ?? ''
  const message = typeof props.message === 'string' ? props.message : ''
  const dismissible = props.dismissible !== false
  const iconName = ((props.icon as string) || DEFAULT_ICON[variant]) ?? 'bell'

  const token = VARIANT_TOKEN[variant] ?? VARIANT_TOKEN.info
  const iconPaths = ICON_PATHS[iconName] ?? ICON_PATHS.bell ?? FALLBACK_ICON_PATHS

  // Unset means hidden: a "Notification" placeholder reached visitors.
  if (!visible || (!title && !message)) return null

  const handleDismiss = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    // emit is a pure notification and always fires; the real visual removal is
    // gated so an inert (editor/preview) render keeps the banner in place.
    emit({
      type: SURFACE_EVENTS.BLOCK_CLICK,
      surfaceId,
      blockId: block.id,
      payload: { action: 'dismiss' },
    })
    if (context.interactionMode !== 'inert') setVisible(false)
  }

  return (
    <div
      id={block.id}
      data-block-id={block.id}
      data-block-type="toast"
      role={variant === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        position: 'relative',
        zIndex: 'var(--pw-z-toast)',
        overflow: 'hidden',
        padding: '12px 14px 12px 16px',
        borderRadius: 'var(--pw-border-radius, 8px)',
        border: `1px solid color-mix(in srgb, ${token} 30%, var(--pw-color-border, #e4e4e7))`,
        borderLeft: `4px solid ${token}`,
        backgroundColor: `color-mix(in srgb, ${token} 10%, var(--pw-color-card, #ffffff))`,
        color: 'var(--pw-color-text-on-card, var(--pw-color-text, #09090b))',
        // Entrance on the theme's motion tokens: slow + bounce — a lively
        // theme's toast springs in, a zero-duration theme's simply appears,
        // and the runtime's reduced-motion gate cuts it to nothing.
        animation: `pw-toast-in ${MOTION.enter} both`,
        ...block.style,
      }}
    >
      <style>{TOAST_KEYFRAMES}</style>
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke={token}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: '1px' }}
        dangerouslySetInnerHTML={{ __html: iconPaths.join('') }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          <div
            style={{
              fontWeight: 600,
              fontSize: 'var(--pw-font-size-sm, 14px)',
              color: 'var(--pw-color-text-on-card, var(--pw-color-text, #09090b))',
              marginBottom: '2px',
            }}
          >
            {safeRenderValue(title)}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 'var(--pw-font-size-sm, 14px)',
            color: 'color-mix(in srgb, var(--pw-color-text-on-card, var(--pw-color-text, #09090b)) 80%, transparent)',
            lineHeight: 1.4,
          }}
        >
          {safeRenderValue(message)}
        </div>
      </div>
      {dismissible ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={handleDismiss}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: '20px',
            height: '20px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'color-mix(in srgb, var(--pw-color-text-on-card, var(--pw-color-text, #09090b)) 80%, transparent)',
            cursor: 'pointer',
            borderRadius: 'var(--pw-border-radius-sm, 6px)',
            lineHeight: 0,
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: (ICON_PATHS.x ?? []).join('') }}
          />
        </button>
      ) : null}
    </div>
  )
}
