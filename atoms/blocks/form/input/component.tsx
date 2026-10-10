import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'
import { CONTROL_BORDER } from '../../../lib/_shared-utils.js'

// ============================================================
// ICON PATHS (affix slots)
// ============================================================

/**
 * Lucide-style SVG path data for the input affix icons. This mirrors the
 * canonical `ICON_PATHS` map generated into this pack's `_shared-utils.ts`
 * (which the control.icon block imports). The input affix only needs a
 * handful of glyphs and is kept self-contained for offline bundling, so that
 * subset is inlined here. Keep entries in sync with `_shared-utils.ts`.
 */
const INPUT_ICON_PATHS: Record<string, string[]> = {
  search: [
    '<path d="m21 21-4.34-4.34"/>',
    '<circle cx="11" cy="11" r="8"/>',
  ],
  check: ['<path d="M20 6 9 17l-5-5"/>'],
  x: [
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>',
  ],
  mail: [
    '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/>',
    '<rect x="2" y="4" width="20" height="16" rx="2"/>',
  ],
  lock: [
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>',
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ],
  eye: [
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>',
    '<circle cx="12" cy="12" r="3"/>',
  ],
  user: [
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>',
    '<circle cx="12" cy="7" r="4"/>',
  ],
  phone: ['<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>'],
  calendar: [
    '<path d="M8 2v4"/>',
    '<path d="M16 2v4"/>',
    '<rect width="18" height="18" x="3" y="4" rx="2"/>',
    '<path d="M3 10h18"/>',
  ],
  bell: [
    '<path d="M10.268 21a2 2 0 0 0 3.464 0"/>',
    '<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  ],
  globe: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>',
    '<path d="M2 12h20"/>',
  ],
}

// ============================================================
// SCHEMA
// ============================================================

export const inputTypeSchema = z.enum([
  'text',
  'email',
  'password',
  'number',
  'tel',
  'url',
  'search',
  'date',
  'time',
  'datetime-local',
  'textarea',
])

export const inputPropsSchema = z.object({
  type: inputTypeSchema.default('text'),
  name: z.string().optional(),
  label: z.string().optional(),
  // No default: a placeholder shows only when the author wrote one. "Enter
  // value..." reached visitors in every language.
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  disabled: z.boolean().default(false),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  // Numbers for type=number, ISO strings for date/time types.
  min: z.union([z.number(), z.string()]).optional(),
  max: z.union([z.number(), z.string()]).optional(),
  /**
   * Granularity of a number/date/time value — a number, or "any". Without it
   * `type=number` accepted integers only, so a price like 12.50 was refused by
   * the browser.
   */
  step: z.union([z.number().positive(), z.literal('any')]).optional(),
  pattern: z.string().optional(),
  rows: z.number().int().min(1).max(20).optional(),
  leadingIcon: z.string().optional(),
  trailingIcon: z.string().optional(),
  /**
   * Surface state key this field writes on change — the same contract
   * `segmented-control` and `pagination` already carry. A search box in a
   * filter toolbar is useless without it: a data source whose query reads
   * `{{state.<stateKey>}}` re-queries as the visitor types. Without it a
   * search input in a filter bar has no way to reach a query, and every filter
   * toolbar has to be hand-wired.
   */
  stateKey: z.string().optional(),
  // Initial value — expression-bindable ({{source[0].field}}), so a form can
  // carry data-derived context (e.g. a lookup id) into its FormData payload.
  // Combined with block.style {display:"none"} this doubles as a hidden field
  // (display:none inputs ARE submitted; only disabled ones are excluded).
  defaultValue: z.string().optional(),
})

export type InputProps = z.infer<typeof inputPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const inputDefinition: BlockDefinition = {
  type: 'input',
  name: 'Input',
  category: 'form',
  icon: '▭',
  schema: inputPropsSchema,
  defaultProps: {
    type: 'text',
    required: false,
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 4, lg: 6 } },
  canHaveChildren: false,
  allowedParents: ['form', 'container'],
}

// ============================================================
// COMPONENT
// ============================================================

