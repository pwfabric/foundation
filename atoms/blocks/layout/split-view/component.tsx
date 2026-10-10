import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { safeRenderValue } from '../../../lib/_shared-utils.js'
import { useShellSelection } from '../../../lib/hooks.js'

// ============================================================
// SCHEMA
// ============================================================

/**
 * The SPLIT body: a list that chooses and a detail that answers.
 *
 * The whole arrangement rests on one fact — which item is selected — and that
 * fact does not belong to this block. It lives in the runtime's shell selection
 * and is projected onto the URL (`?<selectionKey>=<itemId>`), so the third
 * message in a thread can be linked to, Back returns to the second, and any
 * other block on the surface can read the same key.
 *
 * TWO DETAIL MODES, and the difference is not decorative:
 *
 *   `document` — the detail is read top-down. It scrolls from the top, it may
 *                carry a footer, and children render after the body.
 *   `stream`   — the detail is a conversation. The newest entry is at the
 *                BOTTOM, so it opens scrolled to the bottom, the composer is
 *                the LAST child of the detail pane, and a page footer is a
 *                contradiction: nothing sits below "type here".
 */
const splitItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  meta: z.string().optional(),
  excerpt: z.string().optional(),
  /** Read top-down in `document` mode. */
  body: z.string().optional(),
  /** Rendered bottom-anchored in `stream` mode. */
  entries: z
    .array(z.object({ from: z.string().optional(), text: z.string(), at: z.string().optional() }))
    .optional(),
})

/**
 * WHICH FIELD IS WHICH. The list read only `id / title / meta / excerpt
 * / body`, so a list bound to real records (`headline`, `content`) drew empty
 * rows and an empty body, and a composer that saw it
 * avoided the block. The `*Key` props name the record's own fields — a
 * dotted path reaches a nested one ("data.title") — like select's
 * labelKey/valueKey. Unset keys keep the old names, then a few common ones.
 */
const fieldKeys = {
  idKey: z.string().optional(),
  titleKey: z.string().optional(),
  metaKey: z.string().optional(),
  excerptKey: z.string().optional(),
  bodyKey: z.string().optional(),
  entriesKey: z.string().optional(),
}

export const split_viewPropsSchema = z.object({
  /** Items in the split shape, or any records read through the `*Key` props. */
  items: z.array(z.union([splitItemSchema, z.record(z.string(), z.unknown())])).default([]),
  ...fieldKeys,
  /**
   * Select the first item when nothing is selected. Unset: on, unless an
   * `emptyLabel` is given — a "pick one on the left" prompt only makes sense
   * when nothing is picked, and it could never show.
   */
  autoSelect: z.boolean().optional(),
  detailMode: z.enum(['document', 'stream']).default('document'),
  listTitle: z.string().optional(),
  listWidth: z.number().default(320),
  /** URL query parameter carrying the selection. */
  selectionKey: z.string().default('sec'),
  /** Shown in the detail pane while nothing is selected. No default: English filler reached visitors. */
  emptyLabel: z.string().optional(),
  /**
   * Height of the two panes SIDE BY SIDE; each scrolls inside it. When the
   * block is too narrow for two panes they stack and take the height of their
   * content — this value is then not applied.
   */
  height: z.string().default('72vh'),
})

export type SplitViewProps = z.infer<typeof split_viewPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const split_viewDefinition: BlockDefinition = {
  type: 'split-view',
  name: 'SplitView',
  category: 'layout',
  icon: '◫',
  schema: split_viewPropsSchema,
  defaultProps: {
    items: [],
    detailMode: 'document',
    listWidth: 320,
    selectionKey: 'sec',
    height: '72vh',
  },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: true,
}

// ============================================================
// COMPONENT
// ============================================================

type SplitItem = z.infer<typeof splitItemSchema>

