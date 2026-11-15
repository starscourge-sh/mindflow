import type * as Zod from 'zod'

// What main reads of zod (the check of each save, captures.ts), loaded once Haligtree has opened rather than as it
// opens: required as main started, it held every window back until it had loaded (qa/start-time.mjs).
// electron.vite.config.ts points main's import of it here; the tests import the real one.
let real: typeof Zod | undefined
const zod = (): typeof Zod => (real ??= require('zod') as typeof Zod)
/** zod's `z`, each part looked up as it is first used. */
export const z = new Proxy({} as typeof Zod.z, { get: (_, part) => zod().z[part as keyof typeof Zod.z] })
/** Read now, while nothing is waiting, so the first save is checked at once. */
export const warmZod = (): void => void zod()
