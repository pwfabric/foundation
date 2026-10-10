/**
 * platform/navigation capability (pack atom)
 *
 * Multi-page surface navigation, base-path configuration, and route handling.
 * Ships in the foundation pack.
 *
 * @module capabilities/navigation/handler
 */

import { defineCapability, passthroughContract } from '@pwfabric/core'

// configSchema now lives in manifest.json (JSON) — definitions are JSON,
// only real executable logic stays here.

export const navigationCapability = defineCapability()
  .id('platform/navigation')
  .name('Navigation')
  .description('Multi-page surface navigation, base path configuration, and route handling')
  .version('1.0.0')
  .state('stable')
  .tags(['navigation', 'routing', 'url'])
  .contract(passthroughContract)
  .execute(async (input) => {
    const data = input as Record<string, unknown> | undefined
    const path = (data?.path as string) ?? '/'
    const config = (data?.config as Record<string, unknown>) ?? {}
    const basePath = (config.basePath as string) ?? '/'
    const trailingSlash = (config.trailingSlash as boolean) ?? false
    let resolvedPath = path.startsWith(basePath) ? path : `${basePath}${path}`.replace(/\/+/g, '/')
    if (trailingSlash && !resolvedPath.endsWith('/')) resolvedPath += '/'
    else if (!trailingSlash && resolvedPath.length > 1 && resolvedPath.endsWith('/'))
      resolvedPath = resolvedPath.slice(0, -1)
    return { resolvedPath, params: {} }
  })
  .build()
