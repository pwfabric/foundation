import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { CONTROL_BORDER, safeRenderValue } from '../../../lib/_shared-utils.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

export const textareaPropsSchema = z.object({
  name: z.string().optional(),
  label: z.string().optional(),
  // No default: "Enter text..." reached visitors in every language.
  placeholder: z.string().optional(),
  rows: z.number().int().min(1).max(20).default(4),
  maxLength: z.number().int().min(1).optional(),
  required: z.boolean().default(false),
  disabled: z.boolean().default(false),
  resize: z.enum(['none', 'vertical', 'horizontal', 'both']).default('vertical'),
  /** State key the value is written to on change — `{{state.<key>}}` then reads it (a summary step, a filter). Mirrors form.select / form.segmented-control. */
  stateKey: z.string().optional(),
  /**
   * Initial value — expression-bindable, so an edit (PATCH) form shows the
   * stored text. Applied by remount once the data resolves, the
   * same contract as form.input.
   */
  defaultValue: z.string().optional(),
})

export type TextareaProps = z.infer<typeof textareaPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const textareaDefinition: BlockDefinition = {
  type: 'textarea',
  name: 'Textarea',
  category: 'form',
  icon: '▭',
  schema: textareaPropsSchema,
  defaultProps: {
    rows: 4,
    required: false,
    disabled: false,
    resize: 'vertical',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 6, lg: 6 } },
  canHaveChildren: false,
  allowedParents: ['form', 'container'],
}

// ============================================================
// COMPONENT
// ============================================================

export const TextareaBlock: BlockComponent = ({ props, block }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const stateKey = typeof props.stateKey === 'string' && props.stateKey ? props.stateKey : undefined
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    emit({
      type: SURFACE_EVENTS.INPUT_CHANGE,
      surfaceId,
      blockId: block.id,
      payload: {
        value: e.target.value,
        inputId: block.id,
        name: props.name,
        ...(stateKey ? { action: { type: 'setState', key: stateKey, value: e.target.value } } : {}),
      },
    })
  }
  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    opacity: props.disabled ? 0.5 : undefined,
    cursor: props.disabled ? 'not-allowed' : undefined,
    ...block.style,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--pw-font-size-sm)',
    fontWeight: 500,
    color: 'var(--pw-color-text)',
  }
  const taStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: 'var(--pw-font-size-sm)',
    lineHeight: '1.5',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    // The control edge and the theme radius.
    border: `1px solid ${CONTROL_BORDER}`,
    borderRadius: 'var(--pw-border-radius)',
    backgroundColor: 'var(--pw-color-card)',
    color: 'var(--pw-color-text)',
    resize: (props.resize as React.CSSProperties['resize']) ?? 'vertical',
    opacity: props.disabled ? 0.5 : 1,
    cursor: props.disabled ? 'not-allowed' : 'auto',
  }
  // The label is BOUND to the field: a click focuses it, a screen
  // reader announces it, and the form's missing-field message reads it.
  const fieldId = `${block.id}-textarea`
  const defaultValue = typeof props.defaultValue === 'string' ? props.defaultValue : undefined
  return (
    <div id={block.id} data-block-id={block.id} style={wrapStyle} data-block-type="textarea">
      {!!props.label && (
        <label htmlFor={fieldId} style={labelStyle}>
          {safeRenderValue(props.label)}
          {!!props.required && <span style={{ color: 'var(--pw-color-error)' }}> *</span>}
        </label>
      )}
      <textarea
        key={defaultValue ?? ''}
        id={fieldId}
        defaultValue={defaultValue}
        rows={(props.rows as number) ?? 4}
        placeholder={safeRenderValue(props.placeholder) || undefined}
        disabled={props.disabled as boolean}
        required={props.required as boolean}
        name={safeRenderValue(props.name)}
        maxLength={(props.maxLength as number | undefined) ?? undefined}
        style={taStyle}
        onChange={handleChange}
      />
    </div>
  )
}
