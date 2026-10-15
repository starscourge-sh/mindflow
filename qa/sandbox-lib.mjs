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
 * `at: 'HH:MM'` runs the app as if it were that time today, in the main
 * process and every window, so a probe that depends on the hour (the evening,
 * the small hours) reads the same whatever the real clock says. `now()` is
 * the probe's own clock, moved the same way.
 */
export async function sandbox({ width = 1000, height = 700, seeded = true, at } = {}) {
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
    for (let i = 0; i < 150; i++) {
      const state = await h.evaluate(() => window.api.vigil('sandbox:state')).catch(() => null)
      if (state?.seeded || (state && !state.on)) break
      await h.waitForTimeout(200)
    }
    await h.waitForTimeout(1000)
    await h.reload()
    await page.reload().catch(() => {})
  }
  h.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  h.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
  page.on('pageerror', (e) => errors.push('BOX PAGEERROR ' + e.message))
  await h.waitForLoadState('domcontentloaded')
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args])
  if (seeded) {
    for (let i = 0; i < 150; i++) {
      const state = await v('sandbox:state').catch(() => null)
      if (state?.seeded || (state && !state.on)) break
      await h.waitForTimeout(200)
    }
  }
  const size = async (w, hh) => {
    await electron.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: w, height: hh }); win?.show() }, [w, hh])
    await h.waitForTimeout(500)
  }
  await size(width, height)
  const send = (type, id) => electron.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])
  const go = async (id) => { await send('view', id); await h.waitForTimeout(900) }
  const theme = async (name) => { await h.evaluate((n) => localStorage.setItem('theme', n), name); await h.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))); await h.reload(); await h.waitForTimeout(1500) }
  const close = async () => { try { await qa.close() } catch {} ; try { qa.electron.process().kill('SIGKILL') } catch {} }
  const now = () => new Date(Date.now() + offset)
  return { qa, electron, page, h, errors, v, go, send, size, theme, close, now }
}
