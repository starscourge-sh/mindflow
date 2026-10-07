// Shared for the sandbox runs: open the app (QA_ARGS says whether it is the
// sandbox), find the main window, wait for the seed, and a few helpers.
import { open } from './harness.mjs'

export async function sandbox({ width = 1000, height = 700, seeded = true } = {}) {
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
  const h = await homeWindow()
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
  return { qa, electron, page, h, errors, v, go, send, size, theme, close }
}