/** A field by name, or by a dotted path into nested objects ("data.title"). */
function pick(rec: Record<string, unknown>, key: string): unknown {
  if (key in rec) return rec[key]
  let cur: unknown = rec
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

const asText = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined

/** The first field that has a value: the named key, then the default names. */
function field(rec: Record<string, unknown>, key: unknown, fallbacks: readonly string[]): unknown {
  const keys = typeof key === 'string' && key ? [key] : fallbacks
  for (const k of keys) {
    const v = pick(rec, k)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/** Records in any shape → the split shape, through the `*Key` props. */
export function toSplitItems(raw: unknown, props: Record<string, unknown>): SplitItem[] {
  if (!Array.isArray(raw)) return []
  const out: SplitItem[] = []
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return
    const rec = r as Record<string, unknown>
    const id = asText(field(rec, props.idKey, ['id', '_id', 'slug', 'key'])) ?? String(i)
    const title = asText(field(rec, props.titleKey, ['title', 'name', 'label', 'baslik', 'ad'])) ?? ''
    const meta = asText(field(rec, props.metaKey, ['meta', 'subtitle']))
    const excerpt = asText(field(rec, props.excerptKey, ['excerpt', 'summary', 'description']))
    const body = asText(field(rec, props.bodyKey, ['body', 'content', 'text', 'icerik']))
    const rawEntries = field(rec, props.entriesKey, ['entries', 'messages'])
    const entries = Array.isArray(rawEntries)
      ? rawEntries
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
          .map((e) => ({
            from: asText(e.from ?? e.author ?? e.name),
            text: asText(e.text ?? e.body ?? e.content) ?? '',
            at: asText(e.at ?? e.createdAt ?? e.time),
          }))
      : undefined
    out.push({ id, title, meta, excerpt, body, entries })
  })
  return out
}

export const SplitViewBlock: BlockComponent = ({ props, children, block, context }) => {
  const items = toSplitItems(props.items, props as Record<string, unknown>)
  const emptyLabel = safeRenderValue(props.emptyLabel)
  const autoSelect = typeof props.autoSelect === 'boolean' ? props.autoSelect : !emptyLabel
  const detailMode = (props.detailMode as string) === 'stream' ? 'stream' : 'document'
  const listWidth = typeof props.listWidth === 'number' ? props.listWidth : 320
  const selectionKey = (props.selectionKey as string) || 'sec'
  const height = (props.height as string) || '72vh'
  const inert = context?.interactionMode === 'inert'

  // An inert host (editor/preview canvas) selects in memory only — the same
  // rule every other side-effecting block follows.
  const [selectedId, select] = useShellSelection(selectionKey, {
    ...(autoSelect ? { fallback: items[0]?.id } : {}),
    syncUrl: !inert,
  })
  // An id that matches no row (a stale link) falls back to the first row only
  // when auto-selection is on; otherwise the detail waits for a pick.
  const selected = items.find((i) => i.id === selectedId) ?? (autoSelect ? items[0] : undefined)

  /**
   * NARROW MEANS STACKED — and what is narrow is THIS BLOCK'S BOX, not the screen.
   *
   * Two panels side by side need the list width plus a readable detail
   * (280px: a detail title and one line of text without squeezing). Below that
   * the panels STACK: the list on top, the detail under it, the action area
   * (children) last, and the page scrolls them like any other band.
   *
   * The trigger is the box, not the viewport: this block may sit in a shell's
   * main slot, in a card or in a 360px column of a 1536px screen. A breakpoint
   * cannot see that; `ResizeObserver` can.
   *
   * WHY NOT "LIST PAGE, THEN DETAIL PAGE" (the earlier behaviour). The narrow
   * form used to show ONLY the list and reveal the detail after a tap. At
   * 390px with an empty list nothing could be
   * tapped, so the detail and the whole action area — the "add" button, the
   * app itself — were unreachable; the visitor saw an empty sidebar. Stacked,
   * every part is on the page whatever the list holds.
   */
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const detailRef = React.useRef<HTMLDivElement | null>(null)
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const node = rootRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const fits = (w: number): boolean => w >= listWidth + 280
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(!fits(entry.contentRect.width))
    })
    ro.observe(node)
    setNarrow(!fits(node.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [listWidth])

  const streamRef = React.useRef<HTMLDivElement | null>(null)
  // Bottom lock. A conversation that opens at the top shows the OLDEST message
  // first, which is the wrong end of every thread. Re-runs on selection change
  // because switching threads is the same event as opening one.
  React.useEffect(() => {
    if (detailMode !== 'stream') return
    const node = streamRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [detailMode, selected?.id, narrow])

  const choose = (id: string): void => {
    select(id)
    // Stacked, the detail is below the list: bring it into view, as the old
    // narrow form did by switching to it. A live page only — an inert canvas
    // must not scroll the editor.
    if (narrow && !inert) detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  const border = '1px solid var(--pw-color-border, #e4e4e7)'

  const rootStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: narrow ? 'column' : 'row',
    alignItems: 'stretch',
    // Side by side the panes share one fixed height and scroll inside it.
    // Stacked they take the height of what they hold and the PAGE scrolls — a
    // fixed box on a phone is a window onto a fraction of the app.
    height: narrow ? 'auto' : height,
    minHeight: 0,
    width: '100%',
    boxSizing: 'border-box',
    border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'var(--pw-color-card, #ffffff)',
    ...block.style,
    ...(narrow ? { height: 'auto' } : {}),
  }

  const listStyle: React.CSSProperties = narrow
    ? {
        flex: '0 0 auto',
        width: '100%',
        boxSizing: 'border-box',
        borderBottom: border,
        // A long list must not push the detail a screen away: it scrolls
        // inside a band of at most ~half the screen.
        maxHeight: '45vh',
        overflowY: 'auto',
        padding: 8,
      }
    : {
        flex: `0 0 ${listWidth}px`,
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        borderRight: border,
        overflowY: 'auto',
        padding: 8,
      }

  /**
   * THE DETAIL SCROLLS AS ONE, in `document` mode. Otherwise the body scrolls on its own and the children sit
   * below it with `flex-shrink: 0` in an `overflow: hidden` root — 2713px of
   * content in a 619px box, everything past the first screen unreachable. A
   * document is read top-down, header, body and action area together, so the
   * pane itself is the scroller. `stream` keeps its own contract: the thread
   * scrolls, the composer stays pinned at the bottom.
   */
  const detailStyle: React.CSSProperties = {
    flex: narrow ? '0 0 auto' : '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    ...(!narrow && detailMode === 'document' ? { overflowY: 'auto' } : {}),
  }

  const bodyScrolls = detailMode === 'stream'
  const bodyStyle: React.CSSProperties = {
    flex: narrow || !bodyScrolls ? '0 0 auto' : '1 1 auto',
    minHeight: 0,
    ...(bodyScrolls ? { overflowY: 'auto', ...(narrow ? { maxHeight: '60vh' } : {}) } : {}),
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    // A stream fills from the bottom: with few entries they sit at the bottom
    // edge where the newest one belongs, instead of floating at the top of an
    // empty pane.
    ...(detailMode === 'stream' ? { justifyContent: 'flex-end' } : {}),
  }

  // Stacked, an empty list is not drawn at all: an empty band with a title is
  // exactly the "empty sidebar" the visitor saw instead of the app.
  const showList = !narrow || items.length > 0

  return (
    <div
      ref={rootRef}
      id={block.id}
      data-block-id={block.id}
      data-block-type="split-view"
      data-pw-split={narrow ? 'stack' : 'both'}
      style={rootStyle}
    >
      {showList ? (
        <div
          style={listStyle}
          role="listbox"
          aria-label={safeRenderValue(props.listTitle, 'Records')}
        >
          {props.listTitle ? (
            <h3
              style={{
                margin: '4px 8px 8px',
                fontSize: 'var(--pw-font-size-sm, 14px)',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                color: 'var(--pw-color-text-muted, #71717a)',
              }}
            >
              {safeRenderValue(props.listTitle)}
            </h3>
          ) : null}
          {items.map((item) => {
            const active = selected?.id === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(item.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 6,
                  padding: '10px 12px',
                  marginBottom: 2,
                  backgroundColor: active ? 'var(--pw-color-surface-muted, #f4f4f5)' : 'transparent',
                  color: 'var(--pw-color-text, #09090b)',
                  borderLeft: active
                    ? '3px solid var(--pw-color-primary, #18181b)'
                    : '3px solid transparent',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontWeight: active ? 600 : 500,
                    fontSize: 'var(--pw-font-size-sm, 14px)',
                  }}
                >
                  {safeRenderValue(item.title)}
                </span>
                {item.meta ? (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--pw-font-size-xs, 12px)',
                      color: 'var(--pw-color-text-muted, #71717a)',
                    }}
                  >
                    {safeRenderValue(item.meta)}
                  </span>
                ) : null}
                {item.excerpt ? (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 'var(--pw-font-size-xs, 12px)',
                      color: 'var(--pw-color-text-muted, #71717a)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {safeRenderValue(item.excerpt)}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <div ref={detailRef} style={detailStyle} data-pw-split-detail="">
        {selected ? (
          <>
            <header
              style={{
                padding: '14px 20px',
                borderBottom: border,
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 'var(--pw-font-size-lg, 18px)', fontWeight: 700 }}>
                {safeRenderValue(selected.title)}
              </h2>
              {selected.meta ? (
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 'var(--pw-font-size-xs, 12px)',
                    color: 'var(--pw-color-text-muted, #71717a)',
                  }}
                >
                  {safeRenderValue(selected.meta)}
                </p>
              ) : null}
            </header>
            <div ref={streamRef} style={bodyStyle}>
              {detailMode === 'stream' && selected.entries?.length ? (
                selected.entries.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: 'flex-start',
                      maxWidth: '78%',
                      backgroundColor: 'var(--pw-color-surface-muted, #f4f4f5)',
                      borderRadius: 10,
                      padding: '8px 12px',
                    }}
                  >
                    {entry.from ? (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--pw-font-size-xs, 12px)',
                          fontWeight: 600,
                          // INK, not the fill colour.
                          color: 'var(--pw-color-primary-ink, var(--pw-color-primary, #18181b))',
                        }}
                      >
                        {safeRenderValue(entry.from)}
                      </span>
                    ) : null}
                    <span style={{ fontSize: 'var(--pw-font-size-sm, 14px)' }}>
                      {safeRenderValue(entry.text)}
                    </span>
                    {entry.at ? (
                      <span
                        style={{
                          display: 'block',
                          marginTop: 2,
                          fontSize: 'var(--pw-font-size-xs, 12px)',
                          color: 'var(--pw-color-text-muted, #71717a)',
                        }}
                      >
                        {safeRenderValue(entry.at)}
                      </span>
                    ) : null}
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--pw-font-size-sm, 14px)', lineHeight: 1.6 }}>
                  {safeRenderValue(selected.body, '')}
                </p>
              )}
            </div>
          </>
        ) : emptyLabel ? (
          <p
            style={{
              margin: narrow ? '16px 20px' : 'auto',
              color: 'var(--pw-color-text-muted, #71717a)',
            }}
          >
            {emptyLabel}
          </p>
        ) : null}
        {/* Children are the ACTION area and they are the LAST child on purpose:
            in `stream` mode this is the composer, and a composer with anything
            below it is not a composer. In `stream` mode side by side the thread
            keeps the pane: the action area may take at most half of it and
            scrolls inside itself beyond that, so it can never be clipped. */}
        {children ? (
          <div
            data-pw-split-actions=""
            style={{
              flexShrink: 0,
              borderTop: border,
              padding: '12px 20px',
              ...(!narrow && detailMode === 'stream' ? { maxHeight: '50%', overflowY: 'auto' } : {}),
            }}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  )
}
