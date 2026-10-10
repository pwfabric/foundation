// THE PACK FOLDER — one place that knows where a pack keeps what.
//
//   <pack>/
//   ├── pwpack.json        identity (id, version, requires, license)
//   ├── app/               the pack's own demo composition (surfaces/…), if any
//   └── atoms/             the atom families, rootless on the wire
//       ├── blocks/ capabilities/ connectors/ providers/ appearance/
//       ├── patterns/ icons/ surfaces/ auth/
//       └── lib/           shared code (_shared-*, hooks, component-types …)
//
// Every script in this repo that reads a pack goes through these helpers, so
// the layout is written down once. `src/` is gone: nothing here falls back to
// it, because a script that silently reads an old folder is how two layouts
// end up both "working".
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The atoms root of a pack — the directory the wire's families come from. */
export const atomsDir = (packRoot) => join(packRoot, 'atoms')

/** Shared code — compiler companions, never an atom (`kind: 'lib'`). */
export const libDir = (packRoot) => join(packRoot, 'atoms', 'lib')

/** The pack's own demo composition (`app/surfaces/…`), when it has one. */
export const appDir = (packRoot) => join(packRoot, 'app')

/** One atom family: `atoms/<family>`. */
export const familyDir = (packRoot, family) => join(packRoot, 'atoms', family)

/**
 * Where a pack's surface receipts live. A shelf recipe is an atom
 * (`atoms/surfaces/`); a demo site's pages are the pack's app
 * (`app/surfaces/`). A pack carries one or the other; readers that judge
 * receipts read whichever exists (shelf first).
 */
export const surfaceDirs = (packRoot) =>
  [join(packRoot, 'atoms', 'surfaces'), join(packRoot, 'app', 'surfaces')].filter((d) => existsSync(d))

/** The single surfaces directory a reader should use (shelf first, then app). */
export const surfacesDir = (packRoot) => surfaceDirs(packRoot)[0] ?? join(packRoot, 'atoms', 'surfaces')
