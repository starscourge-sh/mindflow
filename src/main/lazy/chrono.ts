import type * as Chrono from 'chrono-node'

// What main reads of chrono-node (task-words.ts), read the first time a date
// is asked for rather than as Haligtree opens: it takes about 30ms to load.
// electron.vite.config.ts points main's import of it here; the tests and the
// windows import the real one. It stays outside main's bundle (a dependency),
// so it can be required the moment it is needed, with nothing to wait for.
let real: typeof Chrono | undefined
const chrono = (): typeof Chrono => (real ??= require('chrono-node') as typeof Chrono)

export const parse: typeof Chrono.parse = (...args) => chrono().parse(...args)
export const parseDate: typeof Chrono.parseDate = (...args) => chrono().parseDate(...args)
/** The British reader (1/11 is the 1st of November), looked up when first used. */
export const en = { get GB() { return chrono().en.GB } } as unknown as typeof Chrono.en
/** Read now, while nothing is waiting, so the first date typed is read at once. */
export const warmChrono = (): void => void chrono()
