import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, alignToCSS, justifyToCSS, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const containerPropsSchema = z.object({
  // Read by the component since the beginning but never parsed — the classic
  // cast-instead-of-parse gap, now closed.
  wrap: z.boolean().optional(),
  /**
   * Stacking law (runtime >= 4.4): on the `xs` viewport a `direction: 'row'`
   * container with two or more non-intrinsic children is drawn as a column,
   * because a 390px screen cannot hold two content columns side by side.
   * `keepRow: true` opts a row OUT of that law — ratio compositions (Mondrian
   * mosaics, poster grids) whose meaning IS the side-by-side proportion.
   * Declared here so the integrity gate keeps the prop; applied by the runtime.
   */
  keepRow: z.boolean().optional(),
  direction: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).default('column'),
  gap: z.coerce.number().default(16),
  // No schema default on purpose: a PAINTED container (ground or border)
  // defaults to 16, a pure layout container to 0 — see the style block.
  padding: z.coerce.number().optional(),
  align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
  justify: z.enum(['start', 'center', 'end', 'between', 'around', 'evenly']).optional(),
  backgroundColor: z.string().optional(),
  borderRadius: z.union([z.number(), z.string()]).optional(),
  minHeight: z.union([z.number(), z.string()]).optional(),
  maxWidth: z.union([z.number(), z.string()]).optional(),
  // CSS aspect-ratio for the box (e.g. '16/9', '4/3', '1/1', '21/9', '3/2', or a
  // number). Sets the ratio without forcing a fixed height.
  aspectRatio: z.union([z.number(), z.string()]).optional(),
  // Declared by the manifest since the start, and read only to decide the
  // padding — never painted. Now they paint.
  backgroundGradient: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.coerce.number().optional(),
})

export type ContainerProps = z.infer<typeof containerPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const containerDefinition: BlockDefinition = {
  type: 'container',
  name: 'Container',
  category: 'layout',
  icon: '▢',
  schema: containerPropsSchema,
  defaultProps: {
    direction: 'column',
    gap: 16,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: true,
}

// ============================================================
// COMPONENT
// ============================================================

export const ContainerBlock: BlockComponent = ({ props, children, block }) => {
  const direction = (props.direction as React.CSSProperties['flexDirection']) ?? 'column'
  const isRowLike = direction === 'row' || direction === 'row-reverse'
  const maxWidth = cssUnit(props.maxWidth as CSSUnit)
  // A `maxWidth` prop with no explicit margin reads as "this is the page's
  // centered content column" (the single most common use of maxWidth on a
  // container) — without an auto margin it hugs the section's left edge
  // instead, leaving a dead gap on the right. block.style below can still
  // override with an explicit margin/marginLeft/marginRight.
  const autoCenter = maxWidth !== undefined ? { margin: '0 auto' } : {}
  const bgColor = props.backgroundColor as string | undefined
  // A container only paints a card/surface-toned background when a receipt
  // explicitly sets one (most containers are transparent layout scaffolding
  // sitting directly on the page canvas, where text must stay in the
  // page-level tokens) — so the on-card override (see panel/card/component.tsx)
  // only applies when the receipt actually opted into a card-toned background.
  const paintsGround =
    bgColor != null ||
    props.borderWidth != null ||
    props.borderColor != null ||
    props.backgroundGradient != null
  const paintsCardSurface = typeof bgColor === 'string' && bgColor.includes('--pw-color-card')
  const style: React.CSSProperties = {
    ...(paintsCardSurface
      ? {
          ['--pw-color-text' as string]: 'var(--pw-color-text-on-card, var(--pw-color-text))',
          ['--pw-color-text-muted' as string]: 'var(--pw-color-text-muted-on-card, var(--pw-color-text-muted))',
        }
      : {}),
    display: 'flex',
    flexDirection: direction,
    flexWrap: isRowLike ? ((props.wrap as boolean) === true ? 'wrap' : 'nowrap') : undefined,
    gap: cssUnit(props.gap as CSSUnit) ?? 'var(--pw-spacing-base)',
    // A fixed padding-16 default eats 32px at EVERY level of a pure-layout
    // chain (306 -> 274 -> 220 -> 188px) and forces `padding: 0` overrides
    // into every receipt. A container that paints a
    // ground or a border is a box and keeps 16; one that only arranges is
    // geometry and gets 0. An explicit `padding` always wins.
    padding:
      props.padding != null
        ? cssUnit(props.padding as CSSUnit)
        : paintsGround
          ? 'var(--pw-spacing-base)'
          : 0,
    alignItems: alignToCSS(props.align as string),
    justifyContent: justifyToCSS(props.justify as string),
    backgroundColor: bgColor,
    ...(typeof props.backgroundGradient === 'string' && props.backgroundGradient.trim()
      ? { backgroundImage: props.backgroundGradient }
      : {}),
    ...(props.borderWidth != null || props.borderColor != null
      ? {
          borderWidth: cssUnit((props.borderWidth ?? 1) as CSSUnit),
          borderStyle: 'solid',
          borderColor: (props.borderColor as string | undefined) ?? 'var(--pw-color-border)',
        }
      : {}),
    // Padding and border stay inside the width.
    boxSizing: 'border-box',
    borderRadius: cssUnit(props.borderRadius as CSSUnit) ?? 'var(--pw-border-radius)',
    minHeight: cssUnit(props.minHeight as CSSUnit),
    maxWidth,
    ...autoCenter,
    ...(props.aspectRatio != null ? { aspectRatio: String(props.aspectRatio) } : {}),
    // Allow the container to shrink below its content's natural width when it is
    // itself a flex child — without this (default min-width:auto) a wide inner child
    // (e.g. a fixed-column data-grid) forces the container past the viewport instead
    // of letting the child's own overflow-x:auto scroll.
    minWidth: 0,
    // Layer 4: block-level style overrides
    ...block.style,
  }

  return (
    <div id={block.id} data-block-id={block.id} style={style} data-block-type="container">
      {children}
    </div>
  )
}
