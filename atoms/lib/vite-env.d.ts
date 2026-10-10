/**
 * `import.meta.glob` DECLARATION.
 *
 * `connectors/registry.ts` finds connector and provider atoms by scanning —
 * no named imports, because a named import is exactly what kept a vendor pack
 * from being split out of this one. The scan uses Vite's `import.meta.glob`,
 * which is a BUILD-TIME transform: the type system does not know it by itself.
 *
 * Only the signature in use is declared instead of pulling in `vite/client`
 * types: this pack does not depend on Vite, the consumer THAT BUILDS IT does.
 * Putting `"types": ["vite/client"]` here would declare a dependency the pack
 * does not own.
 */
interface ImportMeta {
  readonly glob: <T = unknown>(
    pattern: string,
    options?: { eager?: boolean }
  ) => Record<string, T>
}
