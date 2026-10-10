import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { cssUnit, type CSSUnit } from '../../../lib/_shared-utils.js'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

export const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export const formPropsSchema = z.object({
  action: z.string().default(''),
  method: httpMethodSchema.default('POST'),
  // No default text. Unset → the browser's own submit button, which it labels
  // in the visitor's language; "Submit" in a Turkish app was the defect.
  submitLabel: z.string().optional(),
  resetLabel: z.string().optional(),
  showReset: z.boolean().default(false),
  gap: z.union([z.number(), z.string()]).default(16),
  // Optional declarative state action dispatched on submit (a SurfaceAction, e.g.
  // { type:'setState', key:'submitted', value:true }). Carried in the form:submit
  // event payload → DataBoundSurfaceRenderer.handleEvent applies it. Lets a receipt
  // drive a form↔success toggle (a success block with visibleWhen:'{{state.submitted}}').
  onSubmitAction: z.unknown().optional(),
  // In-flight submit lock — bind to the form-entity bridge's statusKeys.loading
  // boolean: `"submittingWhen": "{{state.scLoading}}"`. While truthy the submit
  // button is disabled and shows a small spinner glyph (no text — shape carries
  // the meaning) and handleSubmit swallows re-entries (Enter key included), so
  // an impatient double-click can't create the entity twice. Unbound → identical
  // to the previous behavior.
  submittingWhen: z.boolean().optional(),
  // Whether the form renders its own submit button. Bindable, so a multi-step
  // flow can wrap EVERY step in one form and show the submit only on the last:
  // `"showSubmit": "{{state.step == 3}}"`. Unset → shown (previous behavior).
  // With the submit always visible, a composer wraps only step 1 in the form
  // and the final "confirm" button only moves to the next step — the record
  // is never written.
  showSubmit: z.union([z.boolean(), z.string()]).optional(),
  // Clears the fields when this turns true — bind it to the form-entity
  // bridge's success key: `"resetWhen": "{{state.scSuccess}}"`. A form never
  // cleared after a successful write, so the visitor's entry sat there and a
  // second click wrote it twice. Only the false → true
  // edge resets; staying true does not wipe what the visitor types next.
  resetWhen: z.union([z.boolean(), z.string()]).optional(),
})

export type FormProps = z.infer<typeof formPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const formDefinition: BlockDefinition = {
  type: 'form',
  name: 'Form',
  category: 'form',
  icon: '☐',
  schema: formPropsSchema,
  defaultProps: {
    action: '',
    method: 'POST',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 8 } },
  canHaveChildren: true,
  allowedChildren: ['input', 'button', 'text', 'heading', 'container'],
}

// ============================================================
// PAYLOAD
// ============================================================

type Named = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const NOT_SUBMITTED = new Set(['submit', 'reset', 'button', 'image'])

/** A checkbox answering yes/no: no explicit value (the UA's "on"), "true", or declared boolean. */
function isBooleanCheckbox(el: HTMLInputElement): boolean {
  if (el.dataset.pwValueType === 'boolean') return true
  const v = el.value
  return v === 'on' || v === 'true'
}

/** "true"/"false"/"on" as booleans; every other value unchanged. */
function booleanize(v: unknown): unknown {
  if (v === 'true' || v === 'on') return true
  if (v === 'false') return false
  return v
}

/**
 * THE FORM PAYLOAD, BUILT FROM THE FORM'S OWN ELEMENTS.
 *
 * `Object.fromEntries(new FormData(form))` kept one value per name and dropped
 * whatever FormData leaves out. Three classes of field broke on it:
 *
 *   - a name carried by several controls (a checkbox group, a multi-select, a
 *     repeated hidden field) kept only its LAST value;
 *   - an unchecked checkbox sent nothing at all, so a required boolean always
 *     failed validation on the server;
 *   - a radio group with nothing picked vanished from the record.
 *
 * Now every NAMED, enabled control is accounted for:
 *
 *   single checkbox          → true / false (its value when it carries a real one)
 *   hidden + one checkbox    → the checkbox's answer, else the hidden fallback
 *   checkbox group           → array of the checked values ([] when none)
 *   select multiple          → array of the selected values
 *   radio group              → the picked value, "" when none
 *   hidden, marked boolean   → true / false ("" when nothing is chosen)
 *   file                     → File (File[] when `multiple`)
 *   anything else            → its value; several controls → array
 *
 * Numbers stay strings — the backend coerces by field type. Disabled
 * controls and buttons are left out, which is the HTML contract, not a drop.
 */
