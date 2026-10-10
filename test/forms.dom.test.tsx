/**
 * The form family in a browser, built from a generated multi-step invitation
 * RSVP form:
 *
 *   form{showSubmit:"{{state.step == 3}}"}
 *     section step-1  input fullName (required), input email (required)
 *     section step-2  segmented-control attending {value:"true", yes/no, stateKey}
 *                     input partySize (required), select menuChoice
 *                     (required), input note (required although the
 *                     brief calls it optional)
 *     section step-3  summary + submit
 *
 * A hidden step inside a form stays mounted with
 * `display: none` on its block wrapper. The wrappers below are exactly that.
 *
 * Defects covered:
 * - the segmented control has no native input and the form gathers
 *   `new FormData(form)`, so the yes/no answer was never saved;
 * - a required field in a hidden step blocks the browser's native
 *   validation silently: it cannot be focused, nothing is shown, submit
 *   does nothing;
 * - `\n` in text content collapsed into one paragraph;
 * - textarea could not write page state.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as React from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { BehaviorSurfaceProvider } from '@pwfabric/runtime'
import { FormBlock } from '../atoms/blocks/form/form/component.js'
import { SegmentedControlBlock } from '../atoms/blocks/form/segmented-control/component.js'
import { InputBlock } from '../atoms/blocks/form/input/component.js'
import { SelectBlock } from '../atoms/blocks/form/select/component.js'
import { TextareaBlock } from '../atoms/blocks/form/textarea/component.js'
import { TextBlock } from '../atoms/blocks/text/text/component.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

type Ev = { type: string; blockId?: string; payload?: Record<string, unknown> }
type AnyBlock = React.FC<Record<string, unknown>>

/** Render a block component the way the runtime does: props + its block. */
function el(C: unknown, id: string, type: string, props: Record<string, unknown>, children?: React.ReactNode) {
  const Comp = C as AnyBlock
  return (
    <Comp key={id} props={props} block={{ id, type, props, layout: {} }}>
      {children}
    </Comp>
  )
}

/** The runtime's block wrapper; `hidden` is what 4.10 renders for a hidden in-form step. */
const wrap = (id: string, hidden: boolean, children: React.ReactNode) => (
  <div key={id} data-block-wrapper={id} style={hidden ? { display: 'none' } : {}}>
    {children}
  </div>
)

function mount(tree: React.ReactNode): Ev[] {
  const events: Ev[] = []
  render(
    <BehaviorSurfaceProvider surfaceId="davetiye" onEvent={(e) => events.push(e as Ev)}>
      {tree}
    </BehaviorSurfaceProvider>
  )
  return events
}

const submits = (events: Ev[]) => events.filter((e) => e.type === 'form:submit')
const clickSubmit = async (label = 'Confirm my place') => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }))
  })
}

const attending = {
  name: 'attending',
  size: 'md',
  label: 'Are you coming?',
  value: 'true',
  options: [
    { label: 'Yes', value: 'true' },
    { label: 'No', value: '' },
  ],
  stateKey: 'attending',
}

/** The generated RSVP form, standing on step 3 (steps 1 and 2 hidden, still mounted). */
function rsvp(opts: { step: 1 | 2 | 3; notRequired?: boolean }) {
  const { step } = opts
  return el(FormBlock, 'rsvp-form', 'form', { gap: 20, action: '', method: 'POST', submitLabel: 'Confirm my place' }, [
    wrap('step-1', step !== 1, [
      el(InputBlock, 'field-name', 'input', { name: 'fullName', type: 'text', label: 'Full name', required: true, stateKey: 'fullName' }),
      el(InputBlock, 'field-email', 'input', { name: 'email', type: 'email', label: 'Email', required: true, stateKey: 'email' }),
    ]),
    wrap('step-2', step !== 2, [
      el(SegmentedControlBlock, 'field-attending', 'segmented-control', attending),
      el(InputBlock, 'field-party-size', 'input', { min: 1, name: 'partySize', type: 'number', label: 'How many people?', required: true, stateKey: 'partySize' }),
      el(SelectBlock, 'field-menu', 'select', {
        name: 'menuChoice',
        label: 'Menu choice',
        required: true,
        stateKey: 'menuChoice',
        placeholder: 'Pick one',
        options: [
          { label: 'Meat', value: 'meat' },
          { label: 'Vegan', value: 'vegan' },
        ],
      }),
      el(InputBlock, 'field-note', 'input', { name: 'note', type: 'text', label: 'Note', required: opts.notRequired !== false, stateKey: 'note' }),
    ]),
    wrap('step-3', step !== 3, [el(TextBlock, 'summary', 'text', { content: 'Summary' })]),
  ])
}

