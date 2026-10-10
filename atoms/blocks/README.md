# blocks/ — block atoms (SOURCE)

A block is `blocks/<family>/<name>/component.tsx` + a sibling `manifest.json`
(`AtomFileManifest`, defined by the PWFabric contracts package).
Blocks are discovered by convention: the directory IS the id
(`<family>.<name>`), and `scripts/check-integrity.mjs` fails a manifest whose
`id` / `category` / `name` disagree with its path.

## The block law

**A block is a primitive. It never fetches and never knows a domain.**
Everything a block draws reaches it through props — a pattern's
`dataSources` binds `{{<sourceId>}}` — and everything it does leaves as a
surface event. The gate fails any component outside `integration/` that calls
`useConnectorEngine(`, `use*Bridge(` or `fetch(`.

## Families — by SHAPE, not by domain

Foundation ships 33 general-purpose blocks:

| family | what it is | members |
|---|---|---|
| `text` | reading | heading, text, prose, alert |
| `media` | pictures and sound | image, video |
| `layout` | arrangement | container, grid, section, split-view, navbar, bottom-bar |
| `control` | one action | button, link, icon, badge, chip, avatar, breadcrumb, divider |
| `form` | input | form, input, textarea, select, segmented-control |
| `data` | data made visible | repeater, list, skeleton |
| `feedback` | status | toast, spinner |
| `container` | holds children with a grammar | card, accordion |
| `content` | a stand-in for what the app needs and the catalogue lacks | placeholder |

Domain-specific blocks (money, galleries, maps, overlays, integration views
and so on) live in their own packs.

## Roles — the catalogue's second axis

Every manifest carries exactly one role tag: `tier:structure` (raw
arrangement: container, grid, section…), `tier:content` (text and media),
`tier:widget` (a control or look-ready convenience: button, badge, card…),
`tier:data` (data made visible). The gate requires it.

## Controls that drive data

`segmented-control` carries a declarative `setState` action in its event
payload when given a `stateKey`, so a pattern's data source can read the
value back: a source's `query.filter.value: "{{state.<key>}}"` filters by it.

## Shell blocks carry the account

`navbar` and `bottom-bar` (and any shell block in another pack, such as a
rail) accept an `account` prop that the published-app runner injects
(`{state: 'signed-in' | 'signed-out', name?, email?, avatarSrc?, profileHref?,
profileLabel?, links?, signInLabel?, signOutLabel?}`) — never authored in a
pattern or receipt. They render it through ONE component,
`../lib/_shared-account-menu.tsx` (WAI-ARIA menu button; popover in the
navbar, bottom sheet in bar shapes), and emit
`payload.action {type: 'auth:signIn' | 'auth:signOut'}` for the runner to
handle. In a bar the account is always the last of ≤ 5 targets: an item
routing to `profileHref` (trailing slash / query ignored) is folded into it,
otherwise it takes the 5th slot. The menu's Profile entry is labelled by the
folded tab's own label if there is one, then `profileLabel`, then "Profile".
A fixed bottom bar publishes `--pw-bottom-bar-height` on the document root
while mounted. The gate checks the manifests declare the prop and the
components use the shared menu.

## Runtime defaults and block declarations

- `sizing: 'intrinsic'` — avatar, badge, icon, button, link, spinner and
  segmented-control declare it statically on the component; the runtime gives
  them `flex: 0 0 auto` in a row. The engine memorises no block names.
- `container` padding — a container that paints a ground (colour / border /
  gradient) defaults to 16, a pure arrangement container to 0; an explicit
  `padding` always wins.
- Theme tokens — every emitted `--pw-*` variable has a consumer in the
  catalogue (see `../appearance/README.md`).

## Block or pattern?

A thing is a **block** only if it has runtime behaviour, render logic JSON
cannot express (array→N, cell types, a chart, a ticking clock), an external
integration, or an a11y/theme contract that must live in one place. Pure
arrangement is a **pattern** (`../patterns/`).

## Label weight follows the theme voice

