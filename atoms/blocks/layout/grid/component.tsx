import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, alignToCSS, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const gridPropsSchema = z.object({
  columns: z.number().int().min(1).max(12).default(2),
  /**
   * Columns on a phone (640px and below). Unset → one column, as before. Two
   * small tiles (stats, shortcuts) side by side is the common phone layout,
   * and without this a grid had no way to ask for it.
   */
  columnsXs: z.number().int().min(1).max(6).optional(),
  gap: z.coerce.number().default(16),
  rowGap: z.coerce.number().optional(),
  columnGap: z.coerce.number().optional(),
  minChildWidth: z.union([z.number(), z.string()]).optional(),
  rows: z.number().int().min(1).max(24).optional(),
  alignItems: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
})

export type GridProps = z.infer<typeof gridPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const gridDefinition: BlockDefinition = {
  type: 'grid',
  name: 'Grid',
  category: 'layout',
  icon: '⊞',
  schema: gridPropsSchema,
  defaultProps: {
    columns: 2,
    gap: 16,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: true,
  allowedChildren: ['container', 'text', 'heading', 'button', 'image'],
}

// ============================================================
// COMPONENT
// ============================================================

export const GridBlock: BlockComponent = ({ props, children, block }) => {
  const columns = (props.columns as number) ?? 2
  // minChildWidth may be a number (coerced to px) or a string with an explicit
  // unit. Run it through cssUnit so a bare number like 240 becomes "240px";
  // a unitless value would otherwise produce invalid CSS (min(240, 100%)),
  // causing the browser to drop grid-template-columns and collapse to 1 column.
  const explicitMin = cssUnit(props.minChildWidth as CSSUnit)
  // TWO MODES (otherwise `columns:12` produces no 12
  // tracks and child spans overflow the page):
  //  - minChildWidth given → RESPONSIVE: auto-fit minmax (historical behaviour;
  //    auto-fit not auto-fill so empty trailing tracks collapse).
  //  - minChildWidth absent → HONEST: exactly `columns` tracks, minmax(0,1fr)
  //    so nowrap content cannot widen a track past its share. This is what
  //    makes child layout.span deterministic.
  const gridTemplateColumns = explicitMin
    ? `repeat(auto-fit, minmax(min(${explicitMin}, 100%), 1fr))`
    : `repeat(${columns}, minmax(0, 1fr))`
  const rows = props.rows as number | undefined
  // HONEST-mode mobile safety (a sweep found 46 existing grids that declare
  // `columns` without `minChildWidth` and without any child span — under honest
  // tracks they would stay N columns wide on a phone, which auto-fit used to
  // collapse). A child that declares layout.span is the author taking
  // responsibility for every breakpoint, so span-less honest grids — and only
  // those — get a scoped media rule collapsing them to one column on xs.
  const anyChildDeclaresSpan = (block.children ?? []).some(
    (c) => (c as { layout?: { span?: unknown } }).layout?.span !== undefined
  )
  const collapseOnMobile = !explicitMin && !anyChildDeclaresSpan && columns > 1
  // `columnsXs` is the author naming the phone count, so it applies in either
  // mode (an auto-fit grid would otherwise fall to one column by its minimum).
  const rawXs = Number(props.columnsXs)
  const columnsXs = Number.isInteger(rawXs) && rawXs >= 1 ? Math.min(rawXs, 6) : undefined
  const phoneRule = collapseOnMobile || (columnsXs !== undefined && !anyChildDeclaresSpan)
  const phoneTracks = columnsXs && columnsXs > 1 ? `repeat(${columnsXs},minmax(0,1fr))` : '1fr'
  // A tablet step: three or four honest tracks on a 700–1024px
  // screen squeezed every card into a sliver. Between 641 and 1024px a grid of
  // three or more columns drops to two (or to the phone count when that is
  // larger); at 640px and below, to `columnsXs` or one.
  const tabletTracks = Math.max(2, columnsXs ?? 1)
  const tabletStep = collapseOnMobile && columns > tabletTracks
  const sel = `[data-block-id="${block.id}"][data-block-type="grid"]`
  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns,
    ...(rows ? { gridTemplateRows: `repeat(${rows}, minmax(0, auto))` } : {}),
    gap: cssUnit(props.gap as CSSUnit) ?? 'var(--pw-layout-grid-gap)',
    // rowGap/columnGap were IN THE SCHEMA BUT NOT RENDERED: the manifest declares
    // both, the component read only `gap` — so every app asking for separate
    // row/column gaps quietly got equal gaps. When given, they override `gap`.
    ...(props.rowGap != null ? { rowGap: cssUnit(props.rowGap as CSSUnit) } : {}),
    ...(props.columnGap != null ? { columnGap: cssUnit(props.columnGap as CSSUnit) } : {}),
    alignItems: alignToCSS(props.alignItems as string),
    minWidth: 0,
    width: '100%',
    // Padding and border stay inside the 100% width — without it a padded grid
    // is wider than its column.
    boxSizing: 'border-box',
    ...block.style,
  }

  return (
    <div id={block.id} data-block-id={block.id} style={style} data-block-type="grid">
      {phoneRule ? (
        <style>
          {(tabletStep ? `@media (min-width: 641px) and (max-width: 1024px){${sel}{grid-template-columns:repeat(${tabletTracks},minmax(0,1fr)) !important}}` : '') +
            `@media (max-width: 640px){${sel}{grid-template-columns:${phoneTracks} !important}}`}
        </style>
      ) : null}
      {children}
    </div>
  )
}
