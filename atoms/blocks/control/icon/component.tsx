import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { ICON_PATHS, cssUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const iconSizeSchema = z.enum(['xs', 'sm', 'md', 'lg', 'xl'])

export const iconPropsSchema = z.object({
  name: z.string().default('circle'),
  // Named tokens (xs..xl) map to a fixed px scale; a raw CSS size (number → px,
  // or a string like "4rem"/"48px") is also accepted so authors aren't silently
  // downgraded to the 20px default when they reach for an explicit size.
  size: z.union([iconSizeSchema, z.string(), z.number()]).default('md'),
  color: z.string().optional(),
  strokeWidth: z.number().min(0.5).max(4).default(2),
})

export type IconProps = z.infer<typeof iconPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const iconDefinition: BlockDefinition = {
  type: 'icon',
  name: 'Icon',
  category: 'control',
  icon: '◈',
  schema: iconPropsSchema,
  defaultProps: {
    name: 'circle',
    size: 'md',
    strokeWidth: 2,
  },
  defaultLayout: { span: { xs: 1, sm: 1, md: 1, lg: 1 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const IconBlock: BlockComponent = ({ props, block }) => {
  const sizeMap: Record<string, number> = {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
  }

  const sizeProp = props.size
  // Named token (xs..xl) → fixed px scale. Anything else (a raw number or a
  // CSS-unit string like "4rem") passes through cssUnit so an explicit author
  // size is honoured instead of silently collapsing to the 20px default.
  const size =
    typeof sizeProp === 'string' && sizeProp in sizeMap
      ? sizeMap[sizeProp]!
      : (cssUnit(sizeProp as number | string | undefined) ?? 20)

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    color: props.color as string,
  }

  const iconName = (props.name as string) ?? 'circle'
  const strokeWidth = (props.strokeWidth as number) ?? 2
  const paths = ICON_PATHS[iconName] ?? ICON_PATHS.circle ?? ['<circle cx="12" cy="12" r="10"/>']

  return (
    <span
      id={block.id}
      data-block-id={block.id}
      style={{ ...style, ...block.style }}
      data-block-type="icon"
      data-icon-name={iconName}
      aria-label={iconName}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: paths.join('') }}
      />
    </span>
  )
}

// This block's width is its content: in a flex row it must not take an equal
// share. Declared here, applied by the runtime (>= 4.3).
// `Object.assign` rather than a property assignment so the pack compiles against
// runtime type versions that predate `BlockComponent.sizing`.
Object.assign(IconBlock, { sizing: 'intrinsic' })