export const InputBlock: BlockComponent = ({ props, block }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const inputType = (props.type as string) ?? 'text'
  const isTextarea = inputType === 'textarea'
  const label = props.label as string | undefined
  const required = props.required as boolean
  const disabled = props.disabled as boolean
  // Expression-bound defaultValue resolves AFTER first mount (data arrives on a
  // later render), but React ignores defaultValue changes on a mounted
  // uncontrolled input — so the inner element is KEYED by the value, forcing a
  // remount when it resolves. Untouched (undefined) → key '' → no behavioural
  // change for existing usages.
  const defaultValue = props.defaultValue as string | undefined

  // Affix icons only apply to single-line inputs (a textarea has no vertical
  // center to align a glyph to). Resolve the named icon to its SVG paths;
  // unknown names render nothing rather than a fallback glyph.
  const leadingIconName = props.leadingIcon as string | undefined
  const trailingIconName = props.trailingIcon as string | undefined
  const leadingPaths = !isTextarea && leadingIconName ? INPUT_ICON_PATHS[leadingIconName] : undefined
  const trailingPaths = !isTextarea && trailingIconName ? INPUT_ICON_PATHS[trailingIconName] : undefined
  const hasLeading = Boolean(leadingPaths)
  const hasTrailing = Boolean(trailingPaths)

  const ICON_SIZE = 18
  const ICON_GUTTER = 36 // icon box + symmetric padding so text never overlaps

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    // Reserve horizontal room for any affix icon so the text/placeholder does
    // not slide under the glyph.
    ...(hasLeading ? { paddingLeft: `${ICON_GUTTER}px` } : {}),
    ...(hasTrailing ? { paddingRight: `${ICON_GUTTER}px` } : {}),
    // `--pw-border` is not a defined appearance token (only `--pw-color-border`,
    // `--pw-border-radius`, `--pw-border-width`, `--pw-border-style` exist), so
    // the old `var(--pw-border)` resolved to nothing and the field rendered with
    // no visible box. Use the same explicit border as select/textarea.
    // The CONTROL edge, not the divider colour: --pw-color-border sits far
    // under 3:1 on the ground, and this edge is the only sign of the field
    // (WCAG 1.4.11).
    border: `1px solid ${CONTROL_BORDER}`,
    borderRadius: 'var(--pw-border-radius)',
    fontSize: 'var(--pw-font-size-base)',
    // Form controls do not inherit the page font (UA sheet) — same as button.
    fontFamily: 'inherit',
    backgroundColor: 'var(--pw-color-card)',
    color: 'var(--pw-color-text)',
    // No `outline: 'none'` — it erased the runtime's focus ring, so a keyboard
    // visitor could not see which field had focus.
    // Layer 4: block-level style overrides
    ...block.style,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontSize: 'var(--pw-font-size-sm)',
    fontWeight: 500,
    color: 'var(--pw-color-text)',
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    emit({
      type: SURFACE_EVENTS.INPUT_CHANGE,
      surfaceId,
      blockId: block.id,
      payload: {
        value: target.value,
        inputId: block.id,
        name: props.name,
        ...(typeof props.stateKey === 'string' && props.stateKey
          ? { action: { type: 'setState', key: props.stateKey, value: target.value } }
          : {}),
      },
    })
  }

  // An affix icon is absolutely positioned over the field, vertically centred,
  // and non-interactive so clicks fall through to the input.
  const affixStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: '12px',
    width: `${ICON_SIZE}px`,
    height: `${ICON_SIZE}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--pw-color-text-muted)',
    pointerEvents: 'none',
  })

  const renderAffix = (paths: string[], side: 'left' | 'right'): React.ReactElement => (
    <span style={affixStyle(side)} aria-hidden="true" data-affix={side === 'left' ? 'leading' : 'trailing'}>
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: paths.join('') }}
      />
    </span>
  )

  return (
    <div
      data-block-id={block.id}
      style={{ opacity: disabled ? 0.5 : undefined, cursor: disabled ? 'not-allowed' : undefined }}
    >
      {label && (
        <label htmlFor={block.id} style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--pw-color-error)' }}> *</span>}
        </label>
      )}
      {isTextarea ? (
        <textarea
          key={defaultValue ?? ''}
          id={block.id}
          name={props.name as string}
          defaultValue={defaultValue}
          placeholder={(props.placeholder as string) || undefined}
          required={required}
          disabled={disabled}
          style={inputStyle}
          onChange={handleChange}
          data-block-type="input"
          rows={(props.rows as number) ?? 4}
        />
      ) : (
        <div style={{ position: 'relative', display: 'block' }}>
          {leadingPaths && renderAffix(leadingPaths, 'left')}
          <input
            key={defaultValue ?? ''}
            id={block.id}
            type={inputType}
            name={props.name as string}
            defaultValue={defaultValue}
            placeholder={(props.placeholder as string) || undefined}
            required={required}
            disabled={disabled}
            style={inputStyle}
            onChange={handleChange}
            data-block-type="input"
            minLength={props.minLength as number}
            maxLength={props.maxLength as number}
            min={props.min as number | string | undefined}
            max={props.max as number | string | undefined}
            step={props.step as number | 'any' | undefined}
            inputMode={inputType === 'number' && props.step !== undefined && props.step !== 1 ? 'decimal' : undefined}
            pattern={props.pattern as string}
          />
          {trailingPaths && renderAffix(trailingPaths, 'right')}
        </div>
      )}
    </div>
  )
}
