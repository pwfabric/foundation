import { z } from 'zod'
import * as React from 'react'
import type { BlockDefinition } from '@pwfabric/core'
import type { BlockComponent } from '../../../lib/component-types.js'
import { safeRenderValue, safeHref, ICON_PATHS } from '../../../lib/_shared-utils.js'
import {
  AccountAvatar,
  AccountControl,
  accountSchema,
  placeAccountInBar,
  firstWord,
  readAccount,
  sameRoute,
  useBottomBarHeightVar,
} from '../../../lib/_shared-account-menu.js'

// ============================================================
// SCHEMA
// ============================================================

/**
 * A bottom bar is not a footer and not a thin rail.
 *
 * It carries up to five primary destinations, each an icon AND a label, pinned to the
 * bottom edge so it survives scrolling. Those three properties are the whole
 * definition — a bar that scrolls away is a footer, one with a single target is
 * a button, and one with nine is a menu. `items` is capped at 5 in the schema
 * rather than merely documented, because the cap is the thing that keeps the
 * shape honest when a composer is filling it.
 */
const bottomBarItemSchema = z.object({
  label: z.string(),
  href: z.string().optional(),
  icon: z.string().optional(),
})

export const bottom_barPropsSchema = z.object({
  items: z.array(bottomBarItemSchema).max(5).default([]),
  activeHref: z.string().optional(),
  /**
   * `fixed` pins the bar to the viewport bottom — the real shell behaviour.
   * `static` leaves it in flow, which is what an editor/preview canvas wants
   * when it is showing the page as a document rather than as an application.
   */
  position: z.enum(['fixed', 'static']).default('fixed'),
  height: z.number().default(60),
  ariaLabel: z.string().default('Bottom navigation'),
  /**
   * The visitor of a published app, injected by the runner. Rendered as the
   * LAST target: signed in, an avatar that opens the account sheet (profile,
   * extra links, sign out); signed out, a "Sign in" target. The 5-target cap
   * still holds — a destination pointing at `account.profileHref` is folded
   * into the account (keeping its label), otherwise the account takes the 5th
   * slot.
   */
  account: accountSchema.optional(),
})

export type BottomBarProps = z.infer<typeof bottom_barPropsSchema>

// ============================================================
// DEFINITION
// ============================================================

export const bottom_barDefinition: BlockDefinition = {
  type: 'bottom-bar',
  name: 'BottomBar',
  category: 'layout',
  icon: '▁',
  schema: bottom_barPropsSchema,
  defaultProps: { items: [], position: 'fixed', height: 60, ariaLabel: 'Bottom navigation' },
  defaultLayout: { span: { xs: 4, sm: 8, md: 8, lg: 12 } },
  canHaveChildren: false,
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * `ICON_PATHS` is keyed by `string`, so every lookup is `readonly string[] |
 * undefined` — chaining to another key of the same table (`ICON_PATHS.circle`)
 * proved nothing, because that read is equally indefinite. The last resort is
 * a named value: the same geometry the generated `circle` entry carries, so a
 * name that is absent from the table still renders a glyph rather than
 * throwing on `.join`.
 */
const FALLBACK_ICON_PATHS: readonly string[] = ['<circle cx="12" cy="12" r="10"/>']

function BarIcon({ name }: { name: string }): React.ReactElement {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.circle ?? FALLBACK_ICON_PATHS
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths.join('') }}
    />
  )
}

const MAX_TARGETS = 5

export const BottomBarBlock: BlockComponent = ({ props, block, context }) => {
  // Data-binding safe: with `items` bound to a `{{sourceId}}` expression the
  // prop is a string until the source resolves — same guard tree-view uses.
  const declared = Array.isArray(props.items) ? (props.items as BottomBarProps['items']) : []
  const account = readAccount(props.account)
  const { items, accountLabel } = placeAccountInBar(declared, account, MAX_TARGETS)
  const activeHref = props.activeHref as string | undefined
  const fixed = (props.position ?? 'fixed') !== 'static'
  const height = typeof props.height === 'number' ? props.height : 60
  useBottomBarHeightVar(height, fixed)

  const barStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    // The iPhone home indicator sits over the bottom edge: the bar grows by the
    // safe-area inset and keeps its items above it.
    height: fixed ? `calc(${height}px + env(safe-area-inset-bottom, 0px))` : height,
    paddingBottom: fixed ? 'env(safe-area-inset-bottom, 0px)' : undefined,
    boxSizing: 'border-box',
    backgroundColor: 'var(--pw-color-card, #ffffff)',
    borderTop: '1px solid var(--pw-color-border, #e4e4e7)',
    // A fixed bar sits above page content but below any modal layer.
    ...(fixed
      ? ({ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'var(--pw-z-sticky, 150)' } as const)
      : ({ position: 'relative', width: '100%' } as const)),
    ...block.style,
  }

  const itemStyle = (active: boolean): React.CSSProperties => ({
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
    padding: '6px 4px',
    textDecoration: 'none',
    fontSize: 'var(--pw-font-size-xs, 12px)',
    fontWeight: active ? 600 : 400,
    // Active label is INK (primary pushed to AA), not the fill colour.
    color: active ? 'var(--pw-color-primary-ink, var(--pw-color-primary, #18181b))' : 'var(--pw-color-text-muted, #71717a)',
  })

  return (
    // The OUTER element stays in flow and reserves the bar's height. Without it
    // a fixed bar overlays the last band of the page — the page looks finished
    // in a screenshot and hides its own final row in a browser.
    <div
      id={block.id}
      data-block-id={block.id}
      data-block-type="bottom-bar"
      style={fixed ? { height: `calc(${height}px + env(safe-area-inset-bottom, 0px))`, flexShrink: 0 } : undefined}
    >
      <nav style={barStyle} aria-label={safeRenderValue(props.ariaLabel, 'Bottom navigation')}>
        {items.map((item, i) => {
          const href = safeHref(item.href)
          const active = sameRoute(item.href, activeHref)
          const body = (
            <>
              {item.icon ? <BarIcon name={item.icon} /> : null}
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {safeRenderValue(item.label)}
              </span>
            </>
          )
          return href ? (
            <a
              key={`${item.label}-${i}`}
              href={href}
              style={itemStyle(active)}
              aria-current={active ? 'page' : undefined}
            >
              {body}
            </a>
          ) : (
            <span key={`${item.label}-${i}`} style={itemStyle(active)}>
              {body}
            </span>
          )
        })}
        {account && (
          <AccountControl
            account={account}
            blockId={block.id}
            inert={context?.interactionMode === 'inert'}
            // A phone's bottom edge: the menu rises as a sheet (44px targets,
            // sign-out one tap away) instead of a popover squeezed into a corner.
            presentation="sheet"
            foldedLabel={accountLabel}
            wrapperStyle={{ flex: '1 1 0', minWidth: 0, display: 'flex' }}
            renderTrigger={({ ref, ...trigger }, state) => {
              const active = state.signedIn && sameRoute(state.account.profileHref, activeHref)
              return (
                <button
                  ref={ref}
                  {...trigger}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    ...itemStyle(active || state.open),
                    flex: '1 1 0',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 'var(--pw-font-size-xs, 12px)',
                    cursor: 'pointer',
                  }}
                >
                  {state.signedIn ? <AccountAvatar account={state.account} size={22} /> : <BarIcon name="log-in" />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {state.signedIn ? accountLabel || firstWord(state.label) : state.label}
                  </span>
                </button>
              )
            }}
          />
        )}
      </nav>
    </div>
  )
}
