# capabilities/ — capability atoms (SOURCE)

A capability is `capabilities/<name>/handler.ts` (the
`defineCapability().build()` convention) + a sibling `manifest.json`
(`AtomFileManifest`, `kind: 'capability'`).

Foundation ships four:

| id | what it does |
|---|---|
| `platform/entities` | schema-driven entity definitions, a CRUD store and the connector abstraction |
| `platform/interaction` | event-driven interaction rules — triggers and actions on surface events |
| `platform/navigation` | multi-page navigation, base-path configuration and route handling |
| `platform/persistence` | data fetching, mutation and client-side state, with optional local-storage persistence |

## JSON vs. TS convention

**Definitions and consumption are JSON. Only real executable logic is TS.**

- `manifest.json` → `configSchema` (field shapes: type/label/description/default/min/max/options) lives here, as plain JSON — NOT built with `defineConfigSchema()`'s TS fluent API. Every capability in this directory follows this.
- A surface's `capabilities[]` array → how that surface *uses* (configures) a capability instance — also JSON.
- `handler.ts` → only the real `execute()` logic (when there is any) and the `defineCapability()` chain that references the JSON manifest's other fields (id/name/description/tags/contract). No inline `defineConfigSchema()` calls.

## `entities` vs. connectors — a real boundary, not just naming

`platform/entities` is for data that lives in the host's **own** store (schema-driven, CRUD, lifecycle hooks). It is never the right place for an external, read-only REST source — that is a connector's job (see `../connectors/`). A connector defines *how* to reach an external source (for example a vendor's list API with user-token auth); it composes with `platform/persistence`'s `DataService` for the actual fetch and never touches `platform/entities`.
