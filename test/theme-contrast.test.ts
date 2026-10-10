/**
 * Contrast of the selected states and the destructive ink, in every preset,
 * light and the derived dark.
 *
 * The styles measured are the ones the blocks export and render
 * (BADGE_VARIANT_STYLES, SEGMENT_SELECTED / SEGMENT_IDLE, DESTRUCTIVE_INK),
 * resolved against the tokens the cascade emits for each preset:
 *   - the selected shape clears 3:1 against the ground and against an
 *     unselected neighbour (fill or edge, whichever is stronger);
 *   - the selected label clears 4.5:1 on its fill;
 *   - the destructive label clears 4.5:1 on the error fill.
 */
import { describe, it, expect } from 'vitest'
import { BADGE_VARIANT_STYLES } from '../atoms/blocks/control/badge/component.js'
import { SEGMENT_SELECTED, SEGMENT_IDLE } from '../atoms/blocks/form/segmented-control/component.js'
import { DESTRUCTIVE_INK } from '../atoms/blocks/control/button/component.js'
import { contrast, edgeColor, evalColor, paint, presetTokenSets, resolveVars } from './_contrast.js'

const sets = presetTokenSets()
const r2 = (n: number): number => Math.round(n * 100) / 100

interface Row {
  cell: string
  badgeLabel: number
  badgeFill: number
  badgeEdge: number
  badgeSelVsUnsel: number
  segLabel: number
  segFill: number
  segEdge: number
  segSelVsUnsel: number
  segIdleLabel: number
  destructive: number
}

function measure(): Row[] {
  return sets.map(({ preset, mode, vars }) => {
    const card = evalColor(resolveVars('var(--pw-color-card)', vars))
    const bg = evalColor(resolveVars('var(--pw-color-background)', vars))

    // Badge: measured on the card AND on the page ground; the worse one counts.
    const badge = (ground: typeof card) => {
      const p = BADGE_VARIANT_STYLES.primary!
      const d = BADGE_VARIANT_STYLES.default!
      const fill = paint(String(p.backgroundColor), vars, ground)
      const label = paint(String(p.color), vars, fill)
      const edge = paint(edgeColor(String(p.boxShadow)), vars, ground)
      const idleFill = paint(String(d.backgroundColor), vars, ground)
      return {
        label: contrast(label, fill),
        fill: contrast(fill, ground),
        edge: contrast(edge, ground),
        selVsUnsel: Math.max(contrast(fill, idleFill), contrast(edge, idleFill)),
      }
    }
    const onCard = badge(card)
    const onPage = badge(bg)

    // Segmented: the track is painted in the page background.
    const track = bg
    const sFill = paint(String(SEGMENT_SELECTED.background), vars, track)
    const sLabel = paint(String(SEGMENT_SELECTED.color), vars, sFill)
    const sEdge = paint(edgeColor(String(SEGMENT_SELECTED.boxShadow)), vars, track)
    const iFill = paint(String(SEGMENT_IDLE.background), vars, track)
    const iLabel = paint(String(SEGMENT_IDLE.color), vars, iFill)

    const errFill = paint('var(--pw-color-error)', vars, card)
    const errInk = paint(DESTRUCTIVE_INK, vars, errFill)

    return {
      cell: `${preset}/${mode}`,
      badgeLabel: r2(Math.min(onCard.label, onPage.label)),
      badgeFill: r2(Math.min(onCard.fill, onPage.fill)),
      badgeEdge: r2(Math.min(onCard.edge, onPage.edge)),
      badgeSelVsUnsel: r2(Math.min(onCard.selVsUnsel, onPage.selVsUnsel)),
      segLabel: r2(contrast(sLabel, sFill)),
      segFill: r2(contrast(sFill, track)),
      segEdge: r2(contrast(sEdge, track)),
      segSelVsUnsel: r2(Math.max(contrast(sFill, iFill), contrast(sEdge, iFill))),
      segIdleLabel: r2(contrast(iLabel, track)),
      destructive: r2(contrast(errInk, errFill)),
    }
  })
}

const rows = measure()

describe('contrast in every preset × light / derived dark', () => {
  it('prints the table', () => {
    // eslint-disable-next-line no-console
    console.table(rows)
    expect(rows).toHaveLength(4) // two presets × light / derived dark
  })

  it.each(rows)('$cell · badge: the selected (primary) badge is seen', (row) => {
    expect(row.badgeLabel).toBeGreaterThanOrEqual(4.5)
    expect(row.badgeEdge).toBeGreaterThanOrEqual(3)
    expect(row.badgeSelVsUnsel).toBeGreaterThanOrEqual(3)
  })

  it.each(rows)('$cell · segmented: the selected pill is seen and read', (row) => {
    expect(row.segLabel).toBeGreaterThanOrEqual(4.5)
    expect(row.segEdge).toBeGreaterThanOrEqual(3)
    expect(row.segSelVsUnsel).toBeGreaterThanOrEqual(3)
  })

  it.each(rows)('$cell · destructive: the label reads on the error fill', (row) => {
    expect(row.destructive).toBeGreaterThanOrEqual(4.5)
  })
})
