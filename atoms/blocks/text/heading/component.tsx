import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { safeRenderValue, gradientCSS } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const headingLevelSchema = z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

export const gradientDirectionSchema = z.enum([
  'to-r',
  'to-l',
  'to-t',
  'to-b',
  'to-tr',
  'to-tl',
  'to-br',
  'to-bl',
])

export const gradientSchema = z.object({
  enabled: z.boolean().default(false),
  // Gradient text defaults to the theme primary→accent ramp so an enabled
  // gradient heading re-skins with the surface. Explicit from/to override.
  from: z.string().default('var(--pw-color-primary)'),
  via: z.string().optional(),
  to: z.string().default('var(--pw-color-accent)'),
  direction: gradientDirectionSchema.default('to-r'),
})

export const headingPropsSchema = z.object({
  text: z.string().default(''),
  level: headingLevelSchema.default('h2'),
  color: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  gradient: gradientSchema.optional(),
  // Signature motif — a vertical gold accent bar to the left of the heading,
  // matching the reference design's card/section-header convention. Opt-in
  // (default false) so existing heading usages render unchanged.
  accentBar: z.boolean().default(false),
  uppercase: z.boolean().default(false),
  /**
   * Opt-in inline emphasis. When true, `text` may carry a tiny markdown
   * subset rendered as real spans: **bold**, *italic*, ~~strike~~, ==mark==.
   * Without it a single emphasised word inside a
   * heading was impossible — authors split headings or gave up fidelity.
   * No HTML is accepted; the parser only recognises the four markers above.
   */
  rich: z.boolean().default(false),
})

export type HeadingProps = z.infer<typeof headingPropsSchema>
export type GradientConfig = z.infer<typeof gradientSchema>

// ============================================================
// DEFINITION
// ============================================================

export const headingDefinition: BlockDefinition = {
  type: 'heading',
  name: 'Heading',
  category: 'text',
  icon: 'H',
  schema: headingPropsSchema,
  defaultProps: {
    text: '',
    level: 'h2',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

/** **bold** · *italic* · ~~strike~~ · ==mark== → gercek span'lar (HTML kabul etmez). */
function renderRichText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|==[^=]+==)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4)
      return (
        <span key={i} style={{ textDecoration: 'line-through', textDecorationColor: 'var(--pw-color-error, #dc2626)', textDecorationThickness: '0.08em' }}>
          {part.slice(2, -2)}
        </span>
      )
    if (part.startsWith('==') && part.endsWith('==') && part.length > 4)
      return (
        <mark key={i} style={{ backgroundColor: 'var(--pw-color-accent)', color: 'var(--pw-color-on-accent, var(--pw-color-text))', padding: '0 0.08em' }}>
          {part.slice(2, -2)}
        </mark>
      )
    return part
  })
}

