/**
 * The account control a published app's SHELL wears — one implementation for
 * `navbar`, `bottom-bar` and `app-rail`.
 *
 * WHY IT LIVES IN THE SHELL. Sign-in, the session
 * pill and sign-out used to be DOM overlays the runner drew on top of the app:
 * the pill (fixed, bottom-right) covered the bottom bar's last tab, and the
 * navbar "avatar" was a bare <span> — no menu, no profile, no way out. The
 * account is part of the app's chrome, so it is drawn by the chrome, with the
 * same appearance tokens as everything around it.
 *
 * THE CONTRACT (shared with the runner and the catalogue). The runner injects
 * an `account` prop into whichever shell block the app declares, and handles
 * two actions that leave through the block's ordinary event channel — the same
 * `payload.action` path `pagination`/`segmented-control` use:
 *
 *     { type: 'auth:signIn' }     { type: 'auth:signOut' }
 *
 * Neither is a renderer `SurfaceAction`, so the renderer's dispatcher lets them
 * through untouched and they reach the host's `onEvent`, which is the runner.
 *
 * ONE COMPONENT, not three, because the part that is easy to get wrong — the
 * WAI-ARIA menu-button pattern (aria-haspopup/expanded, arrow keys, Escape
 * returning focus, outside-press dismissal) — must behave the same in every
 * shell. Each block only decides what its TRIGGER looks like.
 *
 * Not exported from the public barrel — internal to blocks/ only.
 */

import * as React from 'react'
import { z } from 'zod'
import { SURFACE_EVENTS } from '@pwfabric/contracts'
import { useSurfaceEvents, useSurfaceId } from './hooks.js'
import { safeHref, safeRenderValue } from './_shared-utils.js'

// ============================================================
// SCHEMA
// ============================================================

export const accountLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
})

export const accountSchema = z.object({
  state: z.enum(['signed-in', 'signed-out']),
  /** Display name — falls back to `email`. */
  name: z.string().optional(),
  email: z.string().optional(),
  avatarSrc: z.string().optional(),
  /** App route of the profile page, already rewritten by the runner. */
  profileHref: z.string().optional(),
  /** Localised label of the Profile entry — default "Profile". */
  profileLabel: z.string().optional(),
  /** Extra menu entries, listed after Profile. */
  links: z.array(accountLinkSchema).optional(),
  signInLabel: z.string().optional(),
  signOutLabel: z.string().optional(),
})

export type AccountInfo = z.infer<typeof accountSchema>

export const ACCOUNT_SIGN_IN = 'auth:signIn' as const
export const ACCOUNT_SIGN_OUT = 'auth:signOut' as const

/**
 * The prop as it arrives — validated, never trusted. A malformed value (a
 * binding that has not resolved yet, a hand-edited receipt) renders as "no
 * account" rather than taking the shell down.
 */
