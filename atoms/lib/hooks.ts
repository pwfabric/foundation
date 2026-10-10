/**
 * Block Component Hooks
 *
 * Re-exports the canonical event hooks from `@pwfabric/runtime`.
 *
 * IMPORTANT (event-bus identity): these hooks MUST resolve to the SAME module
 * objects the runtime's `BehaviorSurfaceProvider` uses. The provider sets the
 * `SurfaceEventBus` on the runtime's `SurfaceEventContext`; if a block read a
 * *locally-created* context instead, `useContext` would return the default
 * `null` and `emit(...)` would silently no-op — the bus event (incl. a form's
 * declarative `payload.action`) would never reach the renderer's dispatcher.
 *
 * At embed runtime the block-bundler rewrites the bare
 * `@pwfabric/runtime` specifier to the shared
 * `globalThis.__PW_VENDOR__` singleton, so every dynamically-loaded block shares
 * exactly the runtime's context instances (one React dispatcher, one bus, one
 * connections registry).
 *
 * `useSurfaceConnections` is the SAME single-dialect seam: it
 * reads the host's `SurfaceConnectionsContext`, so a block's connector/provider
 * engine is the very one the host loaded + token-wired — no runner-global
 * on the platform.
 *
 * @module @pwfabric/runtime/blocks/hooks
 */

import * as React from 'react'
import * as runtime from '@pwfabric/runtime'

export const useSurfaceEvents = runtime.useSurfaceEvents
export const useSurfaceId = runtime.useSurfaceId

/**
 * DEFENSIVE. `useSurfaceConnections` is a newer runtime export.
 * If a host's `__PW_VENDOR__` runtime predates it, the property is
 * `undefined`; calling it would throw and take down every block that imports
 * `_shared-utils`. Fall back to a null-returning stub so blocks degrade
 * honestly (no connector data) instead of crashing — byte-identical to the
 * legacy "no bridge" path.
 */
/**
 * Shell × body — SPLIT shell selection, projected onto the URL by the runtime.
 *
 * DEFENSIVE for the same reason `useSurfaceConnections` is: this is a newer
 * runtime export, and a host whose `__PW_VENDOR__` runtime predates it would
 * hand back `undefined`. Calling that would throw and take down every block
 * importing this module. The fallback is a plain local `useState` — the split
 * still selects, it just does not reach the address bar, which is exactly the
 * degradation an old host can honestly offer.
 */
export const useShellSelection: (
  key: string,
  options?: { fallback?: string | undefined; syncUrl?: boolean }
) => readonly [string | undefined, (id: string | undefined) => void] =
  (runtime as { useShellSelection?: typeof useShellSelection }).useShellSelection ??
  ((_key, options) => {
    const [id, setId] = React.useState<string | undefined>(undefined)
    return [id ?? options?.fallback, setId] as const
  })

export const useSurfaceConnections: () => {
  readonly connections: readonly { readonly name: string }[]
  readonly engines: { resolve(name: string): Promise<unknown> } | null
} | null =
  (runtime as { useSurfaceConnections?: typeof useSurfaceConnections })
    .useSurfaceConnections ?? (() => null)
