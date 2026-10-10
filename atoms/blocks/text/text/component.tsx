import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, safeRenderValue, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const textPropsSchema = z.object({
  content: z.string().default(''),
  // No default size: a fixed 14 overrode the theme's body size in
  // 12/12 apps, so an 18px-body theme still printed 14px paragraphs. Unset →
  // the theme's --pw-font-size-base.
  fontSize: z.number().min(8).max(96).optional(),
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
  color: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  lineHeight: z.number().optional(),
  maxLines: z.number().int().min(1).optional(),
  // A plain value, not an expression: when it is non-empty the text is not
  // drawn. A brand name beside the shell logo is `hideWhenSet: "{{LOGO}}"` —
  // a wordmark logo already carries the name, and printing it again beside a
  // 28px logo split the row in two. An unfilled
  // `{{SLOT}}` counts as empty, so a shell nobody gave a logo still shows its
  // name.
  hideWhenSet: z.string().optional(),
})

export type TextProps = z.infer<typeof textPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const textDefinition: BlockDefinition = {
  type: 'text',
  name: 'Text',
  category: 'text',
  icon: 'T',
  schema: textPropsSchema,
  defaultProps: {
    content: '',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 4, lg: 6 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

/** Set = a non-empty value that is not an unfilled `{{SLOT}}` template. */
function isSet(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const t = value.trim()
  return t !== '' && !/^\{\{[^{}]*\}\}$/.test(t)
}

export const TextBlock: BlockComponent = ({ props, block }) => {
  if (isSet(props.hideWhenSet)) return null
  const maxLines = props.maxLines as number | undefined
  const fontWeightMap: Record<string, number> = {
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  }
  const rawFW = props.fontWeight
  const normalizedFontWeight =
    typeof rawFW === 'string' && rawFW in fontWeightMap
      ? fontWeightMap[rawFW]
      : (rawFW as React.CSSProperties['fontWeight'])
  const style: React.CSSProperties = {
    margin: 0,
    fontSize: cssUnit(props.fontSize as CSSUnit) ?? 'var(--pw-font-size-base)',
    fontWeight: normalizedFontWeight ?? 'var(--pw-font-weight-body, 400)',
    letterSpacing: 'var(--pw-letter-spacing-body, 0em)',
    color: (props.color as string) ?? 'var(--pw-color-text)',
    textAlign: props.textAlign as React.CSSProperties['textAlign'],
    lineHeight: props.lineHeight as number,
    overflow: maxLines ? 'hidden' : undefined,
    display: maxLines ? '-webkit-box' : undefined,
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: maxLines ? 'vertical' : undefined,
    // A `\n` in the content is a line break, not a space: a summary written as
    // "Name: …\nGuests: …" rendered as one run-on paragraph.
    // pre-line keeps breaks and still collapses runs of spaces.
    whiteSpace: 'pre-line',
    // A long unbroken word or URL breaks rather than overflowing a narrow
    // viewport, the same rule as heading.
    overflowWrap: 'anywhere',
    minWidth: 0,
    // Layer 4: block-level style overrides
    ...block.style,
  }

  return (
    <p id={block.id} data-block-id={block.id} style={style} data-block-type="text">
      {/* Unset means empty — "Add your text here" reached visitors. */}
      {safeRenderValue(props.content)}
    </p>
  )
}
