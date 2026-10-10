/**
 * CONNECTOR AND PROVIDER REGISTRY — generic code never calls a specific
 * connector BY NAME.
 *
 * Importing one connector by file name, e.g.
 *
 *   import vendorAtom from '../connectors/VendorConnector.knowledge.json'
 *
 * has two costs:
 *
 *  1. The vendor integration cannot move into its own pack. Once it does, the
 *     build fails with "Could not resolve '../connectors/VendorConnector.knowledge.json'".
 *     As long as the generic layer holds the specific one by name, the
 *     specific one cannot be separated.
 *
 *  2. Multi-pack assembly cannot carry source files. The overlay prefixes the
 *     atom leaf (`@vendor.VendorConnector.knowledge.json`); that is fine
 *     for data files, which are loaded by content, but not for source imported
 *     BY PATH, because the importer's path is fixed.
 *
 * This module solves both: the directory is SCANNED and file names are never
 * used. The key is the atom's OWN declaration (`connection`), e.g.
 * `rest` or a vendor's connection name, so a prefixed file lands on the same key. Since the
 * glob ignores names, the overlay limit goes away.
 *
 * The abstraction is deliberately NOT generalised: a plugin API designed
 * around a single provider would be guesswork. This module only ENUMERATES;
 * the shape gets tested against a real need when a second provider arrives.
 */

/** The part of a connector atom the registry reads. */
export interface ConnectorAtom {
  readonly name: string
  readonly connection: string
  readonly engine?: unknown
}

// This module lives in atoms/lib/connectors/ (shared code, not an atom);
// the connector atoms it scans stay in atoms/connectors/, the providers in
// atoms/providers/. On the wire (families at the tgz root) the same relative
// path holds: lib/connectors/ -> ../../connectors/.
const atomModules = import.meta.glob('../../connectors/*.knowledge.json', { eager: true }) as Record<
  string,
  { default: ConnectorAtom }
>

/** `connection` → atom. The key is the atom's own declaration, NOT its file name. */
export const connectorAtoms: Record<string, ConnectorAtom> = Object.fromEntries(
  Object.values(atomModules)
    .map((m) => m.default)
    .filter((a): a is ConnectorAtom => Boolean(a?.connection))
    .map((a) => [a.connection, a])
)

/**
 * The engine declaration of a connection, or `undefined`.
 *
 * Absence is NOT an error: if the pack is not installed the connection does
 * not exist either, and the caller already takes its "connection not
 * configured" branch. Throwing here would break every workspace that does not
 * install the provider pack.
 */
export function engineFor(connection: string): unknown | undefined {
  return connectorAtoms[connection]?.engine
}

/** The surface a provider module exposes to the registry. */
export interface ProviderModule {
  readonly connToDomain?: Record<string, string>
  readonly domains?: Record<string, Record<string, { scope: string | string[] }>>
  readonly createConnector?: (getAccessToken: () => Promise<string | null>) => unknown
}

const providerModules = import.meta.glob('../../providers/*/index.ts', { eager: true }) as Record<
  string,
  ProviderModule
>

export const providers: ProviderModule[] = Object.values(providerModules)

/** Union of every provider's connection → domain map. */
export const connToDomain: Record<string, string> = Object.assign(
  {},
  ...providers.map((p) => p.connToDomain ?? {})
)

/**
 * Build the engine of the provider that recognises the connection, or null if
 * none does. No installed pack means no connection; the caller treats that as
 * a branch.
 */
export function createConnectorFor(
  connectionName: string,
  getAccessToken: () => Promise<string | null>
): unknown | null {
  for (const p of providers) {
    if (p.connToDomain?.[connectionName] && p.createConnector) return p.createConnector(getAccessToken)
  }
  return null
}

/** Union of every provider's domain map — scopes are derived from this. */
export const domains: Record<string, Record<string, { scope: string | string[] }>> = Object.assign(
  {},
  ...providers.map((p) => p.domains ?? {})
)
