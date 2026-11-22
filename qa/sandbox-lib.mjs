// Shared for the sandbox runs: open the app (QA_ARGS says whether it is the
// sandbox), find the main window, wait for the seed, and a few helpers.
import { open } from './harness.mjs'

/** The clock moved by `offset` ms, in whichever process runs it (main or a window). */
export function shiftClock(offset) {
  const Real = globalThis.__realDate ?? Date
  globalThis.__realDate = Real
  class Shifted extends Real {
    constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset) }
    static now() { return Real.now() + offset }
  }
  globalThis.Date = Shifted
}

/**
 * A quiet hour for quick capture's probes: mid-afternoon, when no practice is offered at the hour. In the evening
 * the box offers one ("21:00 Read twenty pages before bed") and, while it is up, the box is not the one-line pill, so
 * a probe of the pill passed or failed by the real clock. Every pill probe runs at this hour: `sandbox({ at: CALM_HOUR })`.
 */
export const CALM_HOUR = '14:10'

/**
 * `at: 'HH:MM'` runs the app as if it were that time today, in the main
 * process and every window, so a probe that depends on the hour (the evening,
 * the small hours) reads the same whatever the real clock says. `now()` is
 * the probe's own clock, moved the same way.
 */
/**
 * Waits until the sandbox is wholly laid down. It used to give up after 30 seconds and carry on: on a busy machine
 * the seeding (which makes Writing's folders near its end) outlasted that, and probes read a half-made book, its pages
 * there and its folders not (folders-isolate: "nnn", then no folder to open). Now it waits up to 3 minutes, says how
 * long seeding took, and stops the probe with a plain error rather than test a half-made book.
 */
async function untilSeeded(read, h) {
  const started = Date.now()
  while (Date.now() - started < 180_000) {
    const state = await read()
    if (state?.seeded || (state && !state.on)) {
      if (Date.now() - started > 10_000) console.log(`(sandbox took ${Math.round((Date.now() - started) / 1000)}s to seed)`)
      return
    }
    await h.waitForTimeout(200)
  }
  throw new Error('The sandbox was not seeded after 3 minutes: not testing a half-made book')
}

/** `weekday` (0 is Sunday) with `at`: that time on the coming such day, today if it is one (the Sunday week card). */
export async function sandbox({ width = 1000, height = 700, seeded = true, at, weekday } = {}) {
  const qa = await open()
  const { electron, page } = qa
  const errors = []
  const homeWindow = async () => {
    for (let i = 0; i < 100; i++) {
      const h = electron.windows().find((w) => w.url().includes('view=home'))
      if (h) return h
      await page.waitForTimeout(200)
    }
    throw new Error('no main window')
  }
  let offset = 0
  if (at) {
    const [hour, minute] = at.split(':').map(Number)
    const target = new Date()
    target.setHours(hour, minute, 0, 0)
    if (weekday !== undefined) target.setDate(target.getDate() + ((weekday - target.getDay() + 7) % 7))
    offset = target.getTime() - Date.now()
    await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
    await electron.context().addInitScript(`(${shiftClock.toString()})(${offset})`)
  }
  const h = await homeWindow()
  if (at) {
    await h.waitForLoadState('domcontentloaded')
    // Reloaded only once the window has settled: a reload in its first
    // moments, while the sandbox is still being laid down, sometimes takes the
    // renderer down inside Electron itself (about one run in eight), which no
    // person does and no app code causes.
    await untilSeeded(() => h.evaluate(() => window.api.haligtree('sandbox:state')).catch(() => null), h)
    await h.waitForTimeout(1000)
    await h.reload()
    await page.reload().catch(() => {})
  }
  h.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  h.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
  page.on('pageerror', (e) => errors.push('BOX PAGEERROR ' + e.message))
  await h.waitForLoadState('domcontentloaded')
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
  if (seeded) await untilSeeded(() => v('sandbox:state').catch(() => null), h)
  // The sandbox's reminder ("Call Mr Wolf", set by the seed for tomorrow at 9:00) pins itself once it is due, on the
  // app's one-minute look at reminders (src/main/haligtree.ts). A seeded copy kept for days has it overdue, so a minute
  // into every run a new row landed at the top of the sidebar's Pinned and pushed every pin and tag under it down one
  // row: whichever probe was comparing boxes at that second failed a line. Put back to tomorrow at 9:00, as the seed
  // meant it, through the app's own door, before anything is read. The sandbox only: a real book's reminders are its own.
  // QA_OLD_REMINDER=1 leaves it overdue, to see the fault.
  if (seeded && !process.env.QA_OLD_REMINDER && (await v('sandbox:state').catch(() => null))?.on) {
    const put = await h.evaluate(async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      const now = new Date().toISOString()
      const due = (await window.api.captures.list()).filter((one) => one.remindAt && one.remindAt <= now)
      for (const one of due) await window.api.haligtree('remind', 'captures', one.id, tomorrow.toISOString())
      return due.map((one) => `${one.remindAt}`)
    }).catch(() => [])
    if (put.length) console.log(`(the sandbox's reminder was overdue since ${put.join(', ')}: put back to tomorrow at 9:00)`)
  }
  const size = async (w, hh) => {
    await electron.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: w, height: hh }); win?.show() }, [w, hh])
    await h.waitForTimeout(500)
  }
  await size(width, height)
  const send = (type, id, heading) => electron.evaluate(({ BrowserWindow }, [type, id, heading]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id, heading), [type, id, heading])
  // A view, and where in it: go('review', ':today') studies at once (Review itself opens on the decks).
  const go = async (id, heading) => { await send('view', id, heading); await h.waitForTimeout(900) }
  const theme = async (name) => { await h.evaluate((n) => localStorage.setItem('theme', n), name); await h.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))); await h.reload(); await h.waitForTimeout(1500) }
  // Light or dark in place, without a reload, so whatever a probe opened stays
  // open: the theme lives in localStorage 'theme' and main.tsx repaints on its
  // storage event. (Toggling the 'dark' class does nothing: every theme wears it.)
  const look = async (name) => { await h.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name); await h.waitForTimeout(400) }
  // One line for a pair of pictures: `await both('/tmp/x')` writes x-light.png and x-dark.png.
  const both = async (file, target = h) => { for (const name of ['light', 'dark']) { await look(name); await target.screenshot({ path: `${file}-${name}.png` }) } await look('light') }
  const close = async () => { try { await qa.close() } catch {} ; try { qa.electron.process().kill('SIGKILL') } catch {} }
  const now = () => new Date(Date.now() + offset)
  return { qa, electron, page, h, errors, v, go, send, size, theme, look, both, close, now }
}
