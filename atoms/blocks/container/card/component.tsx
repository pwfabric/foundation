import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { MOTION, cssUnit, transitionOf, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const cardPropsSchema = z.object({
  padding: z.coerce.number().default(16),
  gap: z.coerce.number().default(16),
  backgroundColor: z.string().optional(),
  borderRadius: z.union([z.number(), z.string()]).optional(),
  borderWidth: z.number().min(0).max(10).default(0),
  borderColor: z.string().optional(),
  // 'theme' = the theme's --pw-shadow-card decision (baseline: a whisper
  // shadow; a theme that wants tonal layering sets --pw-shadow-card: none —
  // the veto belongs to the theme, not the block). The older enum values stay as they were.
  shadow: z.enum(['none', 'theme', 'sm', 'md', 'lg', 'xl']).default('theme'),
  // Frosted-glass effect (backdrop-blur). Themeable: the translucent fill is
  // `color-mix` of the card token + transparent, so it FOLLOWS a theme recolour
  // (rebrandable) rather than a pinned rgba in block.style. Enum = blur presets.
  glass: z.enum(['none', 'sm', 'md', 'lg']).default('none'),
  // CSS aspect-ratio for the card box (e.g. '16/9', '4/3', '1/1', '21/9', '3/2',
  // or a number). Sets the ratio without forcing a fixed height — the card grows
  // to its ratio against its column width.
  aspectRatio: z.union([z.number(), z.string()]).optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
})

export type CardProps = z.infer<typeof cardPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const cardDefinition: BlockDefinition = {
  type: 'card',
  name: 'Card',
  category: 'container',
  icon: '▭',
  schema: cardPropsSchema,
  defaultProps: {
    padding: 16,
    gap: 16,
    // Depth ships as boundary (border) + the THEME's card-shadow decision —
    // tonal-layering themes set --pw-shadow-card: none (veto), shadcn baseline
    // gives the whisper shadow shadcn cards natively carry.
    borderWidth: 1,
    shadow: 'theme',
  },
  defaultLayout: { span: { xs: 4, sm: 4, md: 4, lg: 6 } },
  canHaveChildren: true,
}

// ============================================================
// COMPONENT
// ============================================================

export const CardBlock: BlockComponent = ({ props, children, block }) => {
  // Elevation ramp from the theme (--pw-shadow-*) with the prior literals as
  // fallbacks so cards re-skin elevation in one place.
  const shadowMap: Record<string, string> = {
    none: 'none',
    theme: 'var(--pw-shadow-card, 0 1px 2px 0 rgba(0,0,0,.05))',
    sm: 'var(--pw-shadow-sm)',
    md: 'var(--pw-shadow-md)',
    lg: 'var(--pw-shadow-lg)',
    xl: 'var(--pw-shadow-xl)',
  }
  const alignMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
  }
  const align = props.align as string | undefined
  const textAlign = props.textAlign as React.CSSProperties['textAlign'] | undefined
  const blurMap: Record<string, string> = { none: '', sm: 'blur(8px)', md: 'blur(16px)', lg: 'blur(24px)' }
  const glass = (props.glass as string) ?? 'none'
  const glassBlur = blurMap[glass] ?? ''
  const baseBg = (props.backgroundColor as string) ?? 'var(--pw-color-card)'
  const style: React.CSSProperties = {
    // Local text-color override for this card's subtree — falls through to the
    // page-level tokens unchanged when a theme doesn't define the on-card
    // variants (e.g. midnight-gold, where card and page bg are both dark).
    // Themes whose card surface diverges from the page background (e.g. a
    // white card on a black page) define --pw-color-text(-muted)-on-card so
    // descendant text/heading/link blocks stay legible without per-block awareness.
    ['--pw-color-text' as string]: 'var(--pw-color-text-on-card, var(--pw-color-text))',
    ['--pw-color-text-muted' as string]: 'var(--pw-color-text-muted-on-card, var(--pw-color-text-muted))',
    ['--pw-color-link' as string]: 'var(--pw-color-link-on-card, var(--pw-color-primary-ink))',
    // The var overrides above only help blocks that SET color themselves.
    // Blocks that never set color (comment-thread body text, plain spans)
    // inherit the COMPUTED color from the page body — the page-level light
    // text — and go invisible on a white card. Setting color here re-computes
    // it against this card's own overridden token, so every descendant
    // inherits legible on-card text by default.
    color: 'var(--pw-color-text)',
    display: 'flex',
    flexDirection: 'column',
    gap: cssUnit(props.gap as CSSUnit) ?? '16px',
    padding: cssUnit(props.padding as CSSUnit) ?? '16px',
    // Glass: a color-mix of the (themeable) card fill + transparent so the frost
    // tint tracks the theme; otherwise the solid fill. Blur via backdrop-filter.
    backgroundColor: glassBlur ? `color-mix(in srgb, ${baseBg} 60%, transparent)` : baseBg,
    ...(glassBlur ? { backdropFilter: glassBlur, WebkitBackdropFilter: glassBlur } : {}),
    // The theme's large corner: a fixed 8px ignored a 1.5rem theme.
    borderRadius: cssUnit(props.borderRadius as CSSUnit) ?? 'var(--pw-border-radius-lg, 8px)',
    borderWidth: cssUnit(props.borderWidth as CSSUnit) ?? '1px',
    borderStyle: 'solid',
    borderColor: (props.borderColor as string) ?? 'var(--pw-color-border)',
    boxShadow: shadowMap[(props.shadow as string) ?? 'md'] ?? shadowMap['md'],
    ...(props.aspectRatio != null ? { aspectRatio: String(props.aspectRatio) } : {}),
    alignItems: align ? alignMap[align] : undefined,
    textAlign,
    // Motion tokens: a hover lift or shadow change (from the host or a
    // linked card) follows the theme's pace and springs on its bounce easing.
    transition: `${transitionOf(['box-shadow', 'border-color', 'background-color'], MOTION.normal)}, transform ${MOTION.spring}`,
    ...block.style,
  }
  return (
    <div id={block.id} data-block-id={block.id} style={style} data-block-type="card">
      {children}
    </div>
  )
}