export function readAccount(value: unknown): AccountInfo | undefined {
  const parsed = accountSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Route identity, not string identity. The catalogue writes `/profile/`, the
 * runner rewrites through `router.toHref`, a hand-authored item says
 * `/profile` — all the same destination. Query and hash are not part of it.
 */
export function normalizeHref(href: string | undefined): string | undefined {
  if (typeof href !== 'string') return undefined
  const path = href.trim().split(/[?#]/)[0] ?? ''
  if (!path) return undefined
  const stripped = path.length > 1 ? path.replace(/\/+$/, '') : path
  return stripped || '/'
}

export function sameRoute(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeHref(a)
  return na !== undefined && na === normalizeHref(b)
}

export function accountDisplayName(account: AccountInfo): string {
  return account.name?.trim() || account.email?.trim() || 'Account'
}

export function accountInitials(account: AccountInfo): string {
  const source = account.name?.trim() || account.email?.split('@')[0] || ''
  const initials = source
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return initials || '?'
}

/** A tab label has room for one word — the first of the display name. */
export function firstWord(label: string): string {
  return label.split(/\s+/)[0] || label
}

interface BarItem {
  readonly label: string
  readonly href?: string | undefined
  readonly icon?: string | undefined
}

/**
 * Where the account goes in a bar of at most `max` destinations.
 *
 * The account is always the LAST target. If a destination already points at
 * the profile route it is the account's twin — it is removed and its label is
 * kept (it is the app's own, localised word for "Profile"). Otherwise, when the
 * bar is full, the account takes the last slot.
 */
export function placeAccountInBar<T extends BarItem>(
  items: readonly T[],
  account: AccountInfo | undefined,
  max: number
): { items: T[]; accountLabel?: string } {
  if (!account) return { items: items.slice(0, max) }
  const twin =
    account.state === 'signed-in' && account.profileHref
      ? items.findIndex((item) => sameRoute(item.href, account.profileHref))
      : -1
  if (twin >= 0) {
    const rest = items.filter((_, i) => i !== twin)
    const label = items[twin]?.label
    return { items: rest.slice(0, max - 1), ...(label ? { accountLabel: label } : {}) }
  }
  return { items: items.slice(0, max - 1) }
}

/**
 * Publishes a fixed bottom bar's height on the document root while it is
 * mounted — `--pw-bottom-bar-height: <n>px` and `data-pw-bottom-bar-height` —
 * so anything the host floats above the page (toasts, a chat launcher) can sit
 * above the bar instead of on it.
 */
export function useBottomBarHeightVar(height: number, active: boolean): void {
  React.useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const root = document.documentElement
    const value = `${height}px`
    root.style.setProperty('--pw-bottom-bar-height', value)
    root.setAttribute('data-pw-bottom-bar-height', String(height))
    return () => {
      // Only undo what this bar wrote — a second bar may have replaced it.
      if (root.style.getPropertyValue('--pw-bottom-bar-height') === value) {
        root.style.removeProperty('--pw-bottom-bar-height')
        root.removeAttribute('data-pw-bottom-bar-height')
      }
    }
  }, [height, active])
}

// ============================================================
// ACTIONS
// ============================================================

/**
 * Emits the two auth actions. In an inert (editor/preview) render the click is
 * still reported, but WITHOUT the action — signing someone out of the editor
 * because they clicked a preview is exactly the side-effect `inert` forbids.
 */
function useAccountActions(blockId: string, inert: boolean) {
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  return React.useCallback(
    (type: typeof ACCOUNT_SIGN_IN | typeof ACCOUNT_SIGN_OUT) => {
      emit({
        type: SURFACE_EVENTS.BLOCK_CLICK,
        surfaceId,
        blockId,
        payload: inert ? { account: type } : { account: type, action: { type } },
      })
    },
    [emit, surfaceId, blockId, inert]
  )
}

// ============================================================
// AVATAR
// ============================================================

export function AccountAvatar({ account, size }: { account: AccountInfo; size: number }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        flex: '0 0 auto',
        overflow: 'hidden',
        backgroundColor: 'var(--pw-color-primary)',
        color: 'var(--pw-color-text-on-primary)',
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {account.avatarSrc && safeHref(account.avatarSrc) ? (
        <img
          src={safeHref(account.avatarSrc)}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        accountInitials(account)
      )}
    </span>
  )
}

export function AccountGlyph({ kind, size = 16 }: { kind: 'sign-in' | 'sign-out'; size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      {kind === 'sign-in' ? (
        <>
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </>
      ) : (
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </>
      )}
    </svg>
  )
}

// ============================================================
// THE CONTROL
// ============================================================

/** What a block's trigger receives — spread it onto a <button>. */
export interface AccountTriggerProps {
  readonly ref: React.Ref<HTMLButtonElement>
  readonly type: 'button'
  readonly onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  readonly onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
  readonly 'aria-haspopup'?: 'menu'
  readonly 'aria-expanded'?: boolean
  readonly 'aria-controls'?: string
  readonly 'aria-label': string
  readonly id: string
}

export interface AccountTriggerState {
  readonly account: AccountInfo
  readonly signedIn: boolean
  /** Signed in: the display name. Signed out: the sign-in label. */
  readonly label: string
  readonly open: boolean
}

/**
 * - `popover`: a card anchored to the trigger (`placement` decides the side).
 * - `sheet`: a panel rising from the bottom edge over a scrim — the phone
 *   pattern. A bottom bar's trigger sits at the thumb; a sheet keeps every
 *   entry (profile, extra links AND sign-out) one tap away with 44px targets,
 *   where navigating straight to the profile page would hide sign-out behind
 *   a page the app may not even have.
 */
export type AccountMenuPresentation = 'popover' | 'sheet'
export type AccountMenuPlacement = 'bottom-end' | 'right-end'

export interface AccountControlProps {
  readonly account: AccountInfo
  readonly blockId: string
  readonly inert: boolean
  readonly presentation: AccountMenuPresentation
  readonly placement?: AccountMenuPlacement
  /**
   * The label of a bar tab folded into the account. It wins over
   * `account.profileLabel`: a bottom bar that folded the app's
   * own profile tab into the account passes that tab's (localised) label.
   */
  readonly foldedLabel?: string | undefined
  /** Draws the trigger. Must spread `trigger` onto a <button>. */
  readonly renderTrigger: (trigger: AccountTriggerProps, state: AccountTriggerState) => React.ReactElement
  readonly wrapperStyle?: React.CSSProperties
}

