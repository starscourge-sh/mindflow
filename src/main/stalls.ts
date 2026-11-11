import { app, ipcMain, protocol } from 'electron'
import { monitorEventLoopDelay } from 'node:perf_hooks'

/**
 * The main process names its own stalls. Its one thread runs every handler a
 * window calls, moves every window, and answers each window's blocking calls
 * (a spelling question, a `sendSync`): a job that keeps it for ten seconds
 * freezes them all, and nothing said which job. So every handler
 * (`ipcMain.handle`, `on`, `once`), every file the pages are served
 * (`protocol.handle`), every repeating timer (timers.ts) and any job wrapped
 * in `named` is timed for as long as it holds the thread, kept per name
 * (calls, time, the worst), with the ones of `SLOW` or more in order. Beside
 * them the event loop's own delay, which also counts what has no name. The
 * freeze log quotes it (freeze-catch.ts); a development or test run reads it
 * with `globalThis.mainStalls()`. A clock read before and after each call:
 * cheap enough to stay on always. Imported before anything registers.
 */

/** Held this long (ms), a job is a stall: a frame is 16, and a press should show within 100. */
export const SLOW = 50

type Row = { name: string; calls: number; ms: number; worst: number; slow: number; waited: number }
const rows = new Map<string, Row>()
/** The stalls so far, oldest first (the last 300). */
const slow: { name: string; ms: number; at: number }[] = []
/** What is in hand: a job on the thread now, or one whose answer is still awaited. */
const running = new Map<number, { name: string; since: number }>()
let ids = 0

function spent(row: Row, began: number): void {
  const ms = performance.now() - began
  row.calls++
  row.ms += ms
  if (ms > row.worst) row.worst = ms
  if (ms < SLOW) return
  row.slow++
  slow.push({ name: row.name, ms: Math.round(ms), at: Date.now() })
  if (slow.length > 300) slow.shift()
}

/** Run a job under its name: the time it holds main's thread is counted, and how long its answer took when it is a promise. */
export function named<T>(name: string, run: () => T): T {
  let row = rows.get(name)
  if (!row) rows.set(name, (row = { name, calls: 0, ms: 0, worst: 0, slow: 0, waited: 0 }))
  const id = ++ids
  const began = performance.now()
  running.set(id, { name, since: Date.now() })
  let out: T
  try {
    out = run()
  } catch (error) {
    running.delete(id)
    spent(row, began)
    throw error
  }
  spent(row, began)
  if (out && typeof (out as { then?: unknown }).then === 'function') {
    const kept = row
    const settled = (): void => {
      running.delete(id)
      kept.waited = Math.max(kept.waited, performance.now() - began)
    }
    ;(out as unknown as Promise<unknown>).then(settled, settled)
  } else running.delete(id)
  return out
}

// Every handler, wrapped where it is registered: one place, whichever file registers it.
type Listener = (event: never, ...args: never[]) => unknown
const timedBy = new WeakMap<Listener, Listener>()
const timed = (channel: string, listener: Listener): Listener => {
  const run = ((event: never, ...args: never[]) => named(channel, () => listener(event, ...args))) as Listener
  timedBy.set(listener, run)
  return run
}
for (const kind of ['handle', 'handleOnce', 'on', 'once'] as const) {
  const add = ipcMain[kind].bind(ipcMain) as (channel: string, listener: Listener) => unknown
  ;(ipcMain as unknown as Record<string, unknown>)[kind] = (channel: string, listener: Listener) => add(channel, timed(channel, listener))
}
// A listener taken off again is taken off by the function it was given as.
for (const kind of ['off', 'removeListener'] as const) {
  const remove = ipcMain[kind].bind(ipcMain) as (channel: string, listener: Listener) => unknown
  ;(ipcMain as unknown as Record<string, unknown>)[kind] = (channel: string, listener: Listener) => remove(channel, timedBy.get(listener) ?? listener)
}
// The files a page is served (pictures, recordings, documents), named by their store.
const serve = protocol.handle.bind(protocol)
protocol.handle = (scheme, handler) =>
  serve(scheme, (request) => named(`${scheme}://${/^[a-z]+:\/\/([^/?#]*)/.exec(request.url)?.[1] ?? ''}`, () => handler(request)))

