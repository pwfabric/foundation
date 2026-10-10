export interface EntityBinding {
  readonly entityType: string
  /** Which registered connector resolves this entityType (a connector atom's `connection`). */
  readonly connector: string
}

/** The connector an entity source without one is read through: foundation's own REST connector. */
const DEFAULT_CONNECTOR = 'rest'

/**
 * Reads which real entityTypes a surface needs from its native
 * `platform/persistence` capability's `config.dataSources` — plain
 * `kind:"entity"` entries, the same shape any receipt-authored entity
 * dataSource uses. No pack-specific capability declaration needed.
 *
 * `dataSources[].connector` (a free-form field on the entity source's config
 * — not part of pwfabric-runtime's typed SurfaceDataSourceDefinition, same
 * "extra field on a free-form config object" pattern used throughout this
 * pack) picks which registered EntityConnector resolves it — any connector
 * atom's `connection` (foundation ships "rest"; a provider pack adds its own).
 * Missing/absent defaults to "rest".
 */
export function extractEntityTypes(surface: {
  readonly capabilities?: readonly { readonly capability?: string; readonly config?: Record<string, unknown> }[]
}): readonly EntityBinding[] {
  const binding = surface.capabilities?.find((c) => c?.capability === 'platform/persistence')
  const dataSources =
    (binding?.config?.dataSources as
      | readonly { kind?: string; entityType?: string; connector?: string }[]
      | undefined) ?? []

  const seen = new Set<string>()
  const bindings: EntityBinding[] = []
  const add = (entityType: string | undefined, connector: string): void => {
    if (!entityType) return
    const key = `${connector}:${entityType}`
    if (seen.has(key)) return
    seen.add(key)
    bindings.push({ entityType, connector })
  }

  for (const d of dataSources) {
    if (d.kind !== 'entity' || !d.entityType) continue
    add(d.entityType, d.connector ?? DEFAULT_CONNECTOR)
  }

  // WRITE side (form→entity bridge): a form-only page declares no read
  // dataSources, but its `platform/entities` capability's formBindings still
  // need the target entityType REGISTERED in the facade — EntityStore.create
  // refuses unregistered types (registry.has gate). `formBindings[].connector`
  // picks the write target (a form can write through a provider's
  // connector); missing/absent defaults to the same connector as a read.
  const entitiesCap = surface.capabilities?.find((c) => c?.capability === 'platform/entities')
  const formBindings =
    (entitiesCap?.config?.formBindings as readonly { entityType?: string; connector?: string }[] | undefined) ?? []
  for (const fb of formBindings) add(fb.entityType, fb.connector ?? DEFAULT_CONNECTOR)

  return bindings
}
