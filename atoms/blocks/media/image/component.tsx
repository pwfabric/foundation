import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { MEDIA_CAPTION_GRADIENT, ON_OVERLAY_SCRIM, cssUnit, safeRenderValue, type CSSUnit } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const objectFitSchema = z.enum(['cover', 'contain', 'fill', 'none', 'scale-down'])

export const imagePropsSchema = z.object({
  src: z.string().default(''),
  alt: z.string().default(''),
  objectFit: objectFitSchema.default('cover'),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
  aspectRatio: z.string().optional(),
  borderRadius: z.union([z.number(), z.string()]).optional(),
  loading: z.enum(['lazy', 'eager']).default('lazy'),
  align: z.enum(['left', 'center', 'right']).optional(),
  // For media-teaser cards: overlays a dark bottom-edge gradient + title/
  // subtitle ON TOP of the image. With neither set the behaviour is exactly
  // the plain image block — existing uses are unaffected.
  overlayTitle: z.string().optional(),
  overlaySubtitle: z.string().optional(),
  // An OPTIONAL image — a logo next to a text brand — draws nothing without a
  // src, in the editor too. The editor skeleton is right for a content slot
  // the author must fill; beside a brand name it read "⊟ Acme logo" on every
  // static page (shell brand rows).
  hideWhenEmpty: z.boolean().default(false),
})

export type ImageProps = z.infer<typeof imagePropsSchema>

// ============================================================
// PLATFORM PLACEHOLDER
// ============================================================

const PLACEHOLDER_MARK = /pw-placeholder:([A-Za-z0-9._-]+)/

/** A platform placeholder, read: its need key and, when the SVG states them, its size. */
export interface PlatformPlaceholder {
  key: string
  width?: number
  height?: number
}