export function collectFormValues(form: HTMLFormElement): Record<string, unknown> {
  const groups = new Map<string, Named[]>()
  for (const node of Array.from(form.elements)) {
    const el = node as Named
    const name = (el as { name?: unknown }).name
    if (typeof name !== 'string' || name === '') continue
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue
    if (el.disabled) continue
    if (el instanceof HTMLInputElement && NOT_SUBMITTED.has(el.type)) continue
    const list = groups.get(name)
    if (list) list.push(el)
    else groups.set(name, [el])
  }

  const values: Record<string, unknown> = {}
  for (const [name, els] of groups) {
    const inputs = els.filter((e): e is HTMLInputElement => e instanceof HTMLInputElement)
    const checkboxes = inputs.filter((e) => e.type === 'checkbox')
    const radios = inputs.filter((e) => e.type === 'radio')
    const multiple = els.some((e) => (e instanceof HTMLSelectElement && e.multiple) || (e as HTMLElement).dataset?.pwMultiple === 'true')

    // One checkbox: a yes/no question.
    if (els.length === 1 && checkboxes.length === 1) {
      const cb = checkboxes[0]!
      values[name] = isBooleanCheckbox(cb) ? cb.checked : cb.checked ? cb.value : false
      continue
    }
    // The hidden-fallback idiom: <input type=hidden value=false> + one checkbox.
    if (checkboxes.length === 1 && !multiple && els.every((e) => e === checkboxes[0] || (e instanceof HTMLInputElement && e.type === 'hidden'))) {
      const cb = checkboxes[0]!
      const hidden = els.find((e) => e !== cb) as HTMLInputElement | undefined
      values[name] = cb.checked ? booleanize(cb.value) : booleanize(hidden?.value ?? false)
      continue
    }
    // A control in boolean mode (segmented-control with true/false options)
    // carries its answer in one hidden input marked boolean: "true"/"false"
    // arrive as booleans, "" (nothing chosen) stays "".
    const only = els.length === 1 ? els[0] : undefined
    if (only instanceof HTMLInputElement && only.type === 'hidden' && only.dataset.pwValueType === 'boolean') {
      values[name] = booleanize(only.value)
      continue
    }
    // A radio group: one answer or none.
    if (radios.length === els.length) {
      values[name] = radios.find((r) => r.checked)?.value ?? ''
      continue
    }

    const parts: unknown[] = []
    for (const el of els) {
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        if (el.checked) parts.push(el.value)
      } else if (el instanceof HTMLSelectElement && el.multiple) {
        for (const o of Array.from(el.selectedOptions)) parts.push(o.value)
      } else if (el instanceof HTMLInputElement && el.type === 'file') {
        const files = Array.from(el.files ?? [])
        if (el.multiple) parts.push(...files)
        else if (files[0]) parts.push(files[0])
      } else {
        parts.push(el.value)
      }
    }
    if (multiple || checkboxes.length > 1) values[name] = parts
    else values[name] = parts.length === 1 ? parts[0] : parts.length === 0 ? '' : parts
  }
  return values
}

// ============================================================
// VALIDATION
// ============================================================

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/** Hidden by an ancestor inside the form — a wizard step off screen. */
function isHiddenInForm(el: Element, form: HTMLFormElement): boolean {
  for (let node: Element | null = el; node && node !== form; node = node.parentElement) {
    if ((node as HTMLElement).hidden) return true
    if (node.ownerDocument.defaultView?.getComputedStyle(node).display === 'none') return true
  }
  return false
}