/**
 * How late the event loop ran: whatever held the thread, named or not. Read finely in a development or test run (a
 * tick every 10 ms), coarsely in the app as shipped (every 50 ms: a stall worth a line in a log is far longer).
 */
const delay = monitorEventLoopDelay({ resolution: app.isPackaged && !process.env.HALIGTREE_QA_AWAY ? 50 : 10 })
delay.enable()

export type Stalls = {
  /** The event loop's delay since this was last read, in ms. */
  delay: { worst: number; mean: number; most: number }
  /** In hand now: on the thread, or its answer awaited. */
  running: { name: string; seconds: number }[]
  /** Every stall of SLOW or more, oldest first. */
  slow: { name: string; ms: number; at: number }[]
  /** Every name, the worst first. */
  rows: Row[]
}

/** The table, and the delay since it was last read (reading starts the delay afresh). */
export function stalls(): Stalls {
  const ms = (nanos: number): number => (Number.isFinite(nanos) ? Math.round(nanos / 1e5) / 10 : 0)
  const out: Stalls = {
    delay: { worst: delay.count ? ms(delay.max) : 0, mean: delay.count ? ms(delay.mean) : 0, most: delay.count ? ms(delay.percentile(99)) : 0 },
    running: [...running.values()].map((one) => ({ name: one.name, seconds: Math.round((Date.now() - one.since) / 100) / 10 })),
    slow: [...slow],
    rows: [...rows.values()].map((row) => ({ ...row, ms: Math.round(row.ms), worst: Math.round(row.worst * 10) / 10, waited: Math.round(row.waited) })).sort((a, b) => b.worst - a.worst)
  }
  delay.reset()
  return out
}

/** The same in words, for the freeze log: what main had in hand, what held its thread in the last minute, the slowest this run. */
export function stallReport(): string {
  const now = stalls()
  const minute = now.slow.filter((one) => one.at >= Date.now() - 60_000)
  const line = (row: Row): string => `    ${String(row.worst).padStart(8)} ms worst  ${String(row.calls).padStart(6)} calls  ${String(row.ms).padStart(7)} ms in all  ${row.slow ? `${row.slow} of ${SLOW} ms or more  ` : ''}${row.name}`
  return [
    'The main process (its one thread also answers every window):',
    `  event loop delay since last asked: worst ${now.delay.worst} ms, mean ${now.delay.mean} ms, 99 in 100 under ${now.delay.most} ms`,
    `  in hand now: ${now.running.length ? now.running.map((one) => `${one.name} (${one.seconds} s)`).join(', ') : 'nothing'}`,
    minute.length
      ? `  held its thread ${SLOW} ms or more in the last minute:\n${minute.map((one) => `    ${String(one.ms).padStart(8)} ms  ${new Date(one.at).toISOString().slice(11, 23)}  ${one.name}`).join('\n')}`
      : `  nothing with a name held its thread ${SLOW} ms or more in the last minute`,
    `  the slowest this run:\n${now.rows.slice(0, 12).map(line).join('\n')}`
  ].join('\n')
}

// A development or test run reads the table, and can ask where the thread's time went (a CPU profile of main itself).
if (!app.isPackaged || process.env.HALIGTREE_QA_AWAY) {
  type Session = import('node:inspector').Session
  let session: Session | null = null
  Object.assign(globalThis, {
    mainStalls: stalls,
    mainProfile: async (on: boolean): Promise<unknown> => {
      const { Session } = await import('node:inspector')
      const post = (method: string, params?: object): Promise<unknown> => new Promise((done, failed) => session!.post(method, params, (error, said) => (error ? failed(error) : done(said))))
      if (on) {
        session = new Session()
        session.connect()
        await post('Profiler.enable')
        await post('Profiler.setSamplingInterval', { interval: 500 })
        return post('Profiler.start')
      }
      if (!session) return null
      const said = await post('Profiler.stop')
      session.disconnect()
      session = null
      return said
    }
  })
}
