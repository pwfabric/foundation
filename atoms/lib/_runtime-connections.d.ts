/**
 * Runtime connections-context type augmentation.
 *
 * The platform host (rc.45+) exposes the surface CONNECTIONS CONTEXT
 * (`SurfaceConnectionsContext` + `useSurfaceConnections`). This
 * pack is authored against an older runtime type surface, and its blocks reach
 * the host runtime at RUNTIME through the shared `globalThis.__PW_VENDOR__`
 * singleton (the block-bundler rewrites the bare
 * `@pwfabric/runtime` specifier). To keep the source
 * type-clean without a risky full dependency bump, we declare the connections
 * surface here — the impl always comes from the host's runtime.
 *
 * Shape mirrors the runtime's `render/connections-context` + `connectors/types`
 * exactly (single dialect).
 *
 * @module blocks/_runtime-connections
 */
import '@pwfabric/runtime'

declare module '@pwfabric/runtime' {
  /** One connection as blocks/the renderer see it (name/connector/config). */
  export interface SurfaceConnection {
    readonly name: string
    readonly connector?: string
    readonly config?: Readonly<Record<string, unknown>>
    readonly status?: string
    readonly authProviderRef?: string
  }

  /** Connection name → constructed engine; `resolve` loads the bundle lazily
   *  and NEVER throws (a failed load resolves `null`). */
  export interface ConnectorEngineRegistry {
    resolve(connection: string): Promise<unknown | null>
  }

  /** Value carried by `SurfaceConnectionsContext` / the renderer's `connections`
   *  prop. `engines` may be null when the host provides the connections doc but
   *  no loaded engines yet. */
  export interface SurfaceConnectionsValue {
    readonly connections: readonly SurfaceConnection[]
    readonly engines: ConnectorEngineRegistry | null
  }

  /** Returns the connections context from the nearest provider, or `null` when
   *  the host didn't opt in (legacy render). */
  export function useSurfaceConnections(): SurfaceConnectionsValue | null
}
