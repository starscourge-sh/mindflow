// The welcome's ⌘ and . keys on Catch are Haligtree's own, drawn live (SVG), not a borrowed picture: two keys, each
// with its mark, in the theme's ink (dark on paper, pale in the dark), and each presses down on its own.
// Pictures of the keys in light and dark go to QA_SHOTS (default /tmp).
//
//   npx electron-vite build --outDir out-w
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-keycaps.mjs
import { checks, open } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const shots = process.env.QA_SHOTS ?? '/tmp'
const run = await open()
const app = run.electron
try {
  let h = null
  for (let i = 0; i < 100 && !h; i++) (h = app.windows().find((w) => w.url().includes('view=home')) ?? null), h || (await wait(200))
  await h.waitForLoadState('domcontentloaded')
  const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
  await v('settings:set', { keys: { '⌘.': '⌘.' } })
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.setBounds({ x: 40, y: 40, width: 1280, height: 800 }); win?.show() })
  const tones = {}
  for (const name of ['light', 'dark']) {
    // The theme first, then the welcome from the menu on to Catch: the keys show for a moment before the box.
    await h.evaluate((n) => localStorage.setItem('theme', n === 'light' ? 'paper' : n), name)
    await h.reload()
    await h.waitForLoadState('domcontentloaded')
    await wait(1200)
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
    const next = async () => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
    for (let i = 0; i < 16 && !(await chapter()).includes('Catch'); i++) (await next(), await wait(700))
    const el = await h.waitForSelector('[data-keycaps]', { timeout: 8000 }).catch(() => null)
    check(`${name}: on Catch, the ⌘ . keys are drawn live`, !!el)
    if (!el) continue
    const keys = await h.evaluate(() => {
      const box = document.querySelector('[data-keycaps]')
      return box && { imgs: box.querySelectorAll('img').length, keys: [...box.querySelectorAll('svg[data-key]')].map((k) => k.dataset.key) }
    })
    check(`${name}: two keys, ⌘ and ., and no picture`, keys?.imgs === 0 && keys.keys.join('') === '⌘.', JSON.stringify(keys))
    await wait(250)
    tones[name] = await h.evaluate(() => { const s = document.querySelector('[data-keycaps] svg[data-key="⌘"] stop'); return s ? getComputedStyle(s).stopColor : '' })
    const b = await el.boundingBox()
    if (b) await h.screenshot({ path: `${shots}/keycaps-${name}.png`, clip: { x: b.x - 40, y: b.y - 30, width: b.width + 80, height: b.height + 60 } })
    // Each key goes down on its own while the page shows the shortcut (the . only for a tenth of a second: watched in the page).
    await h.evaluate(() => {
      const seen = (window.__keysDown = new Set())
      const box = document.querySelector('[data-keycaps]')
      new MutationObserver(() => box.querySelectorAll('svg[data-down]').forEach((k) => seen.add(k.dataset.key))).observe(box, { subtree: true, attributes: true, attributeFilter: ['data-down'] })
    })
    let shot = false
    for (let i = 0; i < 80; i++) {
      const now = await h.evaluate(() => [...window.__keysDown])
      if (now.length && !shot && b) (shot = true), await h.screenshot({ path: `${shots}/keycaps-${name}-down.png`, clip: { x: b.x - 40, y: b.y - 30, width: b.width + 80, height: b.height + 60 } })
      if (now.length === 2) break
      await wait(50)
    }
    const seen = new Set(await h.evaluate(() => [...window.__keysDown]))
    check(`${name}: each key presses down`, seen.size === 2, [...seen].join(''))
  }
  await h.evaluate(() => localStorage.setItem('theme', 'paper'))
  check('the keys take the theme: dark caps on paper, pale caps in the dark', !!tones.light && !!tones.dark && tones.light !== tones.dark, JSON.stringify(tones))
} finally {
  await run.close().catch(() => {})
  try { run.electron.process().kill('SIGKILL') } catch {}
}
done()
