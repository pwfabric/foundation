import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const dividerOrientationSchema = z.enum(['horizontal', 'vertical'])

export const dividerPropsSchema = z.object({
  orientation: dividerOrientationSchema.default('horizontal'),
  thickness: z.number().min(1).max(8).default(1),
  color: z.string().optional(),
  spacing: z.coerce.number().default(16),
  style: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
})

export type DividerProps = z.infer<typeof dividerPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const dividerDefinition: BlockDefinition = {
  type: 'divider',
  name: 'Divider',
  category: 'control',
  icon: '─',
  schema: dividerPropsSchema,
  defaultProps: {
    orientation: 'horizontal',
    thickness: 1,
    spacing: 16,
    style: 'solid',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const DividerBlock: BlockComponent = ({ props, block }) => {
  const isVertical = props.orientation === 'vertical'
  const thickness = (props.thickness as number) ?? 1
  const color = (props.color as string) ?? 'var(--pw-color-border)'
  const spacing = cssUnit(props.spacing as CSSUnit) ?? '16px'
  const dividerStyle = (props.style as string) ?? 'solid'

  const style: React.CSSProperties = {
    border: 'none',
    ...(isVertical
      ? {
          borderLeft: `${thickness}px ${dividerStyle} ${color}`,
          width: 0,
          height: '100%',
          minHeight: '20px',
          margin: `0 ${spacing}`,
        }
      : {
          borderTop: `${thickness}px ${dividerStyle} ${color}`,
          height: 0,
          width: '100%',
          margin: `${spacing} 0`,
        }),
  }

  return <hr id={block.id} data-block-id={block.id} style={{ ...style, ...block.style }} data-block-type="divider" />
}
