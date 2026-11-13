// A sticky's right-click menu is Haligtree's own, in one menu window over the desktop (main's popup-menu.ts,
// windows/menu.tsx), never the Mac's see-through one. Each kind of sticky (a note, Today, all goals, one goal) is
// right-clicked: the menu opens at the pointer, inside the screen, opaque (its fill's alpha read, and the window's
// page captured and saved, light and dark); its own lines come first ("Open in Haligtree", "Take it down"), then
// the desk's lines (Tidy, the fold into pills) in the same menu, the screen round it left clear; Esc and a click off it put it away and hand the keys back; Open and
// Take it down do their jobs; Today's task menu opens through the same window.
//
//   npx electron-vite build --outDir out-sm
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-sm/main/index.js HALIGTREE_QA_AWAY=1 node qa/sticky-menu.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.QA_SHOTS ?? join(tmpdir(), 'sticky-menu-shots')
mkdirSync(shots, { recursive: true })

const c = await sandbox()
const { electron, h, v } = c
try {
  const stickyWins = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky')).map((w) => ({ id: w.id, url: w.webContents.getURL() })))
  const state = () => electron.evaluate(() => globalThis.qaPopupMenu ?? {})
  await v('settings:set', { stickiesGlass: false })
  await wait(2000)
  const pageOf = async (match) => {
    for (let i = 0; i < 60; i++) {
      const page = electron.windows().find((p) => p.url().includes('view=sticky') && match(p.url()))
      if (page) return (await page.waitForLoadState('domcontentloaded'), await wait(1500), page)
      await wait(250)
    }
    return null
  }
  const menuPage = () => electron.windows().find((p) => p.url().includes('view=menu'))
  /** Right-click a point in a sticky, and wait for the menu window to say it is open. */
  const rightClick = async (page, selector) => {
    const box = await page.locator(selector).first().boundingBox()
    const x = Math.round(box.x + Math.min(30, box.width / 2)), y = Math.round(box.y + Math.min(30, box.height / 2))
    await page.mouse.click(x, y, { button: 'right' })
    for (let i = 0; i < 40; i++) {
      const s = await state()
      if (s.open && menuPage()) {
        const m = menuPage()
        await m.waitForSelector('[data-popup-menu]', { timeout: 3000 })
        await wait(250)
        return { s, m, x, y }
      }
      await wait(100)
    }
    return { s: await state(), m: null, x, y }
  }
  const words = (m) => m.$$eval('[data-popup-menu] [role^="menuitem"], [data-popup-menu] [data-slot="context-menu-label"]', (rows) => rows.map((r) => (r.getAttribute('aria-label') || r.querySelector('.truncate')?.textContent || r.textContent).trim()))
  /** Where the menu sits, against the window (the work area), and its fill. */
  const looks = (m) => m.evaluate(() => {
    const menu = document.querySelector('[data-popup-menu]')
    const box = menu.getBoundingClientRect()
    const fill = getComputedStyle(menu).backgroundColor
    // "rgb(…)" is whole; "rgba(…, a)", "oklch(… / a)" and "color(srgb … / a)" say their alpha last.
    const said = fill.match(/\/\s*([\d.]+%?)\s*\)$/) ?? fill.match(/^rgba\([^)]*,\s*([\d.]+)\)$/)
    const alpha = said ? parseFloat(said[1]) / (said[1].endsWith('%') ? 100 : 1) : 1
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight, fill, alpha, frost: getComputedStyle(menu).backdropFilter }
  })
  const capture = async (name) => {
    const s = await state()
    const m = menuPage()
    const box = await m.evaluate(() => { const all = [...document.querySelectorAll('[data-popup-menu], [data-slot="context-menu-sub-content"]')].map((el) => el.getBoundingClientRect()); const r = { left: Math.min(...all.map((b) => b.left)), top: Math.min(...all.map((b) => b.top)), width: Math.max(...all.map((b) => b.right)) - Math.min(...all.map((b) => b.left)), height: Math.max(...all.map((b) => b.bottom)) - Math.min(...all.map((b) => b.top)) }; return { x: Math.floor(r.left) - 12, y: Math.floor(r.top) - 12, width: Math.ceil(r.width) + 40, height: Math.ceil(r.height) + 24 } })
    const path = join(shots, `${name}.png`)
    await electron.evaluate(async ({ BrowserWindow }, [id, box, path]) => {
      const img = await BrowserWindow.fromId(id).webContents.capturePage(box)
      process.getBuiltinModule('fs').writeFileSync(path, img.toPNG())
    }, [s.winId, box, path])
    return path
  }
  const esc = async (m) => {
    await m.keyboard.press('Escape')
    for (let i = 0; i < 20 && (await state()).open; i++) await wait(100)
    return state()
  }
  /** The pointer brought onto a line as a hand does, over a few moves: a menu's rows answer only a pointer that really moves (lib/real-move.ts). */
  const reach = async (m, name) => {
    for (let i = 0; i < 4; i++) {
      const b = await m.getByRole('menuitem', { name }).boundingBox()
      await m.mouse.move(b.x + 20, b.y + b.height / 2 - 30)
      await m.mouse.move(b.x + 30 + i, b.y + b.height / 2, { steps: 5 })
      if (await m.waitForSelector('[data-slot="context-menu-sub-content"]', { timeout: 1500 }).catch(() => null)) return
    }
  }
  const heard = (page) => page.evaluate(() => window.haligtreeHeard ?? [])

  // A note on the desktop.
  const id = await h.evaluate(() => window.api.captures.create({ title: 'Menu me', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Some words that sit under the menu' }] }] } }))
  await h.evaluate((id) => window.api.stick('capture', id, true), id)
  const note = await pageOf((u) => u.includes(`id=${id}`))
  check('the note sticky came out', !!note)

  for (const theme of ['light', 'dark']) {
    const { s, m, x, y } = await rightClick(note, '.mf-card')
    check(`${theme}: right-click opens Haligtree's menu window`, !!m && s.open === true, JSON.stringify(s))
    if (!m) continue
    await m.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(400)
    const l = await looks(m)
    // The menu's top left at the point right-clicked, or flipped back from an edge, and 12px inside the work area.
    const at = { x: s.point.x, y: s.point.y }
    check(`${theme}: the menu opens at the pointer`, (Math.abs(l.left - at.x) <= 2 || Math.abs(l.right - at.x) <= 2) && (Math.abs(l.top - at.y) <= 2 || Math.abs(l.bottom - at.y) <= 2), JSON.stringify({ l, at, sticky: { x, y } }))
    check(`${theme}: the menu is 12px inside the screen's work area`, l.left >= 11.5 && l.top >= 11.5 && l.right <= l.width - 11.5 && l.bottom <= l.height - 11.5, JSON.stringify(l))
    check(`${theme}: the window covers the screen's work area`, JSON.stringify(s.area) && l.width === s.area.width && l.height === s.area.height, JSON.stringify({ area: s.area, l }))
    check(`${theme}: the menu is opaque (fill alpha 1, no backdrop blur)`, l.alpha === 1 && (l.frost === 'none' || !l.frost), `${l.fill} ${l.frost}`)
    const said = await words(m)
    check(`${theme}: its own lines come first, then every sticky's lines in the menu itself (no "All stickies" step)`, said[0] === 'Open in Haligtree' && said[1] === 'Take it down' && said.includes('Paper colour') && !said.includes('All stickies') && /^(Fold every card into its pill|Open the cards it folded)/.test(said.at(-1) ?? '') && said.some((one) => one.startsWith('Tidy stickies')), said.join(' | '))
    // The window's clear room stays clear while the menu is open: filled, the whole screen went the theme's colour.
    const room = await m.$eval('[data-menu-room]', (el) => getComputedStyle(el).backgroundColor)
    check(`${theme}: the screen round the menu stays clear`, /rgba\(0, 0, 0, 0\)|transparent/.test(room), room)
    check(`${theme}: every line has its icon`, await m.$$eval('[data-popup-menu] [role="menuitem"]', (rows) => rows.every((r) => r.querySelector('svg'))))
    console.log(`  ${theme} menu: ${await capture(`note-menu-${theme}`)}`)
    const after = await esc(m)
    check(`${theme}: Esc puts it away, choosing nothing, keys handed back`, after.open === false && after.picked === null && after.focusBack === true, JSON.stringify(after))
  }

  // A click off the menu puts it away.
  {
    const { m } = await rightClick(note, '.mf-card')
    await m.mouse.click(4, 4)
    for (let i = 0; i < 20 && (await state()).open; i++) await wait(100)
    const s = await state()
    check('a click off the menu puts it away, choosing nothing', s.open === false && s.picked === null, JSON.stringify(s))
  }

  // Tidy, in the menu itself, runs from it.
  {
    const { m } = await rightClick(note, '.mf-card')
    const before = (await stickyWins()).length
    await m.getByRole('menuitem', { name: /Tidy stickies/ }).click()
    for (let i = 0; i < 20 && (await state()).open; i++) await wait(100)
    const s = await state()
    check('Tidy, chosen from the menu, runs and the menu goes', s.open === false && Array.isArray(s.picked) && s.picked.length === 1, JSON.stringify(s))
    await wait(1500)
    check('tidying kept every sticky out', (await stickyWins()).length === before)
  }

  // Open in Haligtree: the sticky's ↗, its page growing out of it, with the open sound.
  {
    const { m } = await rightClick(note, '.mf-card')
    const was = (await heard(note)).filter((one) => one.includes('open')).length
    await m.getByRole('menuitem', { name: 'Open in Haligtree' }).click()
    await wait(900)
    const now = (await heard(note)).filter((one) => one.includes('open')).length
    check('"Open in Haligtree" opens it as its ↗ does (the open sound, from the sticky)', now > was, JSON.stringify(await heard(note)))
    const shown = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.getURL())
    check('…and the main window holds it', !!shown)
  }

  // Take it down: at once, no second press; the sticky goes.
  {
    const { m } = await rightClick(note, '.mf-card')
    await m.getByRole('menuitem', { name: 'Take it down' }).click()
    let gone = false
    for (let i = 0; i < 40 && !gone; i++) (gone = !(await stickyWins()).some((one) => one.url.includes(`id=${id}`))), gone || (await wait(150))
    check('"Take it down" takes the note down at once', gone)
  }

  // Today, the goals together, one goal: each has the same menu of its own.
  const goals = (await v('items', 'goal')) ?? []
  const kinds = [['today', 'today', 'Today']]
  await h.evaluate(() => window.api.stick('today', 'today', true))
  await h.evaluate(() => window.api.stick('goals', 'goals', true))
  kinds.push(['goals', 'goals', 'All goals'])
  const goal = Array.isArray(goals) ? goals.find((one) => one && one.id && one.goalAt && !one.closedHow && !one.closedAt && !one.archivedAt) : null
  check('the sandbox has an open goal to stick', !!goal)
  // One goal's card is stuck when its turn comes, once the goals sticky is down: while that is up the goals share it.
  if (goal) kinds.push(['goal', goal.id, 'One goal'])
  for (const [type, gid, name] of kinds) {
    if (type === 'goal') await h.evaluate((id) => window.api.stick('goal', id, true), gid)
    const page = await pageOf((u) => u.includes(`type=${type}&`) && u.includes(`id=${encodeURIComponent(gid)}`))
    check(`${name}: its sticky came out`, !!page)
    if (!page) continue
    const target = type === 'today' ? '.mf-card' : type === 'goals' ? '[data-goals-sticky]' : '[data-goal-card]'
    const { s, m } = await rightClick(page, target)
    check(`${name}: right-click opens the menu window`, !!m && s.open)
    if (!m) continue
    const said = await words(m)
    // A pill (a goal's card starts as one) says "Keep open" before the card's own lines.
    const own = said[0] === 'Keep open' ? said.slice(1) : said
    check(`${name}: Open in Haligtree and Take it down first (after "Keep open" on a pill), Tidy and the fold last`, own[0] === 'Open in Haligtree' && own[1] === 'Take it down' && /^(Fold every card into its pill|Open the cards it folded)/.test(said.at(-1) ?? '') && said.some((one) => one.startsWith('Tidy stickies')), said.join(' | '))
    check(`${name}: opaque`, (await looks(m)).alpha === 1)
    console.log(`  ${name}: ${await capture(`${type}-menu`)}`)
    await esc(m)
    // Today's task lines keep their own menu, now in the same window.
    if (type === 'today') {
      const task = await page.$('[data-sticky-task]')
      if (task) {
        const t = await rightClick(page, '[data-sticky-task]')
        const lines = t.m ? await words(t.m) : []
        check("Today: a task's right-click opens its task menu in the menu window", !!t.m && lines.length > 3 && !lines.some((one) => one.startsWith('Tidy stickies')), lines.join(' | '))
        if (t.m) console.log(`  Today task: ${await capture('today-task-menu')}`)
        if (t.m) {
          await t.m.getByRole('menuitem').first().click()
          for (let i = 0; i < 20 && (await state()).open; i++) await wait(100)
          const after = await state()
          check("Today: a task line chosen there runs (its place goes back)", after.open === false && Array.isArray(after.picked), JSON.stringify(after))
        }
      } else check('Today: the sandbox has a task on Today to right-click', false)
    }
    // One goal: its All stickies opens beside, and Open in Haligtree brings the goal up in the main window.
    if (type === 'goal') {
      {
        const { m } = await rightClick(page, target)
        const sub = await words(m)
        check('One goal: Tidy is in its menu', sub.some((one) => one.startsWith('Tidy stickies down the right edge')), sub.join(' | '))
        await esc(m)
      }
      {
        const { m } = await rightClick(page, target)
        await m.getByRole('menuitem', { name: 'Open in Haligtree' }).click()
        let shown = null
        for (let i = 0; i < 30 && !shown; i++) {
          shown = await h.evaluate((title) => document.body.innerText.includes(title) && location.href, goal.title).catch(() => null)
          if (!shown) await wait(200)
        }
        check('One goal: "Open in Haligtree" shows the goal in the main window', !!shown, String(shown))
        check('One goal: …and the menu is gone', (await state()).open === false)
      }
    }
    // Take it down from the menu: the card goes at once.
    const again = await rightClick(page, target)
    await again.m.getByRole('menuitem', { name: 'Take it down' }).click()
    let gone = false
    for (let i = 0; i < 40 && !gone; i++) (gone = !(await stickyWins()).some((one) => one.url.includes(`type=${type}&`) && one.url.includes(`id=${encodeURIComponent(gid)}`))), gone || (await wait(150))
    check(`${name}: "Take it down" takes it down at once`, gone)
    // …and it stays down: nothing puts it back by itself a moment later.
    await wait(4000)
    check(`${name}: still down 4 seconds later`, !(await stickyWins()).some((one) => one.url.includes(`type=${type}&`) && one.url.includes(`id=${encodeURIComponent(gid)}`)))
  }
  check('no page errors', c.errors.length === 0, c.errors.join('\n'))
} finally {
  await c.close()
}
done()