`badge` and `button` read `var(--pw-font-weight-heading, 600)` instead of a
fixed 500. A fixed weight made every theme's controls look alike while
`headingWeight` ranges from 400 to 800 across themes.

## Unfilled slots keep the layout

A host may write the platform placeholder (`data:image/svg+xml` carrying
`pw-placeholder:<key>`) into every declared image slot and swap the real
picture in later — so an unfilled slot is a normal LIVE state.
`image` draws its themeable slot live too (quiet: no text) for an empty or
placeholder src, exposes the key as `data-pw-placeholder`, and — with no
`aspectRatio` or `height` — takes the placeholder SVG's own ratio so nothing
moves when the picture arrives. A broken src shows the quiet slot live as well
(the layout holds); `hideWhenEmpty` removes the slot in every case. An unmet
BLOCK need gets `content.placeholder` (`label`, `need`, `kind`, `minHeight`)
through the `pending-need` pattern: the same ground, `data-pw-need` on the
root, the label and what is coming in the editor only — live it carries no
text and is `aria-hidden`.

## Selected states, shells, motion and theme sizes

- **Selected is a change of kind.** `badge` `primary` is filled —
  brand fill, `--pw-color-text-on-primary` label, a 2px inset edge in
  `--pw-color-primary-ink` — and `default` is empty (transparent, control
  edge, muted ink). The chosen `segmented-control` pill speaks the same
  language. Measured in light and derived dark mode: the selected shape
  clears 3:1 against the ground and the unselected neighbour, the label
  4.5:1. `badge` takes `status` + `variantMap` so a badge bound to data picks
  its variant per value.
- **segmented-control.** Boolean options (`value: true/false`, or
  `valueType: "boolean"`) write real booleans to state and submit them through
  `form.form` (a hidden input marked `data-pw-value-type="boolean"`, which the
  form honours). `allowNone` (default for a one-option control) starts with
  nothing lit, and a second click clears the answer.
- **Destructive ink.** `inkOn()` (`lib/_shared-utils.ts`) picks black or
  white by the ground's own luminance in CSS (relative colour, srgb-linear),
  after `--pw-color-on-error` when a theme sets it: ≥ 4.58:1 on any fill.
- **Shells.** Every shell root carries `widthScope: viewport`, so the runtime
  lifts the whole frame out of the padded 1280px measure box: the navbar
  meets the top edge at full width, the bottom bar and the footer span the
  screen. Content sits in `{{ID}}-content` — theme max width, centred, inline
  gutter `max(16px, --pw-layout-surface-padding)`. The slot (`{{ID}}-main`)
  and every placeholder are unchanged.
- **Theme sizes.** `text` has no 14px default (the theme body size
  applies); `card` takes `--pw-border-radius-lg`; badge corners and sizes come
  from the theme scale.
- **Motion.** `MOTION` tokens: state changes at `--pw-duration-normal`,
  panels and entrances at `--pw-duration-slow`, presses, chevrons and the
  toast entrance on `--pw-easing-bounce`. Zero durations mean no motion; the
  runtime's reduced-motion gate still applies.
- **split-view** reads records through `idKey` / `titleKey` / `metaKey`
  / `excerptKey` / `bodyKey` / `entriesKey`; `autoSelect` (off when an
  `emptyLabel` is given) stops it forcing the first row.
- **repeater** `layout: "inline"` wraps items (or repeated template
  children) as chips.

## Narrow-viewport text

Measured on a 390px-wide viewport.

- **A badge label is one line.** `badge` renders `white-space: nowrap`
  and `flex-shrink: 0`: in a step row of badges one shrank to 68px and its
  label broke onto three lines outside the pill. A narrow row now wraps whole
  badges — give the row container `wrap: true`.
- **A long word breaks instead of overflowing.** `heading`, `text` and
  `prose` carry `overflow-wrap: anywhere` and `min-width: 0`: a single long
  word at the theme's 4xl step pushed the content box to 416px at 390px. The
  word breaks only when it cannot fit on its own line; font sizes are
  unchanged.
