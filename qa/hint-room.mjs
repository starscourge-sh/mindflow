// Quick capture's hint sits out of the card: above it where the screen has room, or beside it on the side with room
// (the box at the top middle of the screen, where it opens by default), never over the card or a round control.
// The card, its footer and the round controls do not move when it comes or goes; it fades at the first word, waits
// while ⌘K is open, waits while the pill, a recording or reading is up, and with no room anywhere it waits.
// Every shape is filmed, a frame every 50ms through open, type, ⌘K and close, light and dark, into
// QA_SHOTS/<shape>-<look>/.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS='--sandbox --use-fake-device-for-media-stream --use-fake-ui-for-media-stream' node qa/hint-room.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox --use-fake-device-for-media-stream --use-fake-ui-for-media-stream'
// Each window keeps the place it is given as its own while parked off screen, so the box can be put by an edge.
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, h } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp/hint'
const film = process.env.QA_FILM !== '0'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'

/** Where the card sits on the screen (main's own record). */
const screenCard = () => c.electron.evaluate(({ BrowserWindow }) => {
  const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
  return box ? box.getBounds() : null
})
/** Where the footer and round controls sit in the card. */
const where = () => page.evaluate(() => {
  const card = document.querySelector('.app-container').getBoundingClientRect()
  const rel = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left - card.left), Math.round(r.top - card.top), Math.round(r.width), Math.round(r.height)] }
  return {
    footer: rel(document.querySelector('main[data-zen-row]') ?? document.querySelector('.app-container')),
    controls: [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.getBoundingClientRect().width).map(rel),
    size: [Math.round(card.width), Math.round(card.height)]
  }
})
const hint = async (expect = true) => (expect && (await page.waitForSelector('[data-hint-room] [data-hint-in] > *', { timeout: 3000 }).catch(() => {})), page.evaluate(() => {
  const room = document.querySelector('[data-hint-room]')
  const one = document.querySelector('[data-hint-room] [data-hint-in] > *')
  if (!one) return null
  const r = one.getBoundingClientRect()
  const card = document.querySelector('.app-container').getBoundingClientRect()
  const hit = (x) => !(x.right <= r.left || x.left >= r.right || x.bottom <= r.top || x.top >= r.bottom)
  const controls = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((el) => el.getBoundingClientRect().width).map((el) => el.getBoundingClientRect())
  return {
    side: document.documentElement.dataset.hintSide ?? null,
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    card: [Math.round(card.left), Math.round(card.top), Math.round(card.right), Math.round(card.bottom)],
    overCard: hit(card), overControl: controls.some(hit),
    // The row above the card ("1 pinned" and the round controls): how far the hint stops short of its first control, where the two share a line.
    rowGap: controls.length && controls.some((x) => !(x.bottom <= r.top || x.top >= r.bottom)) ? Math.round(Math.min(...controls.map((x) => x.left)) - r.right) : null,
    inWindow: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    opacity: room ? Number(getComputedStyle(room).opacity) : 1,
    lines: (() => { const w = one.querySelector('[data-hint-words]'); return w ? Math.round(w.getBoundingClientRect().height / parseFloat(getComputedStyle(w).lineHeight)) : 0 })()
  }
}))
const seen = (h) => !!h && h.opacity > 0.5
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1400)
}
/**
 * One gem as the hint on every open, chosen once by its id: main's own picker is asked until it hands over a gem (a
 * long one if asked), and from then on that gem is what it gives. `null` puts the picker back.
 */
