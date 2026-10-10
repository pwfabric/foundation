/**
 * Provider-agnostic bridge — ONE config-driven loop instead of enumerating each
 * facet by hand in the auth provider. Whatever `connections.json` declares is
 * published as a facet.
 *
 * KEY POINT: atom generation never edits the auth provider (no hand-added
 * import + hasX + facet spread); it only adds a declaration to
 * connections.json and the bridge wires it up. That removes the one step where
 * generated code would touch auth code. All facets are also aliases of ONE
 * engine instance per provider.
 */
// NO NAMED PROVIDER IMPORT. Importing a provider by name would tie this pack
// to it; the registry finds providers by SCANNING — see
// ../connectors/registry.ts
import { connToDomain, domains, createConnectorFor } from '../connectors/registry'

export interface Connection {
  readonly name: string
  readonly connector?: string
}

export interface Bridge {
  /** facet name → engine (the block dispatches by entityType). */
  readonly facets: Record<string, unknown>
  /** UNION of the scopes of every declared domain = the consent manifest. */
  readonly scopes: readonly string[]
}

/** One loop: each declared connection → facet + scopes. One engine instance. */
export function buildFacets(
  connections: readonly Connection[],
  getAccessToken: () => Promise<string | null>,
): Bridge {
  // The engine comes from the installed provider that recognises the
  // connection; without one it is null and no facet is published — an
  // undeclared connection stays quietly empty. One engine per provider: every
  // domain of a provider shares it and is reached via .query(entityType).
  const engines = new Map<string, unknown>()
  const engineFor = (name: string): unknown | null => {
    if (!engines.has(name)) engines.set(name, createConnectorFor(name, getAccessToken))
    return engines.get(name) ?? null
  }
  const facets: Record<string, unknown> = {}
  const scopes = new Set<string>()

  for (const conn of connections) {
    const domain = connToDomain[conn.name] ?? conn.name
    const engine = engineFor(conn.connector ?? conn.name)
    if (engine) facets[domain] = engine
    for (const def of Object.values(domains[domain] ?? {})) {
      for (const s of Array.isArray(def.scope) ? def.scope : [def.scope]) scopes.add(s)
    }
  }
  return { facets, scopes: [...scopes] }
}
