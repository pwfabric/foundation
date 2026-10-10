import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, safeRenderValue, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const listStyleSchema = z.enum(['none', 'disc', 'decimal', 'check', 'arrow'])

export const listPropsSchema = z.object({
  items: z.array(z.string()).default([]),
  style: listStyleSchema.default('disc'),
  spacing: z.coerce.number().default(8),
  fontSize: z.number().min(8).max(96).default(14),
  color: z.string().optional(),
  iconColor: z.string().optional(),
})

export type ListProps = z.infer<typeof listPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const listDefinition: BlockDefinition = {
  type: 'list',
  name: 'List',
  category: 'data',
  icon: '☰',
  schema: listPropsSchema,
  defaultProps: {
    items: [],
    style: 'disc',
    spacing: 8,
    fontSize: 14,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const ListBlock: BlockComponent = ({ props, block }) => {
  const getMarker = (style: string): string => {
    switch (style) {
      case 'check':
        return '\u2713'
      case 'arrow':
        return '\u2192'
      default:
        return ''
    }
  }

  // Not an array → no items. "Item 1..3" samples reached visitors.
  const items = Array.isArray(props.items) ? (props.items as string[]) : []
  const listStyle = (props.style as string) ?? 'disc'
  const isCustomMarker = listStyle === 'check' || listStyle === 'arrow' || listStyle === 'none'

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: cssUnit(props.spacing as CSSUnit) ?? '8px',
    fontSize: cssUnit(props.fontSize as CSSUnit) ?? 'var(--pw-font-size-sm)',
    color: props.color as string,
    listStyleType: isCustomMarker ? 'none' : listStyle,
    paddingLeft: isCustomMarker ? 0 : '1.5em',
    margin: 0,
  }

  const itemStyle: React.CSSProperties = {
    display: isCustomMarker ? 'flex' : 'list-item',
    alignItems: isCustomMarker ? 'flex-start' : undefined,
    gap: isCustomMarker ? '0.5em' : undefined,
  }

  const markerStyle: React.CSSProperties = {
    color: (props.iconColor as string) ?? (props.color as string),
    flexShrink: 0,
  }

  const Tag = listStyle === 'decimal' ? 'ol' : 'ul'

  return (
    <Tag id={block.id} data-block-id={block.id} style={{ ...containerStyle, ...block.style }} data-block-type="list">
      {items.map((item: string, index: number) => (
        <li key={index} style={itemStyle}>
          {isCustomMarker && listStyle !== 'none' && (
            <span style={markerStyle}>{getMarker(listStyle)}</span>
          )}
          <span>{safeRenderValue(item)}</span>
        </li>
      ))}
    </Tag>
  )
}
