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
/**
 * The box over a bright and a dark desktop, in Paper and Dark: its own page
 * captured, laid over a stand-in desktop (a QA run's windows are kept unseen),
 * so the room round the card shows what is behind it.
 */
async function shots(name, themes = ['paper', 'light', 'dark']) {
  const { writeFileSync, mkdirSync } = await import('fs')
  mkdirSync(process.env.QA_SHOTS, { recursive: true })
  for (const theme of themes) {
    await c.page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)
    await new Promise((r) => setTimeout(r, 900))
    // Its siblings in the same theme: the main window's header buttons, and a sticky.
    if (name === 'menu') {
      const sib = await c.electron.evaluate(async ({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
        const home = wins.find((w) => w.webContents.getURL().includes('view=home'))
        const sticky = wins.find((w) => w.webContents.getURL().includes('view=sticky'))
        const grab = async (w) => (w ? (await w.webContents.capturePage()).toPNG().toString('base64') : null)
        return { home: await grab(home), sticky: await grab(sticky) }
      })
      if (sib.home) writeFileSync(`${process.env.QA_SHOTS}/sibling-main-window-${theme}.png`, Buffer.from(sib.home, 'base64'))
      if (sib.sticky) writeFileSync(`${process.env.QA_SHOTS}/sibling-sticky-${theme}.png`, Buffer.from(sib.sticky, 'base64'))
    }
    for (const desk of ['bright', 'dark']) {
      const png = await c.electron.evaluate(async ({ BrowserWindow }, [url, desk]) => {
        const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === url)
        const src = (await w.webContents.capturePage()).toDataURL()
        const { width, height } = BrowserWindow.prototype.getBounds.call(w)
        const back = desk === 'bright' ? 'linear-gradient(135deg,#f6f1e4,#cfe3f5 60%,#f3d9c7)' : 'linear-gradient(135deg,#1c2230,#3a2f45 60%,#14181f)'
        const view = new BrowserWindow({ show: false, paintWhenInitiallyHidden: true, width, height, useContentSize: true })
        try {
          await view.loadURL('about:blank')
          await view.webContents.executeJavaScript(`document.documentElement.innerHTML = ${JSON.stringify(`<body style="margin:0;background:${back}"><div style="position:absolute;left:24px;top:30px;font:14px -apple-system;color:${desk === 'bright' ? '#333' : '#ccd'}">Another app's window behind the box: lines of its text run under the room round the card.</div><img src="${src}" style="position:fixed;inset:0;width:100%;height:100%"></body>`)}; new Promise((r) => setTimeout(r, 300))`)
          return (await view.webContents.capturePage()).toPNG().toString('base64')
        } finally { view.destroy() }
      }, [c.page.url(), desk])
      writeFileSync(`${process.env.QA_SHOTS}/box-${name}-${theme}-on-${desk}.png`, Buffer.from(png, 'base64'))
    }
  }
}
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

  // Quick capture: a card inside a larger see-through window.
  const box = c.page
  const BOX = box.url()
  const boxWin = () => electron.evaluate(({ BrowserWindow }, url) => {
    const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === url)
    return { id: w.id, card: w.getBounds(), real: BrowserWindow.prototype.getBounds.call(w) }
  }, BOX)
  await v('settings:set', { hintRate: 0, motion: false })
  for (let i = 0; i < 4; i++) await v('task:add', `Overhang task ${i + 1} today`, undefined, true)
  await box.evaluate(() => window.api.showPrompt())
  await wait(1200)
  let at = await boxWin()
  // The room as it is now: main gives more above or beside the card for a hint where the screen has it (hint-room.ts).
  const RM = await box.evaluate(() => {
    const now = (name, was) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || was
    const room = window.api.room
    return { ...room, top: now('--mf-room-top', room.top), left: now('--mf-room-left', room.left), right: now('--mf-room-right', room.right) }
  })
  const ROOM = RM.left
  const drawn = await box.evaluate(() => {
    const r = document.querySelector('.app-container').getBoundingClientRect()
    const root = getComputedStyle(document.getElementById('root'))
    return { x: r.x, y: r.y, width: r.width, height: r.height, innerWidth, innerHeight, dataRoom: document.documentElement.hasAttribute('data-overhang'), pad: root.paddingTop, html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }
  })
  check('quick capture: the page is told the room round its card', ROOM > 0 && RM.top >= 88 && drawn.dataRoom, JSON.stringify({ RM, drawn }))
  check('quick capture: the window is larger than its card, by the room on every side', at.real.width === at.card.width + RM.left + RM.right && at.real.height === at.card.height + RM.top + RM.bottom && at.card.x - at.real.x === RM.left && at.card.y - at.real.y === RM.top, JSON.stringify(at))
  check('quick capture: the page draws the card where main says it is', Math.round(drawn.x) === RM.left && Math.round(drawn.y) === RM.top && Math.round(drawn.width) === at.card.width && Math.round(drawn.height) === at.card.height, JSON.stringify(drawn))
  check('quick capture: the room is see-through (nothing painted behind the card)', /rgba\(0, 0, 0, 0\)|transparent/.test(drawn.html) && /rgba\(0, 0, 0, 0\)|transparent/.test(drawn.body), JSON.stringify(drawn))
  // The window's controls, Spotlight's way: outside the card, above its top right, each its own round surface.
  const orbs = await box.evaluate(() => {
    const card = document.querySelector('.app-container').getBoundingClientRect()
    return [...document.querySelectorAll('.mf-pill button, [data-aside] > *')].map((one) => {
      const r = one.getBoundingClientRect()
      const st = getComputedStyle(one)
      return { label: one.getAttribute('aria-label') ?? one.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), radius: st.borderRadius, cursor: st.cursor, opacity: getComputedStyle(one.closest('.mf-pill') ?? one).opacity, above: r.bottom <= card.top - 4 }
    })
  })
  check('quick capture: its controls sit above the card, outside it, all one height', orbs.length >= 3 && orbs.every((one) => one.above && one.h === orbs[0].h && one.opacity === '1'), JSON.stringify(orbs))
  for (const [n, one] of orbs.entries()) {
    await box.mouse.move(Math.round((one.left + one.right) / 2), Math.round((one.top + one.bottom) / 2))
    await wait(1100)
    const seen = await box.evaluate(() => {
      const card = document.querySelector('.app-container').getBoundingClientRect()
      const tips = [...document.querySelectorAll('[data-radix-popper-content-wrapper], [data-hover-card]')].filter((one) => one.getBoundingClientRect().height > 0)
      return { n: tips.length, words: tips.map((one) => one.textContent.trim().slice(0, 60)), clear: tips.every((one) => one.getBoundingClientRect().bottom <= card.top) }
    })
    check(`quick capture: pointing at control ${n + 1} (${one.label.slice(0, 24)}) shows one tip, clear of the card`, seen.n === 1 && seen.clear, JSON.stringify(seen))
    if (process.env.QA_SHOTS && n === 1) await shots(`hover-${n + 1}`, ['paper'])
  }
  await box.mouse.move(Math.round(drawn.x + drawn.width / 2), Math.round(drawn.y + drawn.height / 2))
  await wait(400)
  // In the order they show, left to right (the page lists the pinned chip after the round buttons).
  const row = [...orbs].sort((a, b) => a.left - b.left)
  const gaps = row.slice(1).map((one, i) => one.left - row[i].right)
  check('quick capture: an even gap between them', gaps.every((gap) => gap === gaps[0]), JSON.stringify(row.map((one) => [one.label.slice(0, 12), one.left, one.right])))
  check('quick capture: each is round and shows the hand', orbs.every((one) => one.radius === '999px' && one.cursor === 'pointer'), JSON.stringify(orbs.map((one) => [one.radius, one.cursor])))
  const boxMove = (x, y) => electron.evaluate(({ BrowserWindow }, [id, x, y]) => BrowserWindow.fromId(id).webContents.sendInputEvent({ type: 'mouseMove', x, y }), [at.id, x, y])
  await boxMove(Math.round(drawn.x + drawn.width / 2), Math.round(drawn.y + drawn.height / 2))
  await wait(200)
  check('quick capture: the pointer over the card, it takes clicks', (await through(at.id)) === false)
  await boxMove(10, 10)
  await wait(200)
  check('quick capture: the pointer in the room round it, clicks pass to the app behind', (await through(at.id)) === true)
  // Moved (a drag, a throw): the card goes where it is told, the window with it.
  await electron.evaluate(({ BrowserWindow }, id) => { const w = BrowserWindow.fromId(id); const b = w.getBounds(); w.setPosition(b.x + 30, b.y + 20) }, at.id)
  const moved = await boxWin()
  check('quick capture: moved, the card lands where it was put, its room round it', moved.card.x === at.card.x + 30 && moved.card.y === at.card.y + 20 && moved.real.x === moved.card.x - ROOM, JSON.stringify(moved))
  // Put away and summoned: back where it was left.
  await box.evaluate(() => window.api.hidePrompt())
  await wait(500)
  await box.evaluate(() => window.api.showPrompt())
  await wait(1000)
  const again = await boxWin()
  check('quick capture: put away and summoned, the card is back where it was left', again.card.x === moved.card.x && again.card.y === moved.card.y, JSON.stringify({ moved: moved.card, again: again.card }))
  // A short box: a right-click menu for two tasks hangs past the card's foot, whole, the card staying as it is.
  await box.locator('[data-home="task"]').first().click()
  await wait(900)
  const short = await boxWin()
  const rows = box.locator('[data-row][data-id]')
  const n = await rows.count()
  for (const i of [n - 2, n - 1]) { await rows.nth(i).scrollIntoViewIfNeeded(); await rows.nth(i).click({ modifiers: ['Shift'] }); await wait(150) }
  await rows.nth(n - 1).click({ button: 'right' })
  await wait(900)
  const open = await boxWin()
  const menu = await box.evaluate(() => {
    const m = document.querySelector('[role=menu]')
    if (!m) return null
    const r = m.getBoundingClientRect()
    const card = document.querySelector('.app-container').getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), cardBottom: Math.round(card.bottom), h: innerHeight }
  })
  check('quick capture: a menu opens whole in the window', !!menu && menu.top >= 0 && menu.bottom <= menu.h, JSON.stringify(menu))
  check('quick capture: the card keeps its size while the menu is open', open.card.height === short.card.height && open.card.y === short.card.y, JSON.stringify({ short: short.card, open: open.card }))
  check('quick capture: the menu may hang past the card\'s foot into the room', !!menu && (menu.bottom > menu.cardBottom || short.card.height >= 600), JSON.stringify(menu))
  if (process.env.QA_SHOTS) await shots('menu')
  await c.page.evaluate(() => (localStorage.setItem('theme', 'paper'), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))))
  await box.keyboard.press('Escape')
  await wait(500)
  const closed = await boxWin()
  check('quick capture: the menu closed, the room below goes back to the rest', closed.real.height === closed.card.height + RM.top + RM.bottom, JSON.stringify(closed))

  // A truly short box: side panel shut, the box as short as its writing, the Actions menu opened.
  await box.locator('[aria-label="Hide the side panel"]').first().click()
  await wait(1200)
  const shortBox = await boxWin()
  await box.locator('.mf-pill [aria-haspopup="menu"]').first().click()
  await wait(1000)
  const shortOpen = await boxWin()
  const shortMenu = await box.evaluate(() => {
    const m = document.querySelector('[role=menu]')
    if (!m) return null
    const r = m.getBoundingClientRect()
    const card = document.querySelector('.app-container').getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), cardBottom: Math.round(card.bottom), h: innerHeight }
  })
  check('a short box (panel shut): the box is short', shortBox.card.height < 600, JSON.stringify(shortBox.card))
  check('a short box: its Actions menu opens whole, the card keeping its size', !!shortMenu && shortMenu.top >= 0 && shortMenu.bottom <= shortMenu.h && shortOpen.card.height === shortBox.card.height, JSON.stringify({ shortMenu, shortBox: shortBox.card, shortOpen: shortOpen.card }))
  if (process.env.QA_SHOTS) await shots('short-menu')
  await box.keyboard.press('Escape')
  await wait(500)
  await box.locator('[aria-label="Show the side panel"]').first().click()
  await wait(1000)

  // At scale: many pinned notes, the chip still one line and clear of the buttons.
  if (process.env.QA_SHOTS) {
    await box.evaluate(() => { document.documentElement.dataset.qaPins = '' })
    await box.evaluate(() => {
      const chip = document.querySelector('[data-waiting] span')
      if (chip) chip.textContent = '128 pinned'
    })
    await wait(300)
    await shots('pins-128')
  }
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