const pinHint = (want) => c.electron.evaluate(({ ipcMain }, want) => {
  const handlers = ipcMain._invokeHandlers
  const own = (globalThis.qaHintsNext ??= handlers.get('hints:next'))
  if (want === null) return void handlers.set('hints:next', own)
  let one = null
  for (let i = 0; i < 400 && !one; i++) {
    const row = own({})
    if (row && row.id !== row.captureId && (want !== 'long' || JSON.stringify(row.body ?? '').length + String(row.title ?? '').length > 500)) one = row
  }
  handlers.set('hints:next', () => one)
  return one && { id: one.id, title: one.title }
}, want)
/** Opened until a hint comes (the store hands out none now and then). */
const untilHint = async () => {
  for (let i = 0; i < 6; i++) {
    await reopen()
    if (await page.waitForSelector('[data-hint-words]', { timeout: 2500 }).catch(() => null)) return true
  }
  // Why none came, for the log.
  console.log('no hint:', JSON.stringify(await page.evaluate(() => ({ focus: document.documentElement.dataset.focus, lesson: document.documentElement.hasAttribute('data-welcome-ph'), side: document.documentElement.dataset.hintSide ?? null, room: document.querySelector('[data-hint-room]')?.outerHTML.slice(0, 160) ?? null, pill: !!document.querySelector('.app-container[data-pill]') }))))
  return false
}
/**
 * The box put at a spot on its screen (as if dragged there), kept for the next open. Said twice, a beat apart, and
 * read back: a glide still landing (the box fitting its words) lands on its own target and would undo the first.
 */
const putBox = async (spot) => {
  // Moved while it is away, the box is not kept there: it comes back where it was last put away (main's lastBounds,
  // read at hide). A filmed shape ends with the box away, so it is opened first, as a person drags an open box.
  if (!(await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html'))?.isVisible()))) {
    await page.evaluate(() => window.api.showPrompt()); await wait(1400)
  }
  const first = await placeBox(spot)
  await wait(400)
  const asked = await placeBox(spot)
  const landed = await screenCard()
  return { ...asked, held: landed.x === asked.x && landed.y === asked.y, first }
}
/** Under the card: its top 8px or more below the card's foot, its left edge on the card's, all of it in the window. */
const under = (x) => x?.side === 'below' && x.top >= x.card[3] + 8 && x.left === x.card[0] && x.inWindow
const placeBox = (spot) => c.electron.evaluate(({ BrowserWindow, screen }, spot) => {
  const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
  if (!box) return
  const at = box.getBounds()
  const area = screen.getDisplayMatching(at).workArea
  const x = spot === 'left' ? area.x + 20 : spot === 'right' ? area.x + area.width - at.width - 20 : Math.round(area.x + (area.width - at.width) / 2)
  const y = spot === 'low' ? area.y + 300 : area.y + 60
  box.setPosition(x, y)
  return { x, y }
}, spot)
const theme = (look) => page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), look === 'light' ? 'paper' : 'dark')
/**
 * One frame of the box, taken by main (webContents.capturePage), never by page.screenshot: a page.screenshot asked
 * while the box is away (⌘K and the close both put it away mid-film) waits for a frame that never comes, gives up
 * after 30s, and leaves Chromium holding the page at the size it had then. Every later open drew its card in that old
 * width while the window around it had grown (the pill drawn 344px wide, three lines tall). capturePage answers at
 * once, empty while the box is away, and lets go.
 */
