# appearance/ — pack themes

Foundation ships two themes. Each is a whole identity, not a palette swap:
they differ on palette, voice, shape and rhythm.

| theme | palette | voice (heading / body) | shape (radius md / xl) | rhythm (spacing × / line-height / max width) |
|---|---|---|---|---|
| zinc | neutral, near-black on white | system sans 600 / system sans | 8px / 16px | 1.0 / 1.6 / 1440 |
| midnight | violet on navy (dark) | DM Sans 800 / DM Sans, 15px base | 0.25rem / 0.5rem | 0.85 / 1.45 / 1440, deep shadows |

More themes live in their own packs. A theme's name states its character,
not its owner.

**A surface must be repaintable.** The integrity gate caps raw colour values
in a surface's blocks at 8 (`RAW_COLOR_CAP`); above that the surface either
binds to tokens / `color-mix()` derivations or declares
`themeIndependent: true` and leaves the theme rhythm. Derivation idioms that
keep a thesis while staying themeable: glass = `color-mix(in srgb,
var(--pw-color-card) 12%, transparent)`, faded ink = `color-mix(in srgb,
var(--pw-color-text) 62%, transparent)`, offset shadow = `6px 6px 0
var(--pw-color-text)`, marker = `var(--pw-color-accent)` with
`--pw-color-on-accent` ink.

## What a theme declares

Nine axes, 72 fields: colors (14), typography (17), border (8), spacing (7),
shadows (6), motion (5), layout (6), focus (3), zIndex (6). The appearance
cascade reads all 72 (no dead declared field) and emits 94 `--pw-*`
variables.

**Every emitted token has a consumer** somewhere in the catalogue. Examples
in this pack:

| token | consumer |
|---|---|
| `--pw-z-toast` | `feedback/toast` root `zIndex` |
| `--pw-z-sticky` | `layout/navbar` when sticky, `layout/bottom-bar` when fixed |
| `--pw-shadow-button` | `control/button` primary and accent variants |
| `--pw-font-weight-body`, `--pw-letter-spacing-body` | `text/text` defaults |
| `--pw-color-link-on-card` | `container/card` scopes `--pw-color-link`, `control/link` reads it |

**Every theme is worn in two modes.** A theme declares one palette, but the
platform derives a dark variant from it for every themed surface
(`deriveDarkTheme` in contracts; the runtime and the published `theme.css`
apply it under `prefers-color-scheme: dark`). midnight is the theme whose
declared palette is already dark.

So the palette has to hold in both. The integrity gate checks every theme atom
in light AND in the derived dark mode:

- text pairs ≥ 4.5:1 — text and textMuted on background and card, and
  `textOnPrimary` on `primary`. The dark mode passes `textOnPrimary` through
  unchanged, so a light-only fix is not a fix;
- the focus ring ≥ 3:1 on background and card, in both modes. Each theme's
  ring comes from its own palette. One value has to clear a pale ground and a
  near-black one, which is why rings sit at a mid lightness of the brand hue.

| theme | button ink on primary (light / dark) | focus ring (min over 4 grounds) |
|---|---|---|
| midnight | `#0f172a` on `#818cf8` — 5.98 | `#818cf8` — 4.39 |
| zinc | `#fafafa` on `#18181b` — 16.97 (dark 5.94) | `#71717a` — 3.53 |

## The heading scale hook

`text.heading` reads an OPT-IN override chain the theme may declare:
`--pw-font-size-h1` … `--pw-font-size-h5`, each falling back to the
typography scale (`h1 → font-size-4xl` … `h5 → font-size-lg`). A theme that
wants a bespoke heading scale sets these; neither theme here does, and that
is a choice, not an omission.
