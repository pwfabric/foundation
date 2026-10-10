/**
 * platform/interaction capability (pack atom)
 *
 * Event-driven interaction rules. Attach triggers and actions to surface
 * events for interactive, dynamic surfaces. Ships in the foundation pack.
 *
 * @module capabilities/interaction/handler
 */

import { defineCapability, passthroughContract } from '@pwfabric/core'

// configSchema now lives in manifest.json (JSON) — definitions are JSON,
// only real executable logic stays here.

export const interactionCapability = defineCapability()
  .id('platform/interaction')
  .name('Interaction Rules')
  .description(
    'Event-driven interaction rules — attach triggers and actions to surface events for interactive, dynamic surfaces'
  )
  .version('1.0.0')
  .state('stable')
  .tags(['interaction', 'events', 'automation'])
  .contract(passthroughContract)
  .execute(async () => ({ success: true }))
  .build()