const frame = async (path) => {
  const png = await c.electron.evaluate(async ({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html'))
    const image = box && (await box.webContents.capturePage())
    return image && !image.isEmpty() ? image.toPNG().toString('base64') : ''
  })
  if (png) writeFileSync(path, Buffer.from(png, 'base64'))
}
/** A frame every 50ms for `ms`, while `act` runs. */
async function roll(dir, name, ms, act) {
  let n = 0
  let going = true
  const rolling = (async () => {
    while (going) {
      const at = Date.now()
      await frame(`${dir}/${name}-${String(n++).padStart(2, '0')}.png`).catch(() => {})
      await new Promise((r) => setTimeout(r, Math.max(0, 50 - (Date.now() - at))))
    }
  })()
  await act()
  await wait(ms)
  going = false
  await rolling
}
/** One shape filmed, light and dark: open, type, ⌘K, close. `ready` puts the box in the shape once it is open. */
async function shape(name, ready = async () => {}) {
  if (!film) return
  for (const look of ['light', 'dark']) {
    const dir = `${shots}/${name}-${look}`
    mkdirSync(dir, { recursive: true })
    await theme(look)
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    await roll(dir, '1-open', 1300, async () => { await page.evaluate(() => window.api.showPrompt()); await wait(700); await ready() })
    await page.mouse.move(2, 2)
    await roll(dir, '2-type', 500, async () => { await page.click(EDITOR).catch(() => {}); await page.keyboard.type('a') })
    await page.keyboard.press('Backspace'); await wait(200)
    await roll(dir, '3-cmdk', 700, () => page.keyboard.press('Meta+k'))
    await page.keyboard.press('Escape'); await wait(300)
    await roll(dir, '4-close', 500, () => page.evaluate(() => window.api.hidePrompt()))
  }
}

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false, boxPlace: 'last', boxScreen: 'same' })
  // Plenty for hints to come from: the store hands each out only now and then.
  for (let n = 0; n < 30; n += 1) await c.h.evaluate((body) => window.api.captures.create({ body }), `A long one, number ${n + 1}: the best way to remember something is to explain it to someone else in your own words, then find the part you could not explain, and go back to the source for exactly that part.`)
  await reopen()
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  // The top middle of the screen, where it opens the first time: 60px under the menu bar.
  await putBox('middle')
  await reopen()
  const bare = { card: await screenCard(), in: await where() }

  // The default spot, the top middle of the screen: no room above, so it sits beside the card.
  // Every open deals a hint: the rate is 1, and the page's dice say 0.4. Not 0.99: once 20 hints have been shown and
  // under one in ten stopped you, main halves the rate (hints:rate, legible in Settings), and a filmed run shows that
  // many in passing, so at 0.99 no hint came at all from then on. 0.4 is under the halved rate, and over the quarter
  // that deals a held question and the third that deals a memory instead.
  await v('settings:set', { hintRate: 1 })
  await page.evaluate(() => { Math.random = () => 0.4 })
  await reopen()
  await page.waitForSelector('[data-hint-card]', { timeout: 5000 }).catch(() => {})
  await page.mouse.move(2, 2); await wait(500)
  const top = await hint()
  if (process.env.QA_DEBUG) console.log(await page.evaluate(() => ({ side: document.documentElement.dataset.hintSide, room: document.querySelector('[data-hint-room]')?.outerHTML.slice(0, 200) })))
  check('the top middle of the screen: a hint shows', seen(top), JSON.stringify(top))
  check('…under the card (no room above it there), its left edge on the card\'s (note 277ae401)', under(top), JSON.stringify(top))
  check('…never over the card or a round control, never cut off', top && !top.overCard && !top.overControl && top.inWindow, JSON.stringify(top))
  const look = await page.evaluate(() => {
    const card = document.querySelector('[data-hint-card]')
    const why = card?.querySelector('[data-hint-mark]')?.getBoundingClientRect()
    const words = card?.querySelector('[data-hint-words]')?.getBoundingClientRect()
    const paint = (color) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].join(',') }
    return { why: why && words ? why.bottom <= words.top : null, fill: card && paint(getComputedStyle(card).backgroundColor), box: paint(getComputedStyle(document.querySelector('.app-container')).backgroundColor), whySize: card && parseFloat(getComputedStyle(card.querySelector('[data-hint-mark]')).fontSize) }
  })
  check('why it is here is read first: its own line above the words, 13px or more', look.why === true && look.whySize >= 13, JSON.stringify(look))
  check('its fill is the box\'s own', look.fill === look.box, JSON.stringify(look))
  const withHint = { card: await screenCard(), in: await where() }
  // The toast lane is measured from the footer's place in the window, which moved with the room.
  const lane = await page.evaluate(() => {
    const el = document.querySelector('[style*="--toast-right"]')
    const create = document.querySelector('main[data-zen-row]')?.lastElementChild?.getBoundingClientRect()
    return { said: el ? parseFloat(el.style.getPropertyValue('--toast-right')) : null, now: create ? Math.round(innerWidth - create.left) : null }
  })
  check('the toast lane follows the card into its new place in the window', lane.said !== null && lane.said === lane.now, JSON.stringify(lane))
  check('the card opens exactly where it does without a hint (on the screen)', JSON.stringify(withHint.card) === JSON.stringify(bare.card), `${JSON.stringify(bare.card)} vs ${JSON.stringify(withHint.card)}`)
  check('the footer and round controls sit where they do without a hint', JSON.stringify(withHint.in) === JSON.stringify(bare.in), `${JSON.stringify(bare.in)} vs ${JSON.stringify(withHint.in)}`)
  // The room under the card is the "/" and "#" menus' too: one open, the hint is gone in the same frame, never both.
  await page.click('main[data-zen-row] [data-kind-chip]'); await wait(60)
  const kinds = await page.evaluate(() => ({ menu: !!document.querySelector('[role=menu], [role=dialog]'), opacity: getComputedStyle(document.querySelector('[data-hint-room]')).opacity }))
  check('a menu opened from the footer: the hint is gone at once, no fade under the menu', kinds.menu && kinds.opacity === '0', JSON.stringify(kinds))
  await page.keyboard.press('Escape'); await wait(300)
  await page.click(EDITOR); await page.keyboard.type('/'); await wait(500)
  const slash = await page.evaluate(() => {
    const pop = document.querySelector('.tiptap-suggestion-popup')?.getBoundingClientRect()
    return { pop: !!pop, below: pop ? pop.top >= document.querySelector('.app-container').getBoundingClientRect().top : null, opacity: getComputedStyle(document.querySelector('[data-hint-room]')).opacity }
  })
  check('"/" typed: its menu opens and the hint is gone (the two never show together)', slash.pop && slash.opacity === '0', JSON.stringify(slash))
  await page.keyboard.press('Escape'); await page.keyboard.press('Backspace'); await wait(300)
  await reopen(); await hint()
  await page.click(EDITOR); await page.keyboard.type('a'); await wait(800)
  const typed = await hint()
  check('the first keystroke sends the hint off', !seen(typed), JSON.stringify(typed))
  check('…and nothing in the card moved', JSON.stringify(await where()) === JSON.stringify(withHint.in))
  await page.keyboard.press('Backspace'); await wait(300)
  await reopen()
  // From the writing, where ⌘K is taken (focused, not clicked: a click would count as a start and send the hint off).
  await page.focus(EDITOR).catch(() => {})
  await page.keyboard.press('Meta+k'); await wait(600)
  // ⌘K opens its box in the main window now (e5ad3bb6), nothing of it in this one: nothing here for the hint to give
  // way to (this check was written when ⌘K's box opened over the card, and the hint hid under it).
  const inHome = await h.waitForSelector('[cmdk-dialog], [data-slot=dialog-content] [cmdk-root], [role=dialog][aria-label="Search"]', { timeout: 2500 }).then(() => true, () => false)
  check('⌘K open: its box opens in the main window, none in the capture window over the hint', inHome && !(await page.$('[cmdk-dialog], [data-slot=dialog-content] [cmdk-root], [role=dialog][aria-label="Search"]')), JSON.stringify({ inHome }))
  await h.keyboard.press('Escape').catch(() => {})
  await page.keyboard.press('Escape'); await wait(400)
  // Typed in, ⌘K opened and closed, put away: the next open deals a hint again.
  await page.click(EDITOR); await page.keyboard.type('a'); await wait(300); await page.keyboard.press('Backspace')
  await page.keyboard.press('Meta+k'); await wait(600); await page.keyboard.press('Escape'); await wait(400)
  await reopen()
  check('typed in, ⌘K opened and closed, put away: the next open shows a hint', seen(await hint()))
  // Only one hint ever shows: put away with a hint up and brought up again, every frame of the opening counts the cards
  // drawn (last open's card leaving while the new one came in drew both, stacked, in frame 0).
  let most = 0
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.api.hidePrompt()); await wait(400)
    await page.evaluate(() => {
      window.__most = 0
      const t0 = performance.now()
      const count = () => {
        const cards = [...document.querySelectorAll('[data-hint-card], [data-hint-surface]')].filter((el) => !el.parentElement?.closest('[data-hint-card], [data-hint-surface]') && el.getBoundingClientRect().height > 4 && Number(getComputedStyle(el).opacity) > 0.05)
        window.__most = Math.max(window.__most, cards.length)
        if (performance.now() - t0 < 1500) requestAnimationFrame(count)
      }
      requestAnimationFrame(count)
    })
    await page.evaluate(() => window.api.showPrompt()); await wait(1600)
    most = Math.max(most, await page.evaluate(() => window.__most))
  }
  check(`six opens one after another: never more than one hint drawn in any frame (${most})`, most <= 1)
  await page.click('[data-record-button]'); await wait(800)
  check('the snip and mic choices open: the hint waits unseen', !seen(await hint()))
  await page.keyboard.press('Escape'); await wait(400)
  await shape('full-box')

  // With the side panel: the card grows to the right, the hint stays on the left.
  await reopen()
  await page.keyboard.press('Meta+Backslash'); await wait(1400)
  await reopen()
  const panel = await hint()
  check('with the side panel: the hint under the card, clear of it', seen(panel) && under(panel) && !panel.overCard, JSON.stringify(panel))
  await shape('full-box-side-panel')
  await reopen()
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1400) }

  // Lower on the screen: room above, so it sits above the card's top left edge, beside the round controls.
  await putBox('low'); await reopen()
  const low = await hint()
  check('lower on the screen: under the card while there is room there, else above it, its left edge on the card\'s, never beside it', seen(low) && (under(low) || (low.side === 'above' && low.bottom <= low.card[1] - 8 && low.left === low.card[0])), JSON.stringify(low))
  check('…clear of the round controls and the card', low && !low.overControl && !low.overCard && low.inWindow, JSON.stringify(low))
  check('…above the grown box, it stops 8px or more short of the whole row ("1 pinned" and the buttons)', low && (low.side !== 'above' || low.rowGap === null || low.rowGap >= 8), JSON.stringify(low))
  await shape('box-low')

  // Near the left edge of the screen at the top: the hint goes to the right.
  const askedLeft = await putBox('left'); await reopen()
  const left = { ...(await hint()), asked: askedLeft, landed: await screenCard() }
  check('the box at the top left of the screen: the hint under it', seen(left) && under(left), JSON.stringify(left))
  await shape('box-top-left')
  const askedRight = await putBox('right'); await reopen()
  const right = { ...(await hint()), asked: askedRight, landed: await screenCard() }
  check('the box at the top right of the screen: the hint under it', seen(right) && under(right), JSON.stringify(right))
  await shape('box-top-right')
  await putBox('middle')
  const longGem = await pinHint('long')
  await page.evaluate(() => { window.qaShown = 0; window.api.onShown(() => window.qaShown++) })
  // Opened until the pinned gem shows, three times at most, each miss logged with whether the page heard the open.
  for (let i = 0; i < 3; i++) {
    await reopen()
    if (await page.waitForSelector('[data-hint-words]', { timeout: 2500 }).catch(() => null)) break
    console.log('long: missed an open', JSON.stringify(await page.evaluate(() => ({ shown: window.qaShown, room: document.querySelector('[data-hint-room]')?.outerHTML.slice(0, 120) }))))
  }
  const long = { ...(await hint()), gem: longGem }
  if (!long.top && long.top !== 0) console.log('long: none shown', JSON.stringify(await page.evaluate(() => ({ rnd: Math.random(), room: document.querySelector('[data-hint-room]')?.outerHTML.slice(0, 300), away: document.querySelector('[data-hint-room]')?.getAttribute('data-away'), visible: document.visibilityState }))), JSON.stringify(await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html'))?.isVisible())))
  check('a long hint: three lines at most, clear of the card and inside the window', seen(long) && !long.overCard && long.inWindow && long.lines <= 3, JSON.stringify(long))
  if (film) {
    for (const look of ['light', 'dark']) {
      mkdirSync(`${shots}/long-gem-${look}`, { recursive: true }); await theme(look); await wait(500)
      await frame(`${shots}/long-gem-${look}/still.png`)
    }
  }

  // Reading: a gem opened in the box from its hint's menu (a capture would open in the box to finish, not to read);
  // opened again, the next hint waits while it is read.
  const readGem = await pinHint('gem')
  for (let i = 0; i < 3; i++) {
    await reopen()
    if (await page.waitForSelector('[data-hint-words]', { timeout: 2500 }).catch(() => null)) break
    console.log('reading: missed an open', JSON.stringify(await page.evaluate(() => ({ shown: window.qaShown }))))
  }
  await page.waitForSelector('[data-hint-words]', { timeout: 5000 }).catch(() => {})
  await page.click('[data-hint-words]', { button: 'right' }); await wait(400)
  await page.locator('[role=menu] [role=menuitem]', { hasText: 'Open it' }).first().click().catch(() => {})
  await wait(1000)
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1600)
  for (let i = 0; i < 5 && !(await page.$('[data-hint-card]')); i++) { await page.evaluate(() => window.api.hidePrompt()); await wait(400); await page.evaluate(() => window.api.showPrompt()); await wait(1600) }
  const readingNow = await page.evaluate(() => document.body.innerText.includes('Back to your note'))
  check('reading a note in the box: the next hint waits unseen', readingNow && !!(await page.$('[data-hint-card]')) && !seen(await hint(false)), `reading ${readingNow}, gem ${JSON.stringify(readGem)}`)
  if (film) for (const look of ['light', 'dark']) {
    const dir = `${shots}/reading-${look}`; mkdirSync(dir, { recursive: true }); await theme(look)
    await roll(dir, '1-reading', 600, async () => {})
  }
  await page.click('button:has-text("Back to your note")').catch(() => {}); await wait(600)
  await pinHint(null)

  // "One line to start", the pill: the hint waits until the pill grows.
  await v('settings:set', { boxOneLine: true })
  await reopen()
  const pillHint = await hint()
  check('the pill: the hint waits unseen', !seen(pillHint), JSON.stringify({ pillHint, pill: await page.evaluate(() => ({ pill: !!document.querySelector('.app-container[data-pill]'), away: document.querySelector('[data-hint-room]')?.getAttribute('data-away'), text: document.querySelector('.app-container')?.innerText.slice(0, 120) })) }))
  // After all the filming before it: the pill at its own width and one line tall, in a page as wide as its window.
  const pillSize = async () => ({
    window: await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.prototype.getSize.call(BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html')))[0]),
    ...(await page.evaluate(() => { const r = document.querySelector('.app-container[data-pill]')?.getBoundingClientRect(); return { page: innerWidth, width: r ? Math.round(r.width) : 0, height: r ? Math.round(r.height) : 0, pill: window.api.room.pill } }))
  })
  const pillAt = await pillSize()
  check('the pill: drawn at its full width, one line tall, in a page as wide as its window', pillAt.width === pillAt.pill && pillAt.height <= 60 && pillAt.page === pillAt.window, JSON.stringify(pillAt))
  await shape('pill', async () => {})
  await v('settings:set', { boxOneLine: false })

  // Recording: the compact recorder card, no hint.
  await reopen()
  await page.click('[data-record-button]'); await wait(450); await page.click('[data-shot="record"]').catch(() => {})
  await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
  await wait(400)
  check('recording: no hint', !seen(await hint()))
  if (film) for (const look of ['light', 'dark']) {
    const dir = `${shots}/recording-${look}`; mkdirSync(dir, { recursive: true }); await theme(look)
    await roll(dir, '1-recording', 800, async () => {})
  }
  await page.keyboard.press('Escape'); await wait(600)
  await page.keyboard.press('Escape'); await wait(600)

  // Lesson mode (the first capture's lesson in the welcome): no hint, as before.
  await reopen()
  await page.evaluate(() => { document.documentElement.setAttribute('data-welcome-ph', ''); document.documentElement.setAttribute('data-welcome-first', '') }); await wait(500)
  check('lesson mode: no hint', !seen(await hint(false)))
  if (film) for (const look of ['light', 'dark']) {
    const dir = `${shots}/lesson-${look}`; mkdirSync(dir, { recursive: true }); await theme(look)
    await roll(dir, '1-lesson', 600, async () => {})
    await roll(dir, '2-type', 500, async () => { await page.click(EDITOR).catch(() => {}); await page.keyboard.type('a') })
    await page.keyboard.press('Backspace')
  }
  await page.evaluate(() => { document.documentElement.removeAttribute('data-welcome-ph'); document.documentElement.removeAttribute('data-welcome-first') }); await wait(300)

  // Focus mode: no hint, as before.
  await reopen()
  await page.keyboard.press('Meta+Shift+KeyF'); await wait(600)
  check('focus mode: no hint', !seen(await hint()))
  await shape('focus')
  await page.evaluate(() => window.api.showPrompt()); await wait(800)
  await page.keyboard.press('Meta+Shift+KeyF'); await wait(600)

} catch (error) {
  check('the run finished', false, error.message.split('\n')[0] + ' ' + (error.stack.match(/hint-room.mjs:\d+/g) ?? []).join(' '))
} finally {
  await c.close?.()
}
done()