/** The words a visitor knows the field by: its label, else its name. */
function fieldLabel(el: Field): string {
  const clean = (t: string | null | undefined): string => (t ?? '').replace(/\s*\*\s*$/, '').trim()
  const own = clean(el.labels?.[0]?.textContent)
  if (own) return own
  const aria = clean(el.getAttribute('aria-label'))
  if (aria) return aria
  const blockLabel = clean(el.closest('[data-block-id]')?.querySelector('label')?.textContent)
  if (blockLabel) return blockLabel
  return clean((el as HTMLInputElement).placeholder) || el.name
}

/**
 * The fields the browser would refuse, split by whether the visitor can see
 * them. `willValidate` excludes hidden inputs, disabled fields and buttons.
 */
function invalidFields(form: HTMLFormElement): { visible: Field[]; hidden: Field[] } {
  const visible: Field[] = []
  const hidden: Field[] = []
  for (const el of Array.from(form.elements)) {
    const field = el as Field
    if (!('willValidate' in field) || !field.willValidate || field.validity.valid) continue
    ;(isHiddenInForm(field, form) ? hidden : visible).push(field)
  }
  return { visible, hidden }
}

// ============================================================
// COMPONENT
// ============================================================

export const FormBlock: BlockComponent = ({ props, children, block }) => {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  // Truthy-tolerant: the {{state.x}} binding resolves to a real boolean, but
  // interpolated contexts can yield the string "true".
  const submitting = props.submittingWhen === true || props.submittingWhen === 'true'
  const submitHidden = props.showSubmit === false || props.showSubmit === 'false' || props.showSubmit === '' || props.showSubmit === 0
  // Synchronous re-entry lock: the submitting PROP only updates after React
  // re-renders, so several same-tick submits (rapid double-click, double
  // Enter) all pass a prop-only guard. Worse, presence of the binding can't
  // gate this — an unresolved `"{{state.scLoading}}"` resolves to undefined
  // (identical to no binding at all) until the bridge first writes the key.
  // So the ref lock ALWAYS engages on submit and releases by whichever signal
  // arrives: the bound loading state completing its true→false round-trip,
  // a short 600ms window if no loading signal ever shows up (form without a
  // bridge — keeps mock forms re-submittable), or the 8s backstop (so a
  // stuck binding can't brick the form).
  // Fields the browser refused but the visitor cannot see (see below).
  const [missing, setMissing] = React.useState<readonly string[]>([])
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const resetSignal = props.resetWhen === true || props.resetWhen === 'true'
  const lastResetRef = React.useRef(resetSignal)
  React.useEffect(() => {
    if (resetSignal && !lastResetRef.current) {
      // Native reset: every field returns to its default, and controls that
      // keep their own state (segmented-control) listen for the 'reset' event.
      formRef.current?.reset()
      setMissing([])
    }
    lastResetRef.current = resetSignal
  }, [resetSignal])
  const inFlightRef = React.useRef(false)
  const sawLoadingRef = React.useRef(false)
  React.useEffect(() => {
    if (submitting) {
      sawLoadingRef.current = true
    } else if (sawLoadingRef.current) {
      inFlightRef.current = false
      sawLoadingRef.current = false
    }
  }, [submitting])

  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: cssUnit(props.gap as CSSUnit) ?? '16px',
  }
  const submitLabel = typeof props.submitLabel === 'string' ? props.submitLabel.trim() : ''
  const resetLabel = typeof props.resetLabel === 'string' ? props.resetLabel.trim() : ''
  const submitStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: 'var(--pw-color-primary)',
    color: 'var(--pw-color-text-on-primary)',
    border: 'none',
    borderRadius: 'var(--pw-button-radius, var(--pw-border-radius))',
    cursor: submitting ? 'wait' : 'pointer',
    opacity: submitting ? 0.65 : undefined,
    fontWeight: 500,
    fontFamily: 'inherit',
    fontSize: 'inherit',
  }
  const resetStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: 'var(--pw-color-text-muted)',
    // `--pw-border` is not a defined appearance token, so the reset button
    // rendered with no visible outline. Use the explicit border-color token.
    border: '1px solid var(--pw-color-border)',
    borderRadius: 'var(--pw-button-radius, var(--pw-border-radius))',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (submitting || inFlightRef.current) return
    // The form validates itself (`noValidate`). Since pwfabric 4.10 a wizard
    // step hidden by visibleWhen stays mounted with display:none so its values
    // are submitted — and the browser's own validation then refused a required
    // field there that it could not focus: no message, the submit did nothing.
    // A visible field still gets the browser's own bubble;
    // a hidden one is named in an alert next to the submit button.
    const { visible, hidden } = invalidFields(e.currentTarget)
    if (visible.length > 0) {
      setMissing([])
      visible[0]?.reportValidity()
      return
    }
    if (hidden.length > 0) {
      setMissing(hidden.map((f) => `${fieldLabel(f)}: ${f.validationMessage}`))
      return
    }
    setMissing([])
    inFlightRef.current = true
    window.setTimeout(() => {
      if (!sawLoadingRef.current) inFlightRef.current = false
    }, 600)
    window.setTimeout(() => {
      inFlightRef.current = false
      sawLoadingRef.current = false
    }, 8000)
    // Collect the form's field values (by input `name`) so the platform/entities
    // bridge can persist them — it reads `descriptor.payload.values`. Without this
    // the bridge received `{}` and the entity write was empty (and failed required
    // fields), so submissions silently produced no record.
    // The payload is built from the form's elements, not from FormData — see
    // collectFormValues for what FormData lost.
    const values = collectFormValues(e.currentTarget)
    // Emit a structured form event via SurfaceEventBus.
    // payload matches SURFACE_EVENT_PAYLOAD_SCHEMAS['form:submit'] ({values, formId, timestamp}).
    emit({
      type: SURFACE_EVENTS.FORM_SUBMIT,
      surfaceId,
      blockId: block.id,
      payload: {
        values,
        formId: block.id,
        timestamp: Date.now(),
        // Declarative submit→state action (optional) — the renderer dispatches it.
        ...(props.onSubmitAction !== undefined ? { action: props.onSubmitAction } : {}),
      },
    })
  }

  return (
    <form
      ref={formRef}
      id={block.id}
      data-block-id={block.id}
      action={props.action as string}
      method={(props.method as string) ?? 'POST'}
      style={{ ...style, ...block.style }}
      onSubmit={handleSubmit}
      noValidate
      data-block-type="form"
    >
      {children}
      {missing.length > 0 ? (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            border: '1px solid var(--pw-color-error)',
            borderRadius: 'var(--pw-border-radius)',
            color: 'var(--pw-color-error)',
            fontSize: 'var(--pw-font-size-sm)',
          }}
        >
          {missing.length === 1 ? (
            missing[0]
          ) : (
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {submitHidden ? null : (
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        {submitLabel === '' ? (
          // No label written: the browser's own submit button, labelled in the
          // visitor's language ("Submit", "Senden", "Envoyer").
          <input type="submit" disabled={submitting} aria-busy={submitting || undefined} style={submitStyle} />
        ) : (
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          style={submitStyle}
        >
          {submitting && (
            <>
              <style>{'@keyframes pw-form-submit-spin{to{transform:rotate(360deg)}}'}</style>
              <span
                aria-hidden="true"
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: '2px solid color-mix(in srgb, currentColor 35%, transparent)',
                  borderTopColor: 'currentColor',
                  animation: 'pw-form-submit-spin 0.8s linear infinite',
                }}
              />
            </>
          )}
          {submitLabel}
        </button>
        )}
        {props.showReset === true &&
          (resetLabel === '' ? (
            // Same as submit: unset → the browser's own, localised reset button.
            <input type="reset" style={resetStyle} />
          ) : (
            <button type="reset" style={resetStyle}>
              {resetLabel}
            </button>
          ))}
      </div>
      )}
    </form>
  )
}
