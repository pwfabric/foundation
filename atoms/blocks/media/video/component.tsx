import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { MEDIA_LETTERBOX, safeRenderValue } from '../../../lib/_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const videoPropsSchema = z.object({
  src: z.string().default(''),
  autoplay: z.boolean().default(false),
  controls: z.boolean().default(true),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  poster: z.string().optional(),
  // CSS aspect-ratio. Accepts the legacy colon presets ('16:9'|'4:3'|'1:1') AND
  // any CSS aspect-ratio string ('16/9', '4/3', '1/1', '21/9', '3/2') or a number.
  // Colon forms are normalised to the CSS `/` form for the native aspect-ratio.
  aspectRatio: z.union([z.number(), z.string()]).default('16/9'),
  caption: z.string().optional(),
})

export type VideoProps = z.infer<typeof videoPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const videoDefinition: BlockDefinition = {
  type: 'video',
  name: 'Video',
  category: 'media',
  icon: '▶',
  schema: videoPropsSchema,
  defaultProps: {
    src: '',
    controls: true,
    autoplay: false,
    loop: false,
    muted: false,
    aspectRatio: '16/9',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

export const VideoBlock: BlockComponent = ({ props, block, context }) => {
  const src = typeof props.src === 'string' ? props.src.trim() : ''
  const inert = context?.interactionMode === 'inert'
  // Browsers refuse to autoplay a video with sound, so `autoplay` without
  // `muted` never started. Autoplay implies muted.
  const autoplay = props.autoplay === true
  const muted = autoplay || props.muted === true
  // Normalise the ratio to the native CSS aspect-ratio form. Legacy colon presets
  // ('16:9') and any custom string ('21/9', '3/2') or number all map to `/`.
  const rawAspect = props.aspectRatio == null ? '16/9' : String(props.aspectRatio)
  const aspectRatio = rawAspect.includes(':') ? rawAspect.replace(':', '/') : rawAspect

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio,
    backgroundColor: MEDIA_LETTERBOX,
    borderRadius: '4px',
    overflow: 'hidden',
  }

  const videoStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  }

  // No source: nothing in the published app. The stand-in is an editor
  // affordance — "▶ Video placeholder" reached visitors.
  if (!src && !inert) return null

  return (
    <div id={block.id} data-block-id={block.id} style={block.style as React.CSSProperties} data-block-type="video">
      <div style={wrapperStyle}>
        {src ? (
          <video
            src={src}
            style={videoStyle}
            controls={props.controls !== false}
            autoPlay={autoplay}
            loop={props.loop === true}
            muted={muted}
            playsInline={autoplay || undefined}
            poster={props.poster as string | undefined}
          />
        ) : (
          <div
            style={{
              ...videoStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // The placeholder FILL is UI, not letterbox: it follows the theme.
              backgroundColor: 'var(--pw-color-surface-muted, color-mix(in srgb, var(--pw-color-card) 94%, var(--pw-color-text)))',
              color: 'var(--pw-color-text-muted, #71717a)',
              fontSize: 'var(--pw-font-size-sm)',
            }}
          >
            ▶ Video placeholder
          </div>
        )}
      </div>
      {!!props.caption && (
        <p
          style={{
            fontSize: 'var(--pw-font-size-xs)',
            color: 'color-mix(in srgb, var(--pw-color-text, #09090b) 75%, transparent)',
            textAlign: 'center',
            marginTop: '8px',
          }}
        >
          {safeRenderValue(props.caption)}
        </p>
      )}
    </div>
  )
}
