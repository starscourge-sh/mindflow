import { join, resolve, sep } from 'path'

/** The data folder's names, new and old (old-data.ts): a test run must never open any of them. */
const NAMES = ['haligtree', 'mindflow', 'vigil']

/** Is this path one of your real data folders (or inside one), under either name? */
export function isRealFolder(path: string, appData: string): boolean {
  const asked = resolve(path).toLowerCase()
  return NAMES.some((name) => {
    const root = join(appData, name).toLowerCase()
    return asked === root || asked.startsWith(root + sep)
  })
}

/**
 * Why this run must not start, or null. A test run (the probes set
 * HALIGTREE_QA_AWAY) always brings a data folder of its own, and no run is
 * ever pointed at a real one: on 2026-09-14 a size test left 5 GB of
 * made-up pictures in yours.
 */
export function refuseRun(env: Record<string, string | undefined>, appData: string): string | null {
  const given = env.HALIGTREE_USER_DATA
  if (given && isRealFolder(given, appData)) return `HALIGTREE_USER_DATA is your real data folder (${given})`
  if (env.HALIGTREE_QA_AWAY !== undefined && !given) return 'a test run (HALIGTREE_QA_AWAY) has no data folder of its own (HALIGTREE_USER_DATA)'
  return null
}
