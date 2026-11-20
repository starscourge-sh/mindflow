// Quick capture opened again comes up where it ends, in its first frame: never at its old place or size for a frame,
// then jumping (the user, 20 Nov: "a weird jolting sometimes between where I last opened the quick capture and where
// it opens the next time"). For each way the last open can leave it, the box is put away, something changes, and it
// is opened again; main records the window's frame and the card in it as it shows and every 2 ms after, the page
// every frame it draws. Checked: the card on the screen (window frame plus the card's place in it) is the same at the
// first frame drawn after it shows, 100 ms on and 400 ms on, and main moves or resizes nothing after it shows.
// Cases: plain; two lines left in it; two lines sent; thrown aside (landed, and put away mid-throw); moved by hand;
// the pointer on another screen; left on another glance tab; the side panel left open.
//   cp -cR <seeded sandbox> <copy>; QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-reopen-still.mjs
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Each window keeps the place the app gives it as its own while really parked off screen (main's QA parking).
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { CALM_HOUR, sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'
const only = (process.env.QA_CASES ?? '').split(',').filter(Boolean)

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: true, boxHideButtons: false })
  await wait(800)
  // Main's record: the window's own frame and its card, at every show of the box and every 2 ms.
  await electron.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()) && /index\.html/.test(w.webContents.getURL()))
    globalThis.__box = win
    globalThis.__log = []
    globalThis.__shows = []
    const read = () => ({ t: Date.now(), frame: BrowserWindow.prototype.getBounds.call(win), card: win.getBounds() })
    const show = win.show.bind(win)
    win.show = () => (globalThis.__shows.push(read()), show())
    let last = ''
    setInterval(() => {
      const now = read()
      const said = JSON.stringify([now.frame, now.card])
      if (said !== last) (last = said), globalThis.__log.push(now)
    }, 2)
  })
  // The page's record: the card as drawn, every frame, while the box is up.
  await page.evaluate(() => {
    window.__drawn = []
    const tick = () => {
      const card = document.querySelector('.app-container')
      if (card) {
        const r = card.getBoundingClientRect()
        window.__drawn.push({ t: Date.now(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), iw: innerWidth, ih: innerHeight, away: document.documentElement.hasAttribute('data-box-away'), seen: document.visibilityState })
      }
      requestAnimationFrame(tick)
    }
    tick()
  })

  const show = () => page.evaluate(() => window.api.showPrompt())
  const hide = () => page.evaluate(() => window.api.hidePrompt())
  const open = async () => (await show(), await wait(700))
  const write = async (text) => {
    await page.click(EDITOR)
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Backspace')
    if (text) await page.keyboard.type(text)
    await wait(400)
  }
  const at = (frames, t) => frames.filter((one) => one.t <= t).at(-1)
  const box4 = (b) => (b ? `${b.x},${b.y} ${b.w ?? b.width}x${b.h ?? b.height}` : '-')

  /** Opened again after `between` (with the box away): the card where it ends from its first frame. */
  const reopen = async (name, before, between = async () => {}, gap = 300) => {
    if (only.length && !only.includes(name)) return
    await open()
    await before()
    const away = await electron.evaluate(() => globalThis.__box.getBounds())
    await page.evaluate(() => (window.__drawn = []))
    await hide()
    await wait(gap)
    await between()
    await wait(gap)
    await electron.evaluate(() => ((globalThis.__shows = []), (globalThis.__log = globalThis.__log.slice(-1))))
    await show()
    await wait(800)
    const [shows, log] = await electron.evaluate(() => [globalThis.__shows, globalThis.__log])
    const drawn = await page.evaluate(() => window.__drawn)
    const s = shows.at(-1)
    if (!s) return check(`${name}: shown`, false)
    // The card on the screen at a moment: the window's frame (main) and where the page draws the card in it.
    const onScreen = (t) => {
      const d = at(drawn, t) ?? drawn[0]
      const logged = at(log, t)
      const m = !logged || logged.t < s.t ? s : logged
      return d && { x: m.frame.x + d.x, y: m.frame.y + d.y, w: d.w, h: d.h }
    }
    const first = drawn.find((one) => one.t >= s.t)
    const p0 = first && onScreen(first.t)
    const p100 = onScreen(s.t + 100)
    const p400 = onScreen(s.t + 400)
    const after = log.filter((one) => one.t > s.t && one.t <= s.t + 600 && JSON.stringify([one.frame, one.card]) !== JSON.stringify([s.frame, s.card]))
    // What the Mac shows the moment the window is shown: the last picture the page drew before it (drawn while away,
    // or before it was put away), in the window's frame as it is shown.
    const prior = drawn.filter((one) => one.t < s.t)
    const last = prior.at(-1)
    const stale = last && { x: s.frame.x + last.x, y: s.frame.y + last.y, w: last.w, h: last.h }
    const hiddenDraws = prior.filter((one) => one.seen !== 'visible' || one.away).length
    const same = (a, b) => a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1
    const shown = drawn.filter((one) => one.t >= s.t)
    const changes = shown.filter((one, i) => i === 0 || JSON.stringify({ ...one, t: 0 }) !== JSON.stringify({ ...shown[i - 1], t: 0 }))
    console.log(`  ${name}: left at card ${box4(away)}; page drew ${hiddenDraws} frames while away (seen ${[...new Set(prior.map((one) => one.seen))]}), its last picture before the show puts the card at ${box4(stale)}; shown with frame ${box4(s.frame)} card ${box4(s.card)}; main after: ${after.map((one) => `+${one.t - s.t}ms frame ${box4(one.frame)} card ${box4(one.card)}`).join(' | ') || 'nothing'}; page: ${changes.map((one) => `+${one.t - s.t}ms card ${box4(one)} in ${one.iw}x${one.ih}`).join(' | ')}`)
    check(`${name}: the card's first frame is where it is 100 and 400 ms on, and main moves nothing after it shows`, same(p0, p100) && same(p0, p400) && after.length === 0, `first ${box4(p0)}, +100 ${box4(p100)}, +400 ${box4(p400)}`)
    check(`${name}: the picture the window holds as it shows (its last drawn) is the card where it ends`, same(stale, p400), `held ${box4(stale)}, ends ${box4(p400)}`)
  }

  await reopen('plain', async () => {})
  await reopen('two lines left', () => write('First line of a thought\nand a second line under it'))
  await reopen('two lines sent', async () => {
    await write('Sent with two lines\nso the box was grown')
    await page.keyboard.press('Meta+Enter')
    await wait(500)
  })
  await reopen('cleared after two lines', () => write('Two lines\nthen put away'), async () => {
    // Its words sent from elsewhere while away: the box comes back blank, at its short size.
    await page.evaluate(() => localStorage.removeItem('capture-draft'))
  })
  await reopen('two lines sent, opened again at once', async () => {
    await write('Sent with two lines\nand opened again at once')
    await page.keyboard.press('Meta+Enter')
  }, async () => {}, 10)
  await reopen('two lines left over an hour', async () => {
    await write('Left for an hour\nwith a second line')
    // Kept as a draft once the typing pauses.
    await page.waitForFunction(() => (localStorage.getItem('capture-draft') ?? '').includes('second line'))
    // Last written in two hours ago: opened again, it is set aside as a leftover and the box is fresh.
    await page.evaluate(() => localStorage.setItem('capture-draft-at', String(Date.now() - 2 * 3600_000)))
  })
  if (!only.length || only.includes('two lines left over an hour')) {
    const offer = await page.$eval('[data-leftover]', (one) => one.textContent).catch(() => '')
    const empty = await page.$eval(EDITOR, (one) => one.textContent.trim()).catch(() => '?')
    check('two lines left over an hour: opened fresh, its words offered under the line', offer.includes('Left for an hour') && empty === '', `offer "${offer}", editor "${empty}"`)
    await page.click('[data-leftover-drop]').catch(() => {})
  }
  await reopen('thrown, landed', async () => {
    await write('')
    await page.evaluate(() => window.api.throwBox(1, 1))
    await wait(700)
  })
  await reopen('thrown, put away mid-throw', async () => {
    await page.evaluate(() => window.api.throwBox(-1, -1))
    await wait(60)
  })
  await reopen('thrown, put away and opened again mid-throw', async () => {
    await page.evaluate(() => window.api.throwBox(1, 1))
    await wait(40)
  }, async () => {}, 20)
  await reopen('moved by hand', async () => {
    await electron.evaluate(() => { const b = globalThis.__box.getBounds(); globalThis.__box.setPosition(b.x + 140, b.y + 90) })
  })
  await reopen('pointer on another screen', async () => {}, async () => {
    // A second screen to the right, the pointer on it.
    await electron.evaluate(({ screen }) => {
      const one = screen.getPrimaryDisplay()
      const two = { ...one, id: one.id + 1, bounds: { ...one.bounds, x: one.bounds.x + one.bounds.width }, workArea: { ...one.workArea, x: one.workArea.x + one.bounds.width } }
      const all = [one, two]
      const on = (p) => all.find((d) => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width) ?? one
      const point = { x: two.bounds.x + 300, y: 300 }
      globalThis.__screens = { getAllDisplays: screen.getAllDisplays, getCursorScreenPoint: screen.getCursorScreenPoint, getDisplayNearestPoint: screen.getDisplayNearestPoint, getDisplayMatching: screen.getDisplayMatching }
      screen.getAllDisplays = () => all
      screen.getCursorScreenPoint = () => point
      screen.getDisplayNearestPoint = (p) => on(p)
      screen.getDisplayMatching = (r) => on({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
    })
  })
  // The real screens back.
  await electron.evaluate(({ screen }) => globalThis.__screens && Object.assign(screen, globalThis.__screens))
  await reopen('pointer back on the first screen', async () => {})
  await reopen('left on another tab', async () => {
    await write('')
    await page.click('[data-glance-tab="notes"]').catch(() => {})
    await wait(500)
  })
  await reopen('side panel left open', async () => {
    await page.click(EDITOR)
    await page.keyboard.press('Meta+\\')
    await wait(600)
  })
  await reopen('side panel shut again', async () => {
    await page.click(EDITOR)
    await page.keyboard.press('Meta+\\')
    await wait(600)
  })
  // Kept open (behind another app's window), carried, and summoned again without being put away: it stays where it is.
  if (!only.length || only.includes('carried while up')) {
    await open()
    const was = await electron.evaluate(() => { const b = globalThis.__box.getBounds(); globalThis.__box.setPosition(b.x - 120, b.y - 60); return globalThis.__box.getBounds() })
    await show()
    await wait(500)
    const now = await electron.evaluate(() => [globalThis.__box.isVisible(), globalThis.__box.getBounds()])
    check('carried while up, then summoned: it stays where it was carried', now[0] && now[1].x === was.x && now[1].y === was.y, `carried to ${box4(was)}, after ${box4(now[1])}`)
    await hide()
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
