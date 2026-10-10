/**
 * platform/persistence capability (pack atom)
 *
 * Data fetching, mutation, persistence operations, and client-side state
 * management with optional local-storage persistence. Ships in the
 * foundation pack.
 *
 * @module capabilities/persistence/handler
 */

import { defineCapability, passthroughContract } from '@pwfabric/core'
import { createDataService } from '@pwfabric/runtime/data'

// configSchema now lives in manifest.json (JSON) — definitions are JSON,
// only real executable logic stays here.

export const persistenceCapability = defineCapability()
  .id('platform/persistence')
  .name('Data & State Persistence')
  .description('Data fetching, mutation, persistence operations, and client-side state management')
  .version('1.0.0')
  .state('stable')
  .tags(['data', 'state', 'persistence', 'api'])
  .contract(passthroughContract)
  .execute(async (config) => {
    const cfg = config as Record<string, unknown> | undefined
    return createDataService({
      ...(cfg?.defaultCacheTtl != null ? { defaultCacheTtl: cfg.defaultCacheTtl as number } : {}),
      ...(cfg?.maxRetries != null ? { maxRetries: cfg.maxRetries as number } : {}),
      ...(cfg?.timeout != null ? { timeout: cfg.timeout as number } : {}),
    })
  })
  .build()
