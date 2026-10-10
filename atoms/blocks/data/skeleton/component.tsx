import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'

// ============================================================
// SCHEMA
// ============================================================

export const skeletonPropsSchema = z.object({
  variant: z.enum(['text', 'circle', 'rectangle', 'card']).default('text'),
  lines: z.number().int().min(1).max(10).default(3),
  animated: z.boolean().default(true),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
  count: z.number().int().min(1).max(10).default(1),
})

export type SkeletonProps = z.infer<typeof skeletonPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const skeletonDefinition: BlockDefinition = {
  type: 'skeleton',
  name: 'Skeleton',
  category: 'data',
  icon: '▭',
  schema: skeletonPropsSchema,
  defaultProps: {
    variant: 'text',
    lines: 3,
    animated: true,
    count: 1,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const SkeletonBlock: BlockComponent = ({ props, block }) => {
  const variant = (props.variant as string) ?? 'rectangle'
  const animated = props.animated !== false
  const lines = Math.max(1, (props.lines as number) ?? 3)
  const width = (props.width as number) ?? 100
  const height = props.height as number | undefined
  const count = Math.max(1, (props.count as number) ?? 1)

  const shimmerStyle: React.CSSProperties = animated
    ? {
        background:
          'linear-gradient(90deg, var(--pw-color-secondary, #f4f4f5) 25%, var(--pw-color-border, #e4e4e7) 50%, var(--pw-color-secondary, #f4f4f5) 75%)',
        backgroundSize: '200% 100%',
        animation: 'pw-skeleton-shimmer 1.5s infinite',
      }
    : { backgroundColor: 'var(--pw-color-border, #e4e4e7)' }

  const baseStyle: React.CSSProperties = {
    borderRadius: variant === 'circle' ? '50%' : '4px',
    ...shimmerStyle,
    ...block.style,
  }

  const renderSingle = (key?: number): React.ReactElement => {
    const keyProp = key !== undefined ? { key } : {}
    if (variant === 'text') {
      return (
        <div {...keyProp} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              style={{
                ...baseStyle,
                height: '16px',
                width: i === lines - 1 ? '60%' : `${width}%`,
              }}
            />
          ))}
        </div>
      )
    }
    if (variant === 'circle') {
      const size = height ?? 48
      return (
        <div
          {...keyProp}
          style={{ ...baseStyle, width: `${size}px`, height: `${size}px`, flexShrink: 0 }}
        />
      )
    }
    if (variant === 'card') {
      return (
        <div
          {...keyProp}
          style={{
            ...baseStyle,
            width: `${width}%`,
            height: `${height ?? 120}px`,
            borderRadius: '8px',
          }}
        />
      )
    }
    // rectangle (default)
    return (
      <div {...keyProp} style={{ ...baseStyle, width: `${width}%`, height: `${height ?? 20}px` }} />
    )
  }

  const rootBorderRadius = variant === 'circle' ? '50%' : variant === 'card' ? '8px' : '4px'

  if (animated) {
    const styleTag = (
      <style key="pw-skeleton-style">{`@keyframes pw-skeleton-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    )
    return (
      <div
        id={block.id}
        data-block-id={block.id}
        data-block-type="skeleton"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          borderRadius: rootBorderRadius,
        }}
      >
        {styleTag}
        {count === 1
          ? renderSingle()
          : Array.from({ length: count }).map((_, i) => renderSingle(i))}
      </div>
    )
  }

  return (
    <div
      id={block.id}
      data-block-id={block.id}
      data-block-type="skeleton"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderRadius: rootBorderRadius,
      }}
    >
      {count === 1 ? renderSingle() : Array.from({ length: count }).map((_, i) => renderSingle(i))}
    </div>
  )
}