const svgNumber = (tag: string, attr: string): number | undefined => {
  // Unitless only: `width="100%"` (or em, px…) says nothing about the picture's
  // ratio, so it falls through to the viewBox.
  const m = new RegExp(String.raw`\s${attr}=["']?([0-9]+(?:\.[0-9]+)?)(?![0-9.%a-z])`, 'i').exec(tag)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Reads a platform placeholder src, or null for any other value.
 *
 * The platform placeholder is a `data:image/svg+xml` URI whose SVG carries
 * `pw-placeholder:<key>` (a host may write one into every declared image
 * slot and later replace it with the real picture). Deliberately local —
 * a block does not import contracts — and deliberately small: URL-encoded,
 * base64 and raw bodies are read; anything else is a real image. The size is
 * the root <svg>'s width/height (or its viewBox), so the slot can hold the
 * picture's ratio and the layout does not shift when the picture arrives.
 */
export function readPlaceholder(src: string): PlatformPlaceholder | null {
  const value = src.trim()
  const head = /^data:image\/svg\+xml(;[^,]*)?,/i.exec(value)
  if (!head) return null
  const body = value.slice(head[0].length)
  let text = body
  try {
    text = /;base64/i.test(head[1] ?? '')
      ? typeof atob === 'function'
        ? atob(body)
        : ''
      : decodeURIComponent(body)
  } catch {
    text = body
  }
  const key = PLACEHOLDER_MARK.exec(text)?.[1]
  if (!key) return null
  const tag = /<svg\s[^>]*>/i.exec(text)?.[0] ?? ''
  let width = svgNumber(tag, 'width')
  let height = svgNumber(tag, 'height')
  if (width === undefined || height === undefined) {
    const vb = /\sviewBox=["']?\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(tag)
    const w = vb ? Number(vb[1]) : NaN
    const h = vb ? Number(vb[2]) : NaN
    if (w > 0 && h > 0) {
      width = w
      height = h
    }
  }
  return width !== undefined && height !== undefined ? { key, width, height } : { key }
}

/** The need key of a platform placeholder src, or null for any other value. */
export function placeholderKey(src: string): string | null {
  return readPlaceholder(src)?.key ?? null
}

// ============================================================
// DEFINITION
// ============================================================

export const imageDefinition: BlockDefinition = {
  type: 'image',
  name: 'Image',
  category: 'media',
  icon: '⊟',
  schema: imagePropsSchema,
  defaultProps: {
    src: '',
    alt: '',
    objectFit: 'cover',
  },
  defaultLayout: { span: { xs: 4, sm: 4, md: 4, lg: 4 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const ImageBlock: BlockComponent = ({ props, block, context }) => {
  // A src that fails to load is treated like no src at all.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  const inert = context?.interactionMode === 'inert'
  const align = props.align as string | undefined
  const wrapperStyle: React.CSSProperties = align
    ? {
        display: 'flex',
        justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        width: '100%',
      }
    : {}

  const rawSrc = typeof props.src === 'string' ? props.src.trim() : ''
  const src = rawSrc && rawSrc !== failedSrc ? rawSrc : ''
  const aspectRatio = props.aspectRatio as string | undefined

  // F1 — graceful placeholder when no src. A real design's image SLOT matters for
  // layout; the asset itself can be filled later. Instead of a broken <img>
  // (the old `/placeholder.png` 404), render a themeable skeleton that preserves
  // the slot's dimensions (width/height/aspectRatio) so the layout reads as 1:1
  // even without a hosted asset. Tokens → follows the theme.
  //
  // EMPTY, BROKEN OR PLACEHOLDER SRC KEEPS THE LAYOUT (4.1.0). A src that fails
  // to load is empty, so it too shows the quiet slot live — the layout
  // holds; `hideWhenEmpty` removes it. Until 4.0.4 a live empty
  // image rendered nothing (visitors saw "⊟ Image"), and the band it
  // sat in collapsed. A host may write the platform placeholder into every
  // declared image slot and swap the real picture in later, so
  // an unfilled slot is a normal live state, not an authoring leftover. Live,
  // the slot keeps its box — same ground and border as the editor skeleton —
  // but QUIET: no "⊟ label" text reaches a visitor. `hideWhenEmpty` still means
  // "draw nothing" (a logo beside a text brand), live and in the editor — and a
  // placeholder src counts as empty there: an optional logo has no slot to keep.
  //
  // A PLATFORM PLACEHOLDER IS NOT A PICTURE. Its neutral grey SVG ignores the
  // theme; the block draws the themeable skeleton instead and exposes the need
  // key as `data-pw-placeholder` for the canvas (click to replace) and gates.
  const platform = src ? readPlaceholder(src) : null
  const placeholderNeed = platform?.key ?? null
  const empty = !src || platform !== null
  if (empty && props.hideWhenEmpty === true) return null
  if (empty) {
    const alt = typeof props.alt === 'string' ? props.alt.trim() : ''
    // With no declared ratio or height, a platform placeholder lends the slot
    // the picture's own ratio (its SVG size), so nothing moves when it arrives.
    const heightProp = cssUnit(props.height as CSSUnit)
    const slotRatio =
      aspectRatio ??
      (heightProp === undefined && platform?.width && platform.height ? `${platform.width}/${platform.height}` : undefined)
    const placeholderStyle: React.CSSProperties = {
      width: cssUnit(props.width as CSSUnit) ?? '100%',
      maxWidth: '100%',
      height: heightProp ?? (slotRatio ? 'auto' : '200px'),
      aspectRatio: slotRatio,
      borderRadius: cssUnit(props.borderRadius as CSSUnit) ?? 'var(--pw-border-radius)',
      backgroundColor: 'var(--pw-color-card)',
      border: '1px dashed var(--pw-color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--pw-color-text-muted)',
      fontSize: 'var(--pw-font-size-sm)',
      boxSizing: 'border-box',
      ...block.style,
    }
    // The alt stays for screen readers: a described slot is an image whose
    // picture has not arrived. A slot with no alt is decorative and hidden.
    const a11y: Record<string, string> = alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': 'true' }
    const placeholder = (
      <div
        id={block.id}
        data-block-id={block.id}
        style={placeholderStyle}
        data-block-type="image"
        data-image-placeholder=""
        {...(placeholderNeed !== null ? { 'data-pw-placeholder': placeholderNeed } : {})}
        {...a11y}
      >
        {inert ? <span aria-hidden="true">⊟ {alt || 'Image'}</span> : null}
      </div>
    )
    return align ? <div style={wrapperStyle}>{placeholder}</div> : placeholder
  }

  const style: React.CSSProperties = {
    width: cssUnit(props.width as CSSUnit) ?? '100%',
    // A numeric width is a preferred size, never wider than the column: a
    // 600px image in a 360px phone column overflowed the page.
    maxWidth: '100%',
    display: 'block',
    height: cssUnit(props.height as CSSUnit) ?? 'auto',
    objectFit: (props.objectFit as React.CSSProperties['objectFit']) ?? 'cover',
    aspectRatio,
    borderRadius: cssUnit(props.borderRadius as CSSUnit) ?? 'var(--pw-border-radius)',
    // Layer 4: block-level style overrides
    ...block.style,
  }

  const img = (
    <img
      id={block.id}
      data-block-id={block.id}
      src={src}
      alt={(props.alt as string) ?? ''}
      style={style}
      loading={(props.loading as 'lazy' | 'eager') ?? 'lazy'}
      data-block-type="image"
      onError={() => setFailedSrc(rawSrc)}
    />
  )

  // Overlay variant — image with a bottom dark gradient carrying title/subtitle.
  const overlayTitle = props.overlayTitle as string | undefined
  const overlaySubtitle = props.overlaySubtitle as string | undefined
  if (overlayTitle || overlaySubtitle) {
    const frame: React.CSSProperties = {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: cssUnit(props.borderRadius as CSSUnit) ?? 'var(--pw-border-radius)',
      width: cssUnit(props.width as CSSUnit) ?? '100%',
      maxWidth: '100%',
      lineHeight: 0,
    }
    const scrim: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      gap: '2px',
      padding: '14px 16px',
      background: MEDIA_CAPTION_GRADIENT,
      lineHeight: 1.35,
    }
    const overlaid = (
      <div style={frame} data-block-type="image-overlay">
        {img}
        <div style={scrim}>
          {overlayTitle ? (
            <span style={{ color: ON_OVERLAY_SCRIM, fontWeight: 700, fontSize: 'var(--pw-font-size-lg)', fontFamily: 'var(--pw-font-family-heading)' }}>
              {safeRenderValue(overlayTitle)}
            </span>
          ) : null}
          {overlaySubtitle ? (
            <span style={{ color: ON_OVERLAY_SCRIM, fontWeight: 500, fontSize: 'var(--pw-font-size-sm)' }}>
              {safeRenderValue(overlaySubtitle)}
            </span>
          ) : null}
        </div>
      </div>
    )
    return align ? <div style={wrapperStyle}>{overlaid}</div> : overlaid
  }

  return align ? <div style={wrapperStyle}>{img}</div> : img
}
