/**
 * platform/entities capability (pack atom)
 *
 * Schema-driven entity definitions, CRUD store, and connector abstraction.
 * Ships in the foundation pack.
 *
 * @module capabilities/entities/handler
 */

import { defineCapability, passthroughContract } from '@pwfabric/core'

// configSchema now lives in manifest.json (JSON) — definitions are JSON,
// only real executable logic stays here.
//
// Scope reminder: entities is for data that lives in OUR OWN store — never
// for external read-only sources such as a vendor's list API (those go
// through a connector + platform/persistence).

export const entitiesCapability = defineCapability()
  .id('platform/entities')
  .name('Entity System')
  .description('Schema-driven entity definitions, CRUD store, connector abstraction')
  .version('1.0.0')
  .state('stable')
  .tags(['entities', 'schema', 'crud'])
  .contract(passthroughContract)
  .execute(async () => ({ success: true }))
  .build()
