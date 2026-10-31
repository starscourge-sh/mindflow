// Windows drawn larger than their card (a paper sticky keeps clear room round
// it for its lean, lift and shadow): clicks on that room go to the app behind,
// the card and anything hanging past it take them, and every place the app
// works out (tidy, Bring sticky notes here, a new one's spot, a restart) goes
// by the card's edges, not the window's.
//
// The pointer is played into the page from main (sendInputEvent), and whether
// clicks pass through is read from main's own record (haligtreeThrough): a QA
// run keeps every window unclickable, so the record is what changes there.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/overhang-windows.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h, v } = c
try {
  const stickyWins = () => electron.evaluate(({ BrowserWindow, screen }) => BrowserWindow.getAllWindows()
    .filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky'))
    .map((w) => ({ id: w.id, url: w.webContents.getURL(), b: w.getBounds(), visible: w.isVisible(), work: screen.getDisplayMatching(w.getBounds()).workArea })))
  await v('settings:set', { stickiesGlass: false, motion: false })
  await wait(2500)
  for (let i = 0; i < 20 && (await stickyWins()).length; i++) {
    for (const one of await stickyWins()) {
      const u = new URL(one.url)
      await h.evaluate(([t, id]) => window.api.stick(t, id, false), [u.searchParams.get('type'), u.searchParams.get('id')])
    }
    await wait(600)
  }
  const make = (title) => h.evaluate((title) => window.api.captures.create({ title, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Clear room round me' }] }] } }), title)
  const ids = [await make('Overhang one'), await make('Overhang two')]
  for (const id of ids) await h.evaluate((id) => window.api.stick('capture', id, true), id)
  const pageOf = async (id) => {
    for (let i = 0; i < 40; i++) {
      const page = electron.windows().find((p) => p.url().includes('view=sticky') && p.url().includes(`id=${id}`))
      if (page) return (await page.waitForLoadState('domcontentloaded'), page)
      await wait(250)
    }
    throw new Error(`no sticky window for ${id}`)
  }
  const page = await pageOf(ids[0])
  await pageOf(ids[1])
  await wait(1500)
  const winOf = async (id) => (await stickyWins()).find((one) => one.url.includes(`id=${id}`))
  const win = await winOf(ids[0])
  /** The card's box in the page: the first thing drawn inside the clear room. */
  const card = await page.evaluate(() => {
    const r = document.querySelector('[data-clear] > *').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  check('the window is larger than its card', win.b.width > card.width + 20 && win.b.height > card.height + 20, `window ${win.b.width}x${win.b.height}, card ${Math.round(card.width)}x${Math.round(card.height)}`)

  const through = (id) => electron.evaluate((_, id) => globalThis.haligtreeThrough(id), id)
  const move = (x, y, held = false) => electron.evaluate(({ BrowserWindow }, [id, x, y, held]) => BrowserWindow.fromId(id).webContents.sendInputEvent({ type: 'mouseMove', x, y, ...(held ? { modifiers: ['leftButtonDown'] } : {}) }), [win.id, x, y, held])
  check('made with clicks passing through its clear room', (await through(win.id)) === true)
  await move(Math.round(card.x + card.width / 2), Math.round(card.y + card.height / 2))
  await wait(200)
  check('the pointer over the card: the card takes clicks', (await through(win.id)) === false)
  await move(4, 4)
  await wait(200)
  check('the pointer in the clear room: clicks pass to the app behind', (await through(win.id)) === true)
  await move(Math.round(card.x + 30), Math.round(card.y + 30))
  await wait(150)
  await move(4, Math.round(card.y + card.height / 2), true)
  await wait(200)
  check('a button held from the card into the clear room keeps the window holding the pointer', (await through(win.id)) === false)
  await move(4, Math.round(card.y + card.height / 2))
  await wait(200)
  check('let go there, clicks pass through again', (await through(win.id)) === true)

  // A menu or toast hanging past the card into the clear room takes clicks there too.
  await page.evaluate(() => {
    const hang = document.createElement('div')
    hang.id = 'qa-hang'
    hang.style.cssText = 'position:fixed;left:2px;top:2px;width:14px;height:14px;background:red'
    document.body.append(hang)
  })
  await move(8, 8)
  await wait(200)
  check('something drawn in the clear room (a menu past the card) takes clicks', (await through(win.id)) === false)
  await page.evaluate(() => document.getElementById('qa-hang').remove())
  await move(5, 30)
  await wait(200)

  // Tidy: the cards, not the windows, sit 24 points in from the right edge.
  // The clear room's own width (its padding), not the card's leaning outline.
  const inset = await page.evaluate(() => { const st = getComputedStyle(document.querySelector('[data-clear]')); return { left: parseFloat(st.paddingLeft), right: parseFloat(st.paddingRight), top: parseFloat(st.paddingTop), bottom: parseFloat(st.paddingBottom) } })
  await h.evaluate(() => window.api.tidyStickies())
  await wait(1200)
  const tidied = (await stickyWins()).filter((one) => ids.some((id) => one.url.includes(`id=${id}`)))
  const edges = tidied.map(({ b, work }) => work.x + work.width - (b.x + b.width - inset.right))
  check('tidy lines the cards up 24 points in from the right edge (their clear room may hang past)', edges.every((gap) => gap === 24), JSON.stringify(edges))
  const [a, b] = tidied.map((one) => one.b).sort((p, q) => p.y - q.y)
  check('tidy puts 12 points between the cards, not between their windows', b.y + inset.top - (a.y + a.height - inset.bottom) === 12, `${b.y + inset.top - (a.y + a.height - inset.bottom)}`)
  await h.evaluate(() => window.api.untidyStickies())
  await wait(800)

  // Kept and brought back: the card returns exactly where it was.
  const kept = (await winOf(ids[0])).b
  // Taken down by its own X, then "Put it back": brought back by its kept place, as after a restart.
  await page.evaluate(() => window.api.takeDownSticky('Overhang one'))
  await wait(800)
  await h.evaluate(() => window.api.putStickyBack())
  await wait(2000)
  const back = (await winOf(ids[0]))?.b
  check('stuck again, its card is where it was', !!back && back.x === kept.x && back.y === kept.y, JSON.stringify({ kept, back }))

  // The session pill's window is wider and taller than the pill: the room round it lets clicks through too.
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  await v('session:start', task.id, 'Overhang', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  let pill = null
  for (let i = 0; i < 50 && !pill; i++) (pill = electron.windows().find((one) => one.url().includes('view=focus')) ?? null), pill || (await wait(200))
  await pill.waitForLoadState('domcontentloaded')
  await wait(1500)
  const pillId = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=focus')).id)
  const pillBox = await pill.evaluate(() => {
    const r = document.querySelector('[data-clear] > *').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, innerWidth, innerHeight }
  })
  const pillMove = (x, y) => electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).webContents.sendInputEvent({ type: 'mouseMove', x, y }), [pillId, x, y])
  check('the pill is smaller than its window', pillBox.width < pillBox.innerWidth || pillBox.height < pillBox.innerHeight, JSON.stringify(pillBox))
  await pillMove(Math.round(pillBox.x + pillBox.width / 2), Math.round(pillBox.y + pillBox.height / 2))
  await wait(200)
  check('the pointer over the pill: it takes clicks', (await through(pillId)) === false)
  await pillMove(3, Math.round(pillBox.y + pillBox.height / 2))
  await wait(200)
  check('the pointer beside the pill: clicks pass to the app behind', (await through(pillId)) === true)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
