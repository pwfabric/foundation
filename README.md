# PWFabric Foundation

`@pwfabric/foundation` is the standard library of the PWFabric spec: the
blocks, patterns, themes and capabilities every app needs — and nothing that
only one kind of app needs. Landing pages, commerce, editorial layouts, data
tables and the like live in packs built on top of it.

The pack is self-contained: every block it ships is placed by one of its own
patterns or showcase pages, so everything here can be rendered and tested
without another pack installed.

## What is inside

| Family | Count | Contents |
|---|---|---|
| Blocks | 33 | **layout** container, section, grid, split-view, navbar, bottom-bar · **text** heading, text, prose, alert · **control** button, link, icon, badge, chip, avatar, breadcrumb, divider · **form** form, input, textarea, select, segmented-control · **data** list, repeater, skeleton · **container** card, accordion · **feedback** spinner, toast · **media** image, video · **content** placeholder |
| Patterns | 25 | 8 page shells (top bar, bottom bar or no chrome × flow, grid, dense or split body), 7 bands (page header, card grid, contact form, callout row, brand mark, footer, legal footnote), 8 parts (feature card, callout, FAQ, empty state, icon chip, avatar group and row, pending need), 2 weaves |
| Themes | 2 | `theme-zinc` (light, neutral) and `theme-midnight` (dark) |
| Capabilities | 4 | `platform/entities`, `platform/interaction`, `platform/navigation`, `platform/persistence` |
| Connectors | 1 | the REST connector |
| Icons | 97 | the icon dictionary (`atoms/icons/icons.json`, Lucide artwork) |
| Showcase | 3 pages | `app/surfaces/`: forms, feedback and long-form content, plus a short video in `media/` |

Patterns are pure JSON arrangements of blocks — no code. Blocks are a
`manifest.json` plus a React `component.tsx`.

## Layout

```
foundation/
├── pwpack.json        pack identity: id, version, format, engine range, licence
├── package.json       scripts and dev dependencies
├── LICENSE, NOTICE
├── atoms/
│   ├── blocks/        <category>/<block>/{manifest.json, component.tsx}
│   ├── patterns/      <pattern>.json
│   ├── appearance/    theme-zinc, theme-midnight
│   ├── capabilities/  entities, interaction, navigation, persistence
│   ├── connectors/    the REST connector
│   ├── icons/         icons.json
│   └── lib/           code shared by the blocks
├── app/               showcase pages (surfaces/) and their media manifest
├── media/             showcase media files
├── scripts/           integrity checks and packaging
└── test/              behaviour tests for the blocks (Vitest + jsdom)
```

## Using it in an app

The pack runs on the PWFabric engine 1.x (`engines.pwfabric` in
`pwpack.json`). Build the archive below, then hand it to the `pwf` command
line from [pwfabric/pwfabric](https://github.com/pwfabric/pwfabric):

```sh
pwf create my-app --foundation /path/to/dist/foundation-1.0.0.pwpack
# or, in an existing app:
pwf add /path/to/dist/foundation-1.0.0.pwpack
```

The formats it follows are specified in
[pwfabric/spec](https://github.com/pwfabric/spec).

## Build and test

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm test        # pwpack.json check, integrity check, fabrication audit, Vitest
pnpm typecheck
pnpm build       # dist/foundation-<version>.tgz — the raw source archive
node scripts/export-tgz.mjs --canonical   # dist/foundation-<version>.pwpack
```

`--canonical` writes the canonical `.pwpack` archive: the folder exactly as it
sits on disk, packed deterministically, with its content hash checked by
reading the archive back. Both archives are deterministic — identical source
gives byte-identical output.

`scripts/check-integrity.mjs` is the structural gate: every block type, prop,
icon, slot and theme a pattern or page names must exist, and every block must
be placed somewhere. `scripts/audit-fabrications.mjs` looks for references to
things that do not exist.

## Licence

Apache-2.0 — see [LICENSE](LICENSE). Third-party material (the Lucide and
Feather icon artwork) is listed in [NOTICE](NOTICE).