export const HeadingBlock: BlockComponent = ({ props, block }) => {
  // Unset means hidden: a "Heading" placeholder reached visitors,
  // and an empty <h2> is an empty landmark for a screen reader.
  if (safeRenderValue(props.text) === '') return null
  const rawLevel = props.level
  const level = typeof rawLevel === 'number' ? `h${rawLevel}` : ((rawLevel as string) ?? 'h2')
  const Tag = level as keyof React.JSX.IntrinsicElements

  // Inline sizes override Tailwind Preflight's `font-size: inherit; font-weight: inherit`
  // so h1–h6 always render with visible hierarchy regardless of global CSS reset.
  // fontWeight, lineHeight, and letterSpacing reference CSS vars from surface theme.
  const PW_FONT_WEIGHT = 'var(--pw-font-weight-heading)' as React.CSSProperties['fontWeight']
  const PW_LINE_HEIGHT = 'var(--pw-line-height-heading)'
  const PW_LETTER_SPACING = 'var(--pw-letter-spacing-heading)'
  const headingSizeMap: Record<string, React.CSSProperties> = {
    // The type scale is tokenised — the fallbacks equal the OLD hardcoded
    // values (a visually neutral change); a theme can drive the h1-h5 scale
    // with --pw-font-size-h*.
    h1: {
      fontSize: 'var(--pw-font-size-h1, var(--pw-font-size-4xl, 36px))',
      fontWeight: PW_FONT_WEIGHT,
      lineHeight: PW_LINE_HEIGHT,
      letterSpacing: PW_LETTER_SPACING,
    },
    h2: {
      fontSize: 'var(--pw-font-size-h2, var(--pw-font-size-3xl, 30px))',
      fontWeight: PW_FONT_WEIGHT,
      lineHeight: PW_LINE_HEIGHT,
      letterSpacing: PW_LETTER_SPACING,
    },
    h3: {
      fontSize: 'var(--pw-font-size-h3, var(--pw-font-size-2xl, 24px))',
      fontWeight: PW_FONT_WEIGHT,
      lineHeight: PW_LINE_HEIGHT,
      letterSpacing: PW_LETTER_SPACING,
    },
    h4: {
      fontSize: 'var(--pw-font-size-h4, var(--pw-font-size-xl, 20px))',
      fontWeight: PW_FONT_WEIGHT,
      lineHeight: PW_LINE_HEIGHT,
      letterSpacing: PW_LETTER_SPACING,
    },
    h5: {
      fontSize: 'var(--pw-font-size-h5, var(--pw-font-size-lg, 18px))',
      fontWeight: PW_FONT_WEIGHT,
      lineHeight: PW_LINE_HEIGHT,
      letterSpacing: PW_LETTER_SPACING,
    },
    h6: {
      fontSize: 'var(--pw-font-size-sm)',
      fontWeight: PW_FONT_WEIGHT,
      lineHeight: PW_LINE_HEIGHT,
      letterSpacing: PW_LETTER_SPACING,
    },
  }

  const uppercase = props.uppercase === true
  const baseStyle: React.CSSProperties = {
    // Headings consume the theme heading font — previously only
    // weight/lineHeight/letterSpacing referenced theme vars, so --pw-font-family-heading
    // was dead and headings fell back to the UA serif.
    fontFamily: 'var(--pw-font-family-heading)',
    color: (props.color as string) ?? 'var(--pw-color-text)',
    textAlign: props.textAlign as React.CSSProperties['textAlign'],
    margin: 0,
    // A long single word must not push past the viewport: at the theme's 4xl
    // step "Mahallenizin" did not fit 358px and the content box grew to 416px
    // at 390px. Break inside the word only when it cannot
    // fit on its own line; min-width 0 lets a heading in a flex row (the
    // accent bar) shrink so the break can happen. Font sizes are unchanged.
    overflowWrap: 'anywhere',
    minWidth: 0,
    ...(uppercase ? { textTransform: 'uppercase', letterSpacing: '0.04em' } : {}),
  }

  const gradientStyle = gradientCSS(props.gradient as GradientConfig | undefined)
  // Merge order: headingSizeMap → baseStyle → gradientStyle → block.style (block overrides win)
  const style: React.CSSProperties = {
    ...(headingSizeMap[level] ?? {}),
    ...baseStyle,
    ...(gradientStyle ?? {}),
    // Layer 4: block-level style overrides
    ...block.style,
  }

  const headingEl = (
    <Tag id={block.id} data-block-id={block.id} style={style} data-block-type="heading">
      {props.rich ? renderRichText(String(props.text ?? '')) : safeRenderValue(props.text)}
    </Tag>
  )

  if (props.accentBar !== true) return headingEl

  // Signature motif: gold vertical bar, pinned to the reference's secondary-
  // container token (not --pw-color-primary) so the motif's color stays fixed
  // even if the primary brand color is rebranded later.
  return (
    <div
      data-block-id={block.id}
      data-block-type="heading"
      style={{ display: 'flex', alignItems: 'stretch', gap: '12px' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '3px',
          minHeight: '1em',
          alignSelf: 'stretch',
          borderRadius: 'var(--pw-border-radius-full, 9999px)',
          backgroundColor: 'var(--pw-color-secondary, #f4f4f5)',
          flexShrink: 0,
        }}
      />
      {React.cloneElement(headingEl, { id: undefined })}
    </div>
  )
}