const MENU_TOKENS: React.CSSProperties = {
  // The panel paints CARD, and may be opened from inside a shell that
  // re-pointed the text tokens (a primary-painted navbar sets them to the
  // on-primary ink). Re-point back to the on-card chain with hard fallbacks —
  // the same trap the navbar's own dropdown panels document.
  ['--pw-color-text' as string]: 'var(--pw-color-text-on-card, #09090b)',
  ['--pw-color-text-muted' as string]: 'var(--pw-color-text-muted-on-card, #71717a)',
  color: 'var(--pw-color-text)',
  backgroundColor: 'var(--pw-color-card, #ffffff)',
  border: '1px solid var(--pw-color-border, #e4e4e7)',
  boxShadow: 'var(--pw-shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
  fontSize: 'var(--pw-font-size-sm, 14px)',
  textAlign: 'left',
}

let accountMenuSeq = 0

export function AccountControl({
  account,
  blockId,
  inert,
  presentation,
  placement = 'bottom-end',
  foldedLabel,
  renderTrigger,
  wrapperStyle,
}: AccountControlProps): React.ReactElement {
  const dispatch = useAccountActions(blockId, inert)
  const { emit } = useSurfaceEvents()
  const surfaceId = useSurfaceId()
  const [open, setOpen] = React.useState(false)
  const [seq] = React.useState(() => ++accountMenuSeq)
  const baseId = `${blockId}-account-${seq}`
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const focusOnOpen = React.useRef<'first' | 'last'>('first')

  const signedIn = account.state === 'signed-in'

  const items = (): HTMLElement[] =>
    panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')) : []

  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Move focus into the menu once it is visible.
  React.useEffect(() => {
    if (!open) return
    const list = items()
    const target = focusOnOpen.current === 'last' ? list[list.length - 1] : list[0]
    target?.focus()
  }, [open])

  // Outside press and Escape. Real document listeners, so only while open.
  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const onPointer = (e: Event): void => {
      const t = e.target as Node | null
      if (t && (rootRef.current?.contains(t) || panelRef.current?.contains(t))) return
      close(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  if (!signedIn) {
    const label = account.signInLabel?.trim() || 'Sign in'
    return (
      <div style={{ display: 'inline-flex', ...wrapperStyle }} data-pw-account="signed-out">
        {renderTrigger(
          {
            ref: triggerRef,
            type: 'button',
            id: `${baseId}-trigger`,
            'aria-label': label,
            onClick: () => dispatch(ACCOUNT_SIGN_IN),
          },
          { account, signedIn, label, open: false }
        )}
      </div>
    )
  }

  const displayName = accountDisplayName(account)
  const signOutLabel = account.signOutLabel?.trim() || 'Sign out'
  const profileHref = safeHref(account.profileHref)
  const links = (account.links ?? []).filter((l) => safeHref(l.href))

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first'
      if (open) {
        const list = items()
        ;(e.key === 'ArrowUp' ? list[list.length - 1] : list[0])?.focus()
      } else {
        setOpen(true)
      }
    }
  }

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const list = items()
    if (list.length === 0) return
    const at = list.indexOf(document.activeElement as HTMLElement)
    let next: number | undefined
    if (e.key === 'ArrowDown') next = (at + 1) % list.length
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = list.length - 1
    else if (e.key === 'Tab') {
      // Tab leaves a menu; it does not walk it.
      close(false)
      return
    }
    if (next !== undefined) {
      e.preventDefault()
      list[next]?.focus()
    }
  }

  const onNavigate = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (inert) {
      e.preventDefault()
      emit({ type: SURFACE_EVENTS.BLOCK_CLICK, surfaceId, blockId, payload: { href } })
    }
    close(false)
  }

  const sheet = presentation === 'sheet'
  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: sheet ? 44 : 36,
    padding: sheet ? '10px 16px' : '8px 12px',
    border: 'none',
    borderRadius: 'var(--pw-border-radius, 8px)',
    background: 'transparent',
    color: 'var(--pw-color-text)',
    fontFamily: 'inherit',
    fontWeight: 500,
    textDecoration: 'none',
    textAlign: 'left',
    cursor: 'pointer',
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: sheet ? '4px 16px 12px' : '6px 12px 10px' }}>
      <AccountAvatar account={account} size={36} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          id={`${baseId}-name`}
          style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {safeRenderValue(displayName)}
        </span>
        {account.email && account.email !== displayName && (
          <span
            style={{
              fontSize: 'var(--pw-font-size-xs, 12px)',
              color: 'var(--pw-color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {safeRenderValue(account.email)}
          </span>
        )}
      </div>
    </div>
  )

  const hover = (e: React.SyntheticEvent<HTMLElement>, on: boolean): void => {
    e.currentTarget.style.backgroundColor = on
      ? 'color-mix(in srgb, var(--pw-color-text) 8%, transparent)'
      : 'transparent'
  }

  const menu = (
    <div
      role="menu"
      id={`${baseId}-menu`}
      aria-labelledby={`${baseId}-trigger`}
      onKeyDown={onMenuKeyDown}
      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {profileHref && (
        <a
          role="menuitem"
          tabIndex={-1}
          href={profileHref}
          onClick={onNavigate(profileHref)}
          onMouseEnter={(e) => hover(e, true)}
          onMouseLeave={(e) => hover(e, false)}
          onFocus={(e) => hover(e, true)}
          onBlur={(e) => hover(e, false)}
          style={itemStyle}
        >
          {foldedLabel?.trim() || account.profileLabel?.trim() || 'Profile'}
        </a>
      )}
      {links.map((link, i) => {
        const href = safeHref(link.href) as string
        return (
          <a
            key={`${link.label}-${i}`}
            role="menuitem"
            tabIndex={-1}
            href={href}
            onClick={onNavigate(href)}
            onMouseEnter={(e) => hover(e, true)}
            onMouseLeave={(e) => hover(e, false)}
            onFocus={(e) => hover(e, true)}
            onBlur={(e) => hover(e, false)}
            style={itemStyle}
          >
            {safeRenderValue(link.label)}
          </a>
        )
      })}
      {(profileHref || links.length > 0) && (
        <div
          role="separator"
          style={{ height: 1, margin: '4px 0', backgroundColor: 'var(--pw-color-border, #e4e4e7)' }}
        />
      )}
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          close(true)
          dispatch(ACCOUNT_SIGN_OUT)
        }}
        onMouseEnter={(e) => hover(e, true)}
        onMouseLeave={(e) => hover(e, false)}
        onFocus={(e) => hover(e, true)}
        onBlur={(e) => hover(e, false)}
        style={itemStyle}
      >
        <AccountGlyph kind="sign-out" />
        {signOutLabel}
      </button>
    </div>
  )

  const popoverPosition: React.CSSProperties =
    placement === 'right-end'
      ? { left: 'calc(100% + var(--pw-space-xs, 4px))', bottom: 0 }
      : { right: 0, top: 'calc(100% + var(--pw-space-xs, 4px))' }

  const panel = sheet ? (
    <>
      <div
        aria-hidden="true"
        onClick={() => close(true)}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'color-mix(in srgb, #000 40%, transparent)',
          zIndex: 'var(--pw-z-modal, 500)' as unknown as number,
        }}
      />
      <div
        ref={panelRef}
        data-pw-account-menu="sheet"
        style={{
          ...MENU_TOKENS,
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 'var(--pw-z-modal, 500)' as unknown as number,
          padding: '8px 8px calc(12px + env(safe-area-inset-bottom, 0px))',
          borderRadius: 'var(--pw-border-radius-lg, 12px) var(--pw-border-radius-lg, 12px) 0 0',
          borderBottom: 'none',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            margin: '4px auto 12px',
            backgroundColor: 'var(--pw-color-border, #e4e4e7)',
          }}
        />
        {header}
        {menu}
      </div>
    </>
  ) : (
    <div
      ref={panelRef}
      data-pw-account-menu="popover"
      style={{
        ...MENU_TOKENS,
        position: 'absolute',
        ...popoverPosition,
        zIndex: 'var(--pw-z-dropdown, 300)' as unknown as number,
        width: 'max-content',
        minWidth: 220,
        maxWidth: 'min(320px, calc(100vw - 32px))',
        padding: 6,
        borderRadius: 'var(--pw-border-radius-lg, 12px)',
      }}
    >
      {header}
      {menu}
    </div>
  )

  return (
    <div
      ref={rootRef}
      data-pw-account="signed-in"
      style={{ position: 'relative', display: 'inline-flex', ...wrapperStyle }}
    >
      {renderTrigger(
        {
          ref: triggerRef,
          type: 'button',
          id: `${baseId}-trigger`,
          'aria-label': `${displayName} — account menu`,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          // Only point at the menu while it exists in the DOM.
          ...(open ? { 'aria-controls': `${baseId}-menu` } : {}),
          onClick: () => {
            focusOnOpen.current = 'first'
            setOpen((o) => !o)
          },
          onKeyDown: onTriggerKeyDown,
        },
        { account, signedIn, label: displayName, open }
      )}
      {open && panel}
    </div>
  )
}

/**
 * The shells' shared compact button look for "Sign in" — a bordered ghost
 * button on the shell's own ink, so it reads on a card-painted and a
 * primary-painted bar alike.
 */
export const accountSignInButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderRadius: 'var(--pw-border-radius, 8px)',
  border: '1px solid color-mix(in srgb, currentColor 35%, transparent)',
  background: 'transparent',
  color: 'var(--pw-color-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--pw-font-size-sm, 14px)',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
