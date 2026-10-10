/**
 * Block Component Types
 *
 * Minimal type definitions for block React components.
 * These types are structurally compatible with @pwfabric/runtime's
 * BlockComponent and BlockComponentRegistry types.
 *
 * @module @pwfabric/runtime/blocks/component-types
 */

import type { ReactNode } from 'react'
import type { Block } from '@pwfabric/contracts'
import type { BreakpointName } from '@pwfabric/core'

// ============================================================
// SURFACE EVENTS (minimal subset used by block components)
// ============================================================

/**
 * Surface event types emitted by block components
 */
export type BlockSurfaceEventType = 'click' | 'submit' | 'change' | 'navigate' | 'custom'

/**
 * Surface event emitted by block components
 */
export interface BlockSurfaceEvent {
  /** Event type */
  readonly type: BlockSurfaceEventType
  /** Block ID that triggered the event */
  readonly blockId: string
  /** Event payload */
  readonly payload?: unknown
  /** Original DOM event (if applicable) */
  readonly originalEvent?: Event
}

// ============================================================
// BLOCK CONTEXT (minimal subset needed by block components)
// ============================================================

/**
 * Minimal block rendering context available to block components.
 * Structurally compatible with @pwfabric/runtime's BlockContext.
 */
export interface BlockComponentContext {
  /** Event handler for block events */
  readonly onEvent?: ((event: BlockSurfaceEvent) => void) | undefined
  /** Current viewport breakpoint */
  readonly viewport?: BreakpointName
  /** Image adapter (optional, runtime-provided) */
  readonly imageAdapter?: unknown
  /** Capabilities (optional, runtime-provided) */
  readonly capabilities?: Map<string, unknown>
  /**
   * Interaction mode. `onEvent` is a pure
   * notification and always fires; `interactionMode` gates real SIDE-EFFECTS.
   * Blocks that perform real navigation or data writes (e.g.
   * `window.location.href`) MUST skip those when `interactionMode === 'inert'`
   * so editor/preview renders don't navigate or mutate. Defaults to `live`.
   */
  readonly interactionMode?: 'live' | 'inert'
}

// ============================================================
// BLOCK COMPONENT TYPES
// ============================================================

/**
 * Props passed to block components
 */
export interface BlockComponentProps<T = Record<string, unknown>> {
  /** Block instance */
  readonly block: Block
  /** Resolved props (validated and defaulted) */
  readonly props: T
  /** Rendered children (for container blocks) */
  readonly children?: ReactNode
  /** Block context */
  readonly context: BlockComponentContext
}

/**
 * Block component type
 */
export type BlockComponent<T = Record<string, unknown>> = (
  props: BlockComponentProps<T>
) => ReactNode

/**
 * Block component registry — maps block type strings to React component implementations
 */
export type BlockComponentRegistry = Record<string, BlockComponent>