const fill = (id: string, value: string) => fireEvent.change(document.getElementById(id) as HTMLElement, { target: { value } })
const fillAll = (exceptNot = false) => {
  fill('field-name', 'Ada Lovelace')
  fill('field-email', 'ada@example.com')
  fill('field-party-size', '2')
  fireEvent.change(document.getElementById('field-menu-select') as HTMLElement, { target: { value: 'vegan' } })
  if (!exceptNot) fill('field-note', 'We are coming')
}

describe('a segmented control inside a form is submitted', () => {
  it('sends the shown answer when the visitor never touched it', async () => {
    const events = mount(rsvp({ step: 3 }))
    fillAll()
    await clickSubmit()
    expect(submits(events)).toHaveLength(1)
    expect(submits(events)[0]?.payload?.values).toMatchObject({ attending: 'true', fullName: 'Ada Lovelace', note: 'We are coming' })
  })

  it('sends the answer the visitor picked', async () => {
    const events = mount(rsvp({ step: 3 }))
    fillAll()
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'No', hidden: true }))
    })
    await clickSubmit()
    expect(submits(events)[0]?.payload?.values).toMatchObject({ attending: '' })
  })

  it('an unnamed segmented control adds no field', () => {
    mount(<form>{el(SegmentedControlBlock, 'gorunum', 'segmented-control', { value: 'day' })}</form>)
    expect(document.querySelectorAll('input').length).toBe(0)
  })
})

describe('a required field in a hidden step does not block the submit silently', () => {
  it('tells the visitor which hidden field is missing, instead of doing nothing', async () => {
    const events = mount(rsvp({ step: 3 }))
    fillAll(true) // the optional note, made required by the model, left empty
    await clickSubmit()
    expect(submits(events)).toHaveLength(0)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Not')
    expect(alert.textContent).not.toContain('Full name')
  })

  it('submits once the hidden field has a value, and clears the message', async () => {
    const events = mount(rsvp({ step: 3 }))
    fillAll(true)
    await clickSubmit()
    expect(screen.queryByRole('alert')).not.toBeNull()
    fill('field-note', 'We are coming')
    await clickSubmit()
    expect(submits(events)).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a missing VISIBLE field keeps the native bubble on that field', async () => {
    const report = vi.spyOn(HTMLInputElement.prototype, 'reportValidity')
    const events = mount(rsvp({ step: 2 }))
    fillAll(true)
    await clickSubmit()
    expect(submits(events)).toHaveLength(0)
    expect(report).toHaveBeenCalled()
    expect(report.mock.contexts[0]).toBe(document.getElementById('field-note'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('an optional field in a hidden step is no obstacle', async () => {
    const events = mount(rsvp({ step: 3, notRequired: false }))
    fillAll(true)
    await clickSubmit()
    expect(submits(events)).toHaveLength(1)
  })
})

describe('text keeps its line breaks', () => {
  it('renders `\\n` as a line break', () => {
    mount(el(TextBlock, 'summary', 'text', { content: 'Name: Ada\nGuests: 2' }))
    expect((document.getElementById('summary') as HTMLElement).style.whiteSpace).toBe('pre-line')
  })
})

describe('textarea writes page state', () => {
  const actionOf = (events: Ev[]) =>
    events.filter((e) => e.type === 'input:change').map((e) => e.payload?.action)

  it('textarea', async () => {
    const events = mount(el(TextareaBlock, 'note', 'textarea', { name: 'note', stateKey: 'note' }))
    fireEvent.change(document.querySelector('textarea') as HTMLElement, { target: { value: 'We are coming\nTwo of us' } })
    expect(actionOf(events)).toContainEqual({ type: 'setState', key: 'note', value: 'We are coming\nTwo of us' })
  })

  it('without a stateKey nothing is written', async () => {
    const events = mount(el(TextareaBlock, 'note', 'textarea', { name: 'note' }))
    fireEvent.change(document.querySelector('textarea') as HTMLElement, { target: { value: 'x' } })
    expect(actionOf(events).filter(Boolean)).toEqual([])
  })
})
