# patterns/ — the unit of meaning

A **pattern** is a proven block composition with a knowledge brief. It is the
layer the composer reasons in: blocks are raw material, surfaces are exemplars,
patterns are what a page is *made of*. A pattern may also carry **data,
behaviour and state**, so that what a page reads and does is visible to the
composer rather than hidden inside self-fetching blocks.

## What foundation ships

| role | patterns |
|---|---|
| shell | `shell-topbar-flow`, `shell-topbar-grid`, `shell-topbar-dense`, `shell-topbar-split-doc`, `shell-bottombar-flow`, `shell-bottombar-grid`, `shell-bottombar-dense`, `shell-none-flow` |
| weave | `weave-notice`, `weave-pair` |
| band | `page-header`, `card-grid`, `contact-form`, `callout-row`, `brand-mark`, `legal-footnote`, `footer` |
| part | `feature-card`, `icon-chip`, `callout`, `faq`, `empty-state`, `avatar-group`, `avatar-row-item`, `pending-need` |

Domain-specific patterns (heroes, pricing, testimonials, data bands and so on)
live in their own packs.

## File shape

| field | required | meaning |
|---|---|---|
| `name` | yes | file stem; the id the composer uses (`card-grid`) |
| `role` | yes | `shell` · `weave` · `band` · `part` — structural (see below) |
| `body` | bands, weaves, shells | `flow` · `grid` · `dense` · `split` · `any` |
| `description` | yes | one line for humans |
| `provenPattern` | yes | where it was measured, never a guess |
| `knowledge` | yes | `purpose`, `useCases[]`, `composesWith[]`, `antiPatterns[]` — the four fields the composer prompt ships; English |
| `mobileCollapse` | bands, weaves, shells | what the arrangement TURNS INTO on a narrow screen (shells derive it from `chrome × body`) |
| `placeholders` | yes | every UPPERCASE `{{SLOT}}` the pattern carries — in a snippet prop OR inside a wiring field; a value is a description string or a typed declaration (see "Typed slots") |
| `usesBlocks` | yes | every block type the snippet uses, no more, no less |
| `snippet` | yes | the block tree; ids are templated (`{{ID}}-h`) |
| `layoutOnly` | layout patterns | the literal `true`: this pattern is arrangement and copy BY INTENT and carries no wiring field (see "Wired or layout-only") |
| `dataSources[]` | data patterns | contracts `dataSourceSchema`: `{id, kind:'rest'|'static'|'state'|'entity', connector?, entityType?, endpoint?, query, fallback[]}` |
| `behaviors[]` | interactive patterns | contracts `surfaceBehaviorSchema`: `{id, event, targetBlockId?, actions[]}` |
| `initialState{}` | when the snippet reads OR writes `{{state.x}}` | every state key seeded — read via `{{state.x}}`, written via a control's `stateKey`, a behavior's `setState.key` or a form binding's `statusKeys` |
| `formBindings[]` | form patterns | `{formId, sourceId, statusKeys:{loading?, success?, error?, message?}}`: the form node that submits, the source it writes, the state keys the `form` block reads (`submittingWhen`, reset) — moved into `platform/entities` config (see "What the composer receives") |
| `requires.connectors[]` | data patterns | every connector the sources name |

## Wired or layout-only — never silently neither

A pattern declares one of two things, and the gate
(`scripts/lib/wiring-rules.mjs`) measures it:

- **Wired** — it carries at least one of `dataSources`, `behaviors`,
  `initialState`, `formBindings`. The wiring is the pattern's CONSTANT, not the
  caller's: source ids, state keys, button actions, status cards'
  `visibleWhen`, repeat expressions, pager and form names are fixed in the
  file. Slots carry only what differs per app — endpoint, path, field names,
  page size, copy.
- **Layout-only** — `"layoutOnly": true`. A declaration, not a defect: the
  composer treats it as a content band and expects no data from it, and does
  not look for a source behind it.

Gate rules, all in `check-integrity.mjs` via `wiring-rules.mjs`:

