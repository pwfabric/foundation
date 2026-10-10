import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const sectionPropsSchema = z.object({
  // Best-practice asymmetric padding. Numbers → px. When unset, padding falls back
  // to the theme's FLUID section tokens (var(--pw-space-section-*), clamp-based →
  // responsive without breakpoints). `padding` is a uniform back-compat alias that
  // applies to BOTH axes when paddingY/paddingX are not given.
  paddingY: z.union([z.number(), z.string()]).optional(),
  paddingX: z.union([z.number(), z.string()]).optional(),
  padding: z.union([z.number(), z.string()]).optional(),
  gap: z.coerce.number().default(16),
  backgroundColor: z.string().optional(),
  // Themeable gradient background. Color stops are theme color ROLES
  // (primary/accent/background/…) → resolved to var(--pw-color-*), so the gradient
  // FOLLOWS a theme recolour (rebrandable) instead of being a pinned block.style
  // hex. Raw values / tokens also pass through (escape hatch). Renders to
  // `background-image: linear-gradient(direction, from, [via,] to)`.
  backgroundGradient: z
    .object({
      from: z.string(),
      to: z.string(),
      via: z.string().optional(),
      direction: z.string().optional(),
      /** 'linear' (default), 'radial' (centered orb/glow), or 'conic' (angular sweep). */
      type: z.enum(['linear', 'radial', 'conic']).optional(),
      /** Radial/conic focal point, e.g. '50% 40%' (default '50% 50%' = center). */
      at: z.string().optional(),
      /** Conic start angle in degrees (default 0). Ignored for linear/radial. */
      angle: z.number().optional(),
    })
    .optional(),
  // Frosted-glass backdrop-blur for the section band (mirrors card's `glass`).
  // sm/md/lg → blur(4px|10px|20px); 'none' = no blur. Use over a gradient/image.
  backdropBlur: z.enum(['none', 'sm', 'md', 'lg']).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  maxWidth: z.union([z.number(), z.string()]).optional(),
  minHeight: z.union([z.number(), z.string()]).optional(),
  // CSS aspect-ratio for the section band (e.g. '16/9', '4/3', '1/1', '21/9',
  // '3/2', or a number). Sets the ratio without forcing a fixed height.
  aspectRatio: z.union([z.number(), z.string()]).optional(),
})

export type SectionProps = z.infer<typeof sectionPropsSchema>

// Theme colour roles → `var(--pw-color-*)`. A gradient built from roles follows a
// theme recolour; anything else (an existing token or raw value) passes through.
const COLOR_ROLES: ReadonlySet<string> = new Set([
  'primary', 'secondary', 'accent', 'background', 'card', 'surface',
  'text', 'textMuted', 'border', 'error', 'success', 'warning', 'info', 'textOnPrimary',
])
function gradientStop(v: string): string {
  const t = v.trim()
  if (!COLOR_ROLES.has(t)) return t
  const kebab = t.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
  // Assemble via concatenation (not a `var(--pw-color-…)` template literal) so the
  // static token linter, which scans this source, doesn't mis-read the dynamic
  // role as a bare undefined `--pw-color-` token.
  const prop = '--pw-color-' + kebab
  return 'var(' + prop + ')'
}
function themeGradient(g: NonNullable<SectionProps['backgroundGradient']>): string {
  const stops = [gradientStop(g.from), ...(g.via ? [gradientStop(g.via)] : []), gradientStop(g.to)]
  if (g.type === 'radial') {
    const at = (g.at ?? '').trim() || '50% 50%'
    return `radial-gradient(circle at ${at}, ${stops.join(', ')})`
  }
  if (g.type === 'conic') {
    const at = (g.at ?? '').trim() || '50% 50%'
    const from = g.angle ?? 0
    return `conic-gradient(from ${from}deg at ${at}, ${stops.join(', ')})`
  }
  const dir = (g.direction ?? '').trim() || '135deg'
  return `linear-gradient(${dir}, ${stops.join(', ')})`
}

// ============================================================
// DEFINITION
// ============================================================

export const sectionDefinition: BlockDefinition = {
  type: 'section',
  name: 'Section',
  category: 'layout',
  icon: '▬',
  schema: sectionPropsSchema,
  defaultProps: {
    // padding intentionally omitted → sections default to the theme's fluid
    // section tokens (responsive). Authors/composer set paddingY/paddingX/padding
    // to override. gap is the inner child rhythm.
    gap: 16,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: true,
}

// ============================================================
// COMPONENT
// ============================================================

export const SectionBlock: BlockComponent = ({ props, children, block }) => {
  // Outer wrapper is always full-bleed: its backgroundColor spans the full
  // window width. maxWidth is applied to the INNER wrapper only, so a colored
  // section keeps a full-width background while its content sits in a centered
  // max-width column. textAlign defaults to 'left' (it inline-inherits to all
  // descendants); heroes/CTAs opt into centering explicitly.
  // Vertical/horizontal padding: explicit paddingY/paddingX win, else the uniform
  // `padding` alias, else the theme's fluid section tokens. The CSS var carries an
  // inline clamp() fallback so the fluid padding renders even if the theme/runtime
  // hasn't set the var (older runtime, themeless render) — and it keeps the token
  // self-defining (no "undefined --pw-* without fallback" lint hit).
  const padY = cssUnit((props.paddingY ?? props.padding) as CSSUnit) ?? 'var(--pw-space-section-y)'
  const padX = cssUnit((props.paddingX ?? props.padding) as CSSUnit) ?? 'var(--pw-space-section-x)'
  // backdrop-blur presets (mirrors card's glass blur). 'none'/unset → no blur.
  const blurMap: Record<string, string> = { sm: 'blur(4px)', md: 'blur(10px)', lg: 'blur(20px)' }
  const backdropBlur = blurMap[(props.backdropBlur as string) ?? '']
  const style: React.CSSProperties = {
    width: '100%',
    // width:100% plus inline padding overflowed the page wherever no global
    // box-sizing reset applies: the padding stays inside the width.
    boxSizing: 'border-box',
    paddingBlock: padY,
    paddingInline: padX,
    backgroundColor: (props.backgroundColor as string) ?? 'transparent',
    ...(props.backgroundGradient
      ? { backgroundImage: themeGradient(props.backgroundGradient as NonNullable<SectionProps['backgroundGradient']>) }
      : {}),
    ...(backdropBlur ? { backdropFilter: backdropBlur, WebkitBackdropFilter: backdropBlur } : {}),
    textAlign: (props.textAlign as React.CSSProperties['textAlign']) ?? 'left',
    ...(props.minHeight ? { minHeight: cssUnit(props.minHeight as CSSUnit) } : {}),
    ...(props.aspectRatio != null ? { aspectRatio: String(props.aspectRatio) } : {}),
    ...block.style,
  }
  const innerStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    maxWidth: cssUnit(props.maxWidth as CSSUnit) ?? 'var(--pw-layout-container-max-width)',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: cssUnit(props.gap as CSSUnit) ?? '16px',
  }
  return (
    <section id={block.id} data-block-id={block.id} style={style} data-block-type="section">
      <div style={innerStyle}>{children}</div>
    </section>
  )
}
