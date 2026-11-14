// The welcome's Catch, "Your turn": quick capture opened over it types its examples into its empty line. Read frame by
// frame (about every 90ms for 27s): the kind chip follows the typed example (a link says Link, one word says Term), no block
// handle shows on the typed line, and the box never covers the step's title or the words under it.
// Run at 1400x900 and 1100x700; screenshots of both windows go to QA_SHOTS (default: the system temp folder).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-e/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_VIRTUAL=1 node qa/welcome-box-examples.mjs
import { tmpdir } from 'os'
import { join } from 'path'
import { checks, open } from './harness.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const shots = process.env.QA_SHOTS ?? tmpdir()
const run = await open()
const app = run.electron
const box = run.page
try {
  let h = null
  for (let i = 0; i < 100 && !h; i++) (h = app.windows().find((w) => w.url().includes('view=home')) ?? null), h || (await wait(200))
  await h.waitForLoadState('domcontentloaded')
  await h.waitForSelector('.mf-welcome', { timeout: 15000 })
  const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
  const next = async () => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
  for (const [width, height] of [[1400, 900], [1100, 700]]) {
    await app.evaluate(({ BrowserWindow }, [w, ht]) => { const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); win?.unmaximize(); win?.setBounds({ x: 0, y: 25, width: w, height: ht }) }, [width, height])
    await wait(500)
    for (let i = 0; i < 16 && !(await chapter()).includes('Catch'); i++) (await next(), await wait(700))
    for (let i = 0; i < 8; i++) {
      if (await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))) break
      await h.keyboard.press('Escape')
      await wait(400)
    }
    await h.waitForSelector('[data-turn]', { timeout: 8000 })
    await h.evaluate(() => window.api.showPrompt())
    await wait(600)
    // The step's words, on screen: its title and the lines under it.
    const words = await h.evaluate(() => {
      const title = [...document.querySelectorAll('.mf-welcome h1, .mf-welcome h2')].find((el) => /Catch it before/.test(el.textContent ?? ''))
      const block = title?.parentElement
      const r = (block ?? title)?.getBoundingClientRect()
      return r ? { x: r.left, y: r.top, right: r.right, bottom: r.bottom } : null
    })
    // Both windows where the app put them (virtual: really parked out of sight), the step's words in screen terms.
    const placed = await app.evaluate(({ BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows()
      const home = all.find((one) => one.webContents.getURL().includes('view=home'))
      const box = all.find((one) => !one.webContents.getURL().includes('view='))
      return { home: home.getBounds(), zoom: home.webContents.getZoomFactor(), box: box.getBounds() }
    })
    // The pointer resting on the typed line, where a block's "+" and grip would show.
    await box.hover('.tiptap.ProseMirror.haligtree-editor:not(.is-line) > p').catch(() => undefined)
    const frames = []
    for (let t = 0; t < 300; t++) {
      frames.push(await box.evaluate(() => {
        const ph = getComputedStyle(document.documentElement).getPropertyValue('--mf-welcome-ph').trim()
        const chip = document.querySelector('[data-kind-chip]')?.textContent?.trim() ?? ''
        const handles = [...document.querySelectorAll('.tiptap-drag-handle')].filter((el) => {
          const r = el.getBoundingClientRect(), s = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
        }).length
        return { ph: ph ? JSON.parse(ph) : '', chip, handles }
      }))
      if (t === 60) await box.screenshot({ path: join(shots, `box-${width}.png`) }), await h.screenshot({ path: join(shots, `welcome-${width}.png`) })
      await wait(80)
    }
    const typed = frames.filter((f) => f.ph)
    const link = typed.filter((f) => f.ph.startsWith('https://en.wikipedia') && f.ph.length > 30)
    const word = typed.filter((f) => f.ph === 'anagnorisis')
    const note = typed.filter((f) => f.ph.startsWith('Frodo never wanted the ring.'))
    check(`${width}: examples type in`, typed.length > 20, `${typed.length} frames`)
    check(`${width}: a typed link shows Link`, link.length && link.every((f) => /Link/.test(f.chip)), [...new Set(link.map((f) => f.chip))].join(','))
    // The kind once called Word is a Term since 265fcfffa ("Byzantine Empire is not one word"; capture-kind-picker.tsx).
    check(`${width}: a typed word shows Term`, word.length && word.every((f) => /Term/.test(f.chip)), [...new Set(word.map((f) => f.chip))].join(','))
    check(`${width}: a typed note shows Note`, note.length && note.every((f) => /Note/.test(f.chip)), [...new Set(note.map((f) => f.chip))].join(','))
    check(`${width}: no block handle on a typed example`, typed.every((f) => f.handles === 0), String(Math.max(...typed.map((f) => f.handles))))
    const z = placed.zoom, o = placed.home
    const w = words && { x: o.x + words.x * z, y: o.y + words.y * z, right: o.x + words.right * z, bottom: o.y + words.bottom * z }
    const b = { x: placed.box.x, y: placed.box.y, right: placed.box.x + placed.box.width, bottom: placed.box.y + placed.box.height }
    const over = w && b.x < w.right && b.right > w.x && b.y < w.bottom && b.bottom > w.y
    check(`${width}: the box never covers the step's words`, w && !over, JSON.stringify({ words: w, box: b }))
    await h.evaluate(() => window.api.hidePrompt())
    await wait(400)
  }
} finally {
  await app.close().catch(() => undefined)
}
done()
