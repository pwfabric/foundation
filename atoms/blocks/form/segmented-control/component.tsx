import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { CONTROL_BORDER, MOTION, safeRenderValue } from '../../../lib/_shared-utils.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

export const segmentedControlOptionSchema = z.object({
  label: z.string(),
  /** Text, or a real boolean/number: `{label:"Yes", value:true}`. */
  value: z.union([z.string(), z.number(), z.boolean()]),
  /** Optional colour swatch dot before the label (dial/strap/theme pickers). */
  color: z.string().optional(),
})

export const segmentedControlPropsSchema = z.object({
  name: z.string().optional(),
  label: z.string().default(''),
  // No sample options: Day/Week/Month reached visitors. With no
  // options the control draws nothing.
  options: z.array(segmentedControlOptionSchema).default([]),
  /** The selected value. `null` with `allowNone` (or a one-option control) means nothing selected. */
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  /**
   * What the control writes to state and to the form.
   * `text`: the option value as text. `boolean`: `true` / `false` as real
   * booleans — a yes/no answer that `visibleWhen` and a boolean field can read
   * ("false" as text is truthy). Unset: `boolean` when every option value is a
   * boolean, else `text`.
   */
  valueType: z.enum(['text', 'boolean']).optional(),
  /**
   * Nothing selected until the visitor picks, and picking the lit pill again
   * clears it. Unset: on for a ONE-option control — a single choice that
   * is always chosen answers nothing (a consent pill pre-selected "true"
   * opened its gate for everyone) — off otherwise.
   */
  allowNone: z.boolean().optional(),
  size: z.enum(['sm', 'md']).default('md'),
  /**
   * Narrow screens: the pills WRAP onto a second line (default). The old row
   * scrolled sideways with its scrollbar hidden, so on a phone the last options
   * looked cut off. `wrap: false` keeps one row that scrolls, with
   * the scrollbar visible.
   */
  wrap: z.boolean().default(true),
  /** State key the selected value is written to — makes the control drive a data-source filter (`{{state.<key>}}`). */
  stateKey: z.string().optional(),
})

export type SegmentedControlProps = z.infer<typeof segmentedControlPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const segmentedControlDefinition: BlockDefinition = {
  type: 'segmented-control',
  name: 'Segmented Control',
  category: 'form',
  icon: '▤',
  schema: segmentedControlPropsSchema,
  defaultProps: {
    label: '',
    options: [],
    size: 'md',
  },
  defaultLayout: { span: { xs: 4, sm: 6, md: 4, lg: 4 } },
  canHaveChildren: false,
  allowedParents: ['form', 'container'],
}

// ============================================================
// COMPONENT
// ============================================================

/** The chosen pill: badge-primary's language — filled, on-primary ink, 2px ink edge. */
export const SEGMENT_SELECTED: React.CSSProperties = {
  background: 'var(--pw-color-primary, #18181b)',
  color: 'var(--pw-color-text-on-primary, #ffffff)',
  boxShadow: 'inset 0 0 0 2px var(--pw-color-primary-ink, var(--pw-color-primary, #18181b))',
}
/** The other pills: the track shows through, muted ink. */
export const SEGMENT_IDLE: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--pw-color-text-muted, #71717a)',
  boxShadow: 'none',
}

interface Option {
  label: string
  value: string
  color?: string
}

