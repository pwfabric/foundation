/**
 * Surface ID Context
 *
 * Re-exports the canonical `SurfaceIdContext` from
 * `@pwfabric/runtime` so blocks read the same instance the
 * runtime's `BehaviorSurfaceProvider` populates (shared via the embed
 * `__PW_VENDOR__` singleton). A locally-created context would always yield the
 * default empty string regardless of the rendered surface's ID.
 *
 * @module @pwfabric/runtime/blocks/surface-id-context
 */

export { SurfaceIdContext } from '@pwfabric/runtime'
