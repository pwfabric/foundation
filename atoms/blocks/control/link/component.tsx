import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, ICON_PATHS, safeHref, safeRenderValue, type CSSUnit } from '../../../lib/_shared-utils.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

export const linkTargetSchema = z.enum(['_self', '_blank', '_parent', '_top'])

export const linkPropsSchema = z.object({
  // Both cast-read since v1 (icon glyph + target/rel pair) — promoted into
  // the schema.
  icon: z.string().optional(),
  // In the manifest since the a11y sweep; the component read it by cast. Kept
  // in the schema so a parsing host does not strip it.
  ariaLabel: z.string().optional(),
  external: z.boolean().optional(),
  // NO DEFAULT. It used to be `.default('#')`, so the block MANUFACTURED the
  // dead anchor the gate hunts for: every link without a target quietly got
  // `#`, the reader clicked, nothing happened.
  // A link without a target is a LABEL; it renders as a <span> below.
  href: z.string().optional(),
  text: z.string().default(''),
  target: linkTargetSchema.default('_self'),
  color: z.string().optional(),
  underline: z.enum(['always', 'hover', 'none']).default('hover'),
  fontSize: z.number().min(8).max(96).optional(),
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
})

export type LinkProps = z.infer<typeof linkPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const linkDefinition: BlockDefinition = {
  type: 'link',
  name: 'Link',
  category: 'control',
  icon: '🔗',
  schema: linkPropsSchema,
  defaultProps: {
    // NO href: a link without a target starts as a label, not a dead anchor.
    text: '',
    target: '_self',
    underline: 'hover',
  },
  defaultLayout: { span: { xs: 2, sm: 4, md: 3, lg: 3 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const LinkBlock: BlockComponent = ({ props, block, context }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const underline = (props.underline as string) ?? 'hover'
  const underlineStyles: Record<string, React.CSSProperties> = {
    always: { textDecoration: 'underline' },
    hover: { textDecoration: 'none' },
    none: { textDecoration: 'none' },
  }

  const style: React.CSSProperties = {
    // THE RIGHT TOKEN is primary-ink, not primary. Both give the same value in
    // a light theme (so the difference never showed) but they diverge in dark:
    // deriveDarkTheme KEEPS the brand hue — correct for primary as a FILL —
    // so indigo stays indigo while the surface darkens and text drops to 3.05:1.
    // primary-ink is the same primary pulled to AA against the surface.
    // Live measurement: the only element below AA in dark mode across 128 rendered blocks.
    color: (props.color as string) ?? 'var(--pw-color-link, var(--pw-color-primary-ink, #18181b))',
    fontSize: cssUnit(props.fontSize as CSSUnit),
    fontWeight: props.fontWeight as React.CSSProperties['fontWeight'],
    ...(underlineStyles[underline] ?? underlineStyles.hover),
    cursor: 'pointer',
    // Honour block.style alongside the props (like card/section/etc.). Spread
    // last so an explicit style override wins, but the prop-derived color/
    // weight/size still apply when style doesn't set them.
    ...block.style,
  }

  const iconName = props.icon as string | undefined
  const external = props.external as boolean | undefined
  const target = external ? '_blank' : ((props.target as string) ?? '_self')
  const rel = external ? 'noopener noreferrer' : undefined
  const ariaLabel = props.ariaLabel as string | undefined

  // A native <a href> navigates via the browser's default action. Real
  // navigation is a SIDE-EFFECT: in inert (editor/preview) mode we cancel the
  // default and emit a `navigate` notification instead, so a preview doesn't
  // actually leave the page. In live mode the anchor behaves natively.
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (context.interactionMode === 'inert') {
      e.preventDefault()
      emit({
        type: SURFACE_EVENTS.BLOCK_CLICK,
        surfaceId,
        blockId: block.id,
        payload: { href: (props.href as string) ?? null },
      })
    }
  }

  // A LINK WITHOUT A TARGET IS A LABEL. Emitting `<a>` with `#` leaves
  // something the reader can click that goes nowhere — and it is wrong for
  // accessibility too (it takes keyboard focus, a screen reader says "link").
  // The `<span>` carries the same style and id so the layout stays the same.
  const resolved = safeHref(props.href as string | undefined)
  // Unset means hidden: a "Link text" placeholder reached visitors.
  const text = safeRenderValue(props.text)
  if (!text && !iconName) return null

  // THE ICON IS DRAWN BESIDE THE TEXT, NOT INSTEAD OF IT.
  // The manifest has always said so; the component rendered `icon ? svg : text`,
  // so a `tel:` link with icon "phone" showed a lone 16px glyph and the number
  // was gone — for the eye and for the screen reader alike (the anchor had no
  // name). The glyph is decoration (aria-hidden); the accessible name is the
  // visible text, or `ariaLabel` when the author gives one. An icon-only link
  // (no text) keeps working, named by `ariaLabel` or else by the icon's name.
  const iconEl = iconName ? (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto' }}
      dangerouslySetInnerHTML={{
        __html: (
          ICON_PATHS[iconName] ??
          ICON_PATHS.circle ?? ['<circle cx="12" cy="12" r="10"/>']
        ).join(''),
      }}
    />
  ) : null
  const accessibleName = ariaLabel || (text ? undefined : iconName)
  if (iconEl) {
    // Icon and text sit on one line, centred, a theme xs space apart;
    // block.style still wins when it sets any of the three.
    style.display = style.display ?? 'inline-flex'
    style.alignItems = style.alignItems ?? 'center'
    style.gap = style.gap ?? 'var(--pw-space-xs, 4px)'
  }

  if (!resolved) {
    return (
      <span id={block.id} data-block-id={block.id} style={style} data-block-type="link" aria-label={accessibleName}>
        {iconEl}
        {text}
      </span>
    )
  }

  return (
    <a
      id={block.id}
      data-block-id={block.id}
      href={resolved}
      target={target}
      rel={rel}
      style={style}
      data-block-type="link"
      aria-label={accessibleName}
      onClick={handleClick}
    >
      {iconEl}
      {text}
    </a>
  )
}

// This block's width is its content: in a flex row it must not take an equal
// share. Declared here, applied by the runtime (>= 4.3).
// `Object.assign` rather than a property assignment so the pack compiles against
// runtime type versions that predate `BlockComponent.sizing`.
Object.assign(LinkBlock, { sizing: 'intrinsic' })