/** A value as the text a form field carries: `true` → "true", 2 → "2", null → "". */
function asText(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** "true" / "false" as booleans; any other text stays text. */
function asBoolean(v: string): boolean | string {
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

export const SegmentedControlBlock: BlockComponent = ({ props, block }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()

  const label = (props.label as string) ?? ''
  const size = (props.size as string) === 'sm' ? 'sm' : 'md'
  const name = props.name as string | undefined
  // Option values are compared as TEXT. A composed app often writes a yes/no
  // control as `{value: true}` / `value: false` — booleans that never equalled
  // anything, so no pill looked selected.
  const rawOptions: Array<Option & { value: unknown }> = Array.isArray(props.options)
    ? (props.options as Array<Option & { value: unknown }>)
    : []
  const options: Option[] = rawOptions.map((o) => ({ ...o, value: asText(o.value) }))
  const booleanMode =
    props.valueType === 'boolean' ||
    (props.valueType !== 'text' && rawOptions.length > 0 && rawOptions.every((o) => typeof o.value === 'boolean'))
  const allowNone = typeof props.allowNone === 'boolean' ? props.allowNone : options.length === 1
  /** The value as it leaves the control: text, a real boolean, or "nothing". */
  const outward = (v: string | null): string | boolean | null =>
    v === null ? (booleanMode ? null : '') : booleanMode ? asBoolean(v) : v

  /**
   * THE SELECTED VALUE IS ALWAYS ONE OF THE OPTIONS — the one the visitor sees.
   *
   * A value that matches no option (the LABEL written as the value, "Yes"
   * for `{label:"Yes", value:"true"}`) lit no pill, yet was submitted as it
   * stood. A value given as a binding (`{{state.x}}`) arrives resolved AFTER
   * the first render; it was ignored because the local state was seeded once.
   * Now: match by value, then by label; nothing matches → the first option
   * (or NOTHING, with `allowNone`); and a new `value` prop re-selects.
   */
  const resolveValue = (raw: unknown): string | null => {
    const text = asText(raw)
    const given = raw !== undefined && raw !== null
    const byValue = given ? options.find((o) => o.value === text) : undefined
    if (byValue) return byValue.value
    const byLabel = text ? options.find((o) => asText(o.label) === text) : undefined
    if (byLabel) return byLabel.value
    if (allowNone) return null
    return options[0]?.value ?? text
  }
  const propValue = resolveValue(props.value)
  const [value, setValue] = React.useState<string | null>(propValue)
  const lastPropValue = React.useRef(propValue)
  if (lastPropValue.current !== propValue) {
    // A changed prop wins over the last click — setState during render is
    // React's documented "adjust state when a prop changes" pattern.
    lastPropValue.current = propValue
    setValue(propValue)
  }

  // `stateKey`: the change carries a declarative `setState` action, so a data
  // source whose query filter reads `{{state.<stateKey>}}` re-fetches. The
  // control becomes the filter of a list, not a pill row that remembers a click.
  const stateKey = typeof props.stateKey === 'string' && props.stateKey ? props.stateKey : undefined
  const report = (selected: string | null, seed: boolean): void => {
    const next = outward(selected)
    emit({
      type: SURFACE_EVENTS.INPUT_CHANGE,
      surfaceId,
      blockId: block.id,
      payload: {
        value: next,
        inputId: block.id,
        name,
        ...(seed ? { seed: true } : {}),
        ...(stateKey ? { action: { type: 'setState', key: stateKey, value: next } } : {}),
      },
    })
  }
  const select = (picked: string): void => {
    // With allowNone, the lit pill clicked again clears the answer.
    const next = allowNone && picked === value ? null : picked
    setValue(next)
    report(next, false)
  }

  // THE PRESELECTED VALUE SEEDS STATE. A list filtered by `{{state.<key>}}`
  // read an unset key until the first click, while the control already showed
  // a lit pill — the filter and the pill disagreed. On
  // mount, and whenever the resolved initial value changes, the value the
  // visitor sees is written to the state key. `seed: true` marks it.
  React.useEffect(() => {
    if (!stateKey || options.length === 0) return
    report(propValue, true)
  }, [stateKey, propValue, options.length])

  // A form reset (form.resetWhen, or a reset button) returns the control to
  // its initial value — its hidden input is React-owned, so the native reset
  // alone would leave the pill and the submitted value on the old choice.
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const initialRef = React.useRef(propValue)
  initialRef.current = propValue
  React.useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = (): void => {
      setValue(initialRef.current)
      if (stateKey) report(initialRef.current, true)
    }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [stateKey])

  const wrap = props.wrap !== false
  if (options.length === 0) return null

  const pad = size === 'sm' ? '4px 10px' : '6px 14px'
  const fontSize = size === 'sm' ? 'var(--pw-font-size-xs, 12px)' : 'var(--pw-font-size-sm, 14px)'

  return (
    <div
      ref={rootRef}
      id={block.id}
      data-block-id={block.id}
      data-block-type="segmented-control"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--pw-space-xs, 4px)',
        width: 'max-content',
        // Narrow screens: the pill row keeps its labels and scrolls inside
        // itself instead of pushing the row wider than the viewport (at 390px
        // the last label would otherwise clip). The block
        // is intrinsic, so the wrapper only shrinks when the author lets it
        // (style.flex '0 1 auto' / minWidth 0); with that hint this scroll is
        // what the visitor sees.
        maxWidth: '100%',
        minWidth: 0,
        ...(wrap ? {} : { overflowX: 'auto' as const }),
        ...block.style,
      }}
    >
      {/* A form gathers its values with `new FormData(form)`, and the pills are
          buttons, so a named control inside a form was never submitted — the
          RSVP yes/no answer was lost and the "coming" counter stayed at 0.
          The hidden input carries the value the visitor
          SEES, touched or not. Same pattern as form.date-input. */}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value ?? ''}
          {...(booleanMode ? { 'data-pw-value-type': 'boolean' } : {})}
        />
      ) : null}
      {label && (
        <span
          style={{
            fontSize: 'var(--pw-font-size-sm, 14px)',
            color: 'var(--pw-color-text, #09090b)',
            fontWeight: 500,
          }}
        >
          {safeRenderValue(label)}
        </span>
      )}
      <div
        role="radiogroup"
        aria-label={label || 'Segmented control'}
        style={{
          display: 'inline-flex',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          alignItems: 'center',
          gap: '2px',
          padding: '3px',
          background: 'var(--pw-color-background, #ffffff)',
          // The control edge, not the divider colour.
          border: `1px solid ${CONTROL_BORDER}`,
          borderRadius: 'var(--pw-border-radius, 8px)',
        }}
      >
        {options.map((opt, i) => {
          const active = opt.value === value
          return (
            <button
              key={`${opt.value}-${i}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => select(opt.value)}
              style={{
                appearance: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: pad,
                fontSize,
                // Pills are <button>s: without this they draw in the UA font.
                fontFamily: 'inherit',
                fontWeight: 500,
                borderRadius: 'var(--pw-border-radius-sm, 6px)',
                whiteSpace: 'nowrap',
                // THE SELECTED PILL IS FILLED. It was an accent-subtle
                // wash with a primary-ink label: 1.10/1.19:1 from its neighbours,
                // and the label fell to 4.22:1 in the derived dark mode. Now it
                // speaks badge-primary: the brand fill with the theme's
                // on-primary ink and a 2px primary-ink edge (≥ 4.5:1 against the
                // ground by the cascade), so the shape clears 3:1 against the
                // track and the unselected pills in every preset, light and dark.
                ...(active ? SEGMENT_SELECTED : SEGMENT_IDLE),
                transition: `background-color ${MOTION.normal}, color ${MOTION.normal}, box-shadow ${MOTION.normal}`,
                outlineColor: 'var(--pw-focus-ring-color, var(--pw-color-primary, #18181b))',
              }}
            >
              {opt.color ? (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '999px',
                    backgroundColor: opt.color,
                    border: '1px solid var(--pw-color-border, #e4e4e7)',
                    marginRight: '6px',
                    verticalAlign: 'middle',
                  }}
                />
              ) : null}
              {safeRenderValue(opt.label)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// This block's width is its content: in a flex row it must not take an equal
// share. Declared here, applied by the runtime (>= 4.3).
// `Object.assign` rather than a property assignment so the pack compiles against
// runtime type versions that predate `BlockComponent.sizing`.
Object.assign(SegmentedControlBlock, { sizing: 'intrinsic' })