| rule | verdict |
|---|---|
| neither wired nor `layoutOnly: true` | reported, with the count on every run; `--strict-wiring` fails it |
| both wired and `layoutOnly: true` | fail |
| `layoutOnly` anything but the literal `true` | fail |
| literal `"stateKey": "x"` in the snippet, `x` not in `initialState` | fail — a state key is a pattern constant; seed it |
| slot-valued `"stateKey": "{{X_STATE_KEY}}"` | reported — the key cannot be seeded by name (a state key is never a slot) |
| behavior `setState.key` or `formBindings[].statusKeys.*` not seeded | fail |
| `formBindings[].formId` not a snippet node id · `sourceId` not a declared source · status key outside `loading|success|error|message` | fail |
| `{{SLOT}}` inside a wiring field not declared in `placeholders` | fail (same rule as a snippet slot — it prints on the wire) |

## Typed slots

A `placeholders` value is either a description string (a `text` slot) or a
declaration:

```jsonc
"placeholders": {
  "{{TITLE}}": "heading.text — e.g. Products",                       // text slot
  "{{COLLECTION}}": { "description": "REST collection URL", "type": "url" },
  "{{RETURNS}}":    { "description": "path to the rows in the response", "type": "json-path", "optional": true },
  "{{ID_FIELD}}":   { "description": "the row field that identifies a record", "type": "field" }
}
```

`type` is one of `text` · `url` · `url-template` · `json-path` · `field` ·
`state-key`. The type is what a filler reads to know what to put there and
what the composer prints next to the slot (`COLLECTION (url)`); it changes
nothing about substitution. The typed form is ADDITIVE: a consumer that reads
a placeholder value as a string must learn `description` before a pattern
ships a typed slot.

## Roles are structural

- **band** — a page slab; the snippet is rooted in `section`.
- **part** — goes inside a band; rooted in `container`, `card`, `accordion`, `repeater`…
- **shell** — the frame the bands sit in; carries a slot placeholder (`{{MAIN}}`, `{{RAIL}}`…).
- **weave** — a body arrangement (`weave-*`) with a `{{BANDS}}` slot.

The gate checks the equivalence both ways: section-rooted ⇔ band.

## Slots vs bindings — two grammars that share braces

- **Slots** are UPPERCASE: `{{TITLE}}`, `{{ID}}`. Filled when the pattern is
  applied (by the composer, a gallery or a generator) and gone from the
  surface. Declared in `placeholders`; the gate fails an undeclared one.
- **Bindings** are lowercase: `{{alerts}}`, `{{state.offset}}`,
  `{{__loading.alerts}}`, `{{__errors.alerts}}`, `{{length(alerts)}}`,
  `{{sumBy(skus,'consumed')}}`. They survive into the surface and are resolved
  by the runtime on every render. A source binds as `{{<sourceId>}}` — an
  array for list sources. Not slots; the gate's slot regex is uppercase-only.

## Data-driven patterns

A data pattern declares its sources with **fallback rows** (a gallery renders
them without a live connection; `__errors.<id>` stays set so the page is
honest about it), and its controls DRIVE the query:

- `segmented-control` with `stateKey` writes `state.<key>`; the source's
  `query.filter.value: "{{state.<key>}}"` re-fetches.
- A pager control with `stateKey` + `pageSize` writes the offset;
  `query.pagination.offset: "{{state.<key>}}"` pages the list.

Named parameters the engine reads travel in the same `filter` and are consumed
upstream; row-field filters, `sort` and `pagination` are applied by the
connector's result envelope (`applyEntityQuery`).

## What the composer receives

`use-pattern` expands the snippet and moves `dataSources`, `behaviors` and
`initialState` into the surface's `platform/persistence` capability config
(prefixing ids on collision) and checks `requires.connectors` against the
project's connections — missing → a finding, and the fallback renders.
`formBindings` goes to the `platform/entities` capability config.

## Adding a pattern

Measured, not invented: two real occurrences before a file, and
`provenPattern` says where they were measured. Run
`node scripts/check-integrity.mjs` — it validates the snippet against the
catalogue, the slots against `placeholders`, the data contract against the
provider's entity files, and the knowledge brief against the loader's shape.
