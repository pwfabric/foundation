/**
 * Surface Event Context
 *
 * Re-exports the canonical `SurfaceEventContext` from
 * `@pwfabric/runtime`. Creating a *local* context here would
 * produce a distinct React context object from the one the runtime's
 * `BehaviorSurfaceProvider` provides — so `useSurfaceEvents()` would read the
 * local default (`null`) and every `emit(...)` would no-op. Sharing the runtime
 * instance (via the embed `__PW_VENDOR__` singleton) is what lets block-emitted
 * bus events reach the surface renderer's dispatcher.
 *
 * @module @pwfabric/runtime/blocks/surface-event-context
 */

export { SurfaceEventContext } from '@pwfabric/runtime'
