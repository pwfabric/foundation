/**
 * WRITTEN BY THE APP, NOT BY THIS PACK.
 *
 * `active-project` is emitted into the consuming app at assembly time — it
 * carries that app's identity binding and its declared connections. Inside the
 * pack it never exists, so two files imported a module that resolved nowhere
 * and TypeScript had no way to check them at all.
 *
 * Declaring the shape here is the honest half of that arrangement: the pack
 * states what it expects the app to provide, the app provides it, and both
 * halves can be checked against the same sentence. The alternative — excluding
 * those files from the typecheck — would hide every real error in them to
 * avoid admitting one contract.
 *
 * IDENTITY VALUES NEVER LIVE HERE. `authDef` carries an ADDRESS (which
 * directory tenant, which client, which scopes): where the source is, never
 * who we are.
 */
/** The app's identity binding — addresses and scopes, never secrets. */
export const authDef: {
  readonly tenantId: string
  readonly clientId: string
  readonly scopes?: readonly string[]
  readonly redirectPath: string
}

/** The connections the app declared, by name, with their config. */
export const connectionsDef: {
  readonly connections: readonly {
    readonly name: string
    /** Which engine serves this connection — a connector atom's `connection`. */
    readonly connector?: string
    readonly config?: Record<string, unknown>
    readonly engine?: unknown
  }[]
}
