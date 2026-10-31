// A "Side by side" row: each pane shows its own page's icon (Home's house, Settings' gear, a note's kind), the
// card on pointing is the sidebar's own preview (same wait, look and swap from row to row) with nothing to press
// in it, and every action is in the row's right-click menu, said once each.
//
//   npx electron-vite build --outDir out-pair
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-pair/main/index.js HALIGTREE_QA_AWAY=1 node qa/pair-card.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-pair-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/pair-card'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 1000 })
const { h } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
/** A hand coming to rest on a row: a move there, then a small one on it, as a real pointer does. */
const point = async (box, steps = 3) => { await h.mouse.move(box.x + 26, box.y + box.height / 2 - 2, { steps }); await wait(60); await h.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 2 }) }
/** The sidebar and what floats beside it, top to bottom. */
const shot = async () => ({ x: 0, y: 0, width: 760, height: await h.evaluate(() => innerHeight) })
const away = async () => { await h.mouse.move(900, 600, { steps: 2 }); await wait(700) }
/** A drawing's shape, to tell one icon from another: its paths, or an emoji's letter. */
const shape = (el) => el ? (el.querySelector('svg') ? [...el.querySelector('svg').querySelectorAll('path, circle, rect, line')].map((one) => one.getAttribute('d') ?? one.outerHTML.replace(/ class="[^"]*"/, '')).join('|') : el.textContent) : null
/** Floating surfaces on screen: tips, cards, menus. */
const floating = () => h.evaluate(() => document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"], [data-note-preview], [role="menu"]').length)

try {
  await c.theme('light')
  // Home and Settings side by side, open now; and a note beside Home, kept for later.
  const capture = await h.evaluate(async () => (await window.api.captures.list()).find((one) => one.kind === 'quote' && one.status !== 'discarded') ?? null)
  await h.evaluate(([cap]) => {
    const pane = (key, views) => ({ key, trail: { views, at: views.length - 1 } })
    localStorage.setItem('split', JSON.stringify({ panes: [pane('pa', [{ id: 'home' }]), pane('pb', [{ id: 'settings' }])], front: 'pa', sizes: [0.5, 0.5] }))
    localStorage.setItem('split-kept', JSON.stringify(cap ? [{ id: 'kept1', panes: [pane('pc', [{ id: 'inbox', focus: cap }]), pane('pd', [{ id: 'review' }])], front: 'pc', sizes: [0.5, 0.5] }] : []))
  }, [capture?.id ?? null])
  await h.reload()
  await wait(2500)

  const live = h.locator('[data-pair-row="live"]')
  check('the split shows as one row', (await live.count()) === 1)
  // 1. Icons: each pane's is its page's, the one the sidebar draws, never the generic layout drawing.
  const icons = await h.evaluate((src) => {
    const shape = eval(src)
    const row = document.querySelector('[data-pair-row="live"]')
    const panes = [...row.querySelectorAll('[data-pair-pane]')]
    return {
      generic: !!row.querySelector('.lucide-panels-top-left'),
      home: shape(panes[0]),
      settings: shape(panes[1]),
      sideHome: shape(document.querySelector('[data-side-row][aria-label="Home"]')),
      gear: shape(document.querySelector('button[aria-label$=" menu"]'))
    }
  }, shape.toString())
  check('no pane shows the generic layout icon', !icons.generic)
  check('Home pane: the house the sidebar\'s Home row draws', !!icons.home && icons.home === icons.sideHome, `${icons.home?.slice(0, 40)} vs ${icons.sideHome?.slice(0, 40)}`)
  check('Settings pane: the gear at the sidebar\'s foot', !!icons.settings && icons.settings === icons.gear, `${icons.settings?.slice(0, 40)} vs ${icons.gear?.slice(0, 40)}`)
  const kept = h.locator('[data-pair-row="kept"]')
  if (capture) {
    const keptIcons = await kept.evaluate((row) => [...row.querySelectorAll('[data-pair-pane] svg')].map((one) => one.getAttribute('class')))
    check('a kept pair: no generic icon, a note keeps its kind\'s', keptIcons.length === 2 && keptIcons.every((one) => !/panels-top-left/.test(one)), keptIcons.join(' | '))
  }

  // 2. The card: the sidebar's preview, after its wait, with nothing to press.
  await h.locator('[data-side-heading="split"]').scrollIntoViewIfNeeded()
  await wait(300)
  const box = await live.boundingBox()
  /** How long a row takes to show its preview, from a pointer coming to rest on it from the page. */
  const delay = async (target, card) => {
    await h.mouse.move(900, target.y + target.height / 2 - 2, { steps: 2 })
    await wait(1500)
    await h.mouse.move(target.x + 26, target.y + target.height / 2 - 2, { steps: 1 })
    const from = Date.now()
    await h.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 2 })
    await h.locator(card).first().waitFor({ timeout: 3000 }).catch(() => {})
    return Date.now() - from
  }
  const homeBox = await h.locator('[data-side-row][aria-label="Home"]').first().boundingBox()
  const homeTook = await delay(homeBox, '[data-peek-card]')
  const took = await delay(box, '[data-pair-card]')
  check('the card waits as long as a page row\'s preview does', took > 250 && Math.abs(took - homeTook) < 250, `pair ${took}ms, Home ${homeTook}ms`)
  const card = h.locator('[data-pair-card]')
  check('the card is there after a moment\'s rest', (await card.count()) === 1, await h.evaluate(() => [document.querySelectorAll('[data-peek-card]').length, document.querySelector('[data-pair-row="live"]')?.matches(':hover'), document.elementFromPoint(40, 300)?.outerHTML.slice(0, 80)].join(' ')))
  const inside = await h.evaluate(() => {
    const surface = document.querySelector('[data-pair-card]')?.closest('[data-slot="tooltip-content"]') ?? document.querySelector('[data-pair-card]')?.closest('[role="tooltip"]')?.parentElement
    const card = document.querySelector('[data-pair-card]')
    const panes = [...card.querySelectorAll('[data-pair-card-pane]')].map((one) => ({ x: one.getBoundingClientRect().left, text: one.textContent }))
    const peek = document.querySelector('[data-peek-card]')
    return {
      buttons: peek?.querySelectorAll('button, a, [role="button"], input').length ?? -1,
      panes,
      text: peek?.textContent ?? '',
      sameAsPages: !!peek && !!card.closest('[data-peek-card]'),
      generic: !!card.querySelector('.lucide-panels-top-left'),
      surface: surface ? getComputedStyle(surface).backgroundColor : null
    }
  })
  check('the card has nothing to press in it', inside.buttons === 0, String(inside.buttons))
  check('it is the sidebar\'s own preview card (peek.tsx)', inside.sameAsPages)
  check('the panes sit as on screen: Home on the left, Settings on the right', inside.panes.length === 2 && inside.panes[0].x < inside.panes[1].x && /Home/.test(inside.panes[0].text) && /Settings/.test(inside.panes[1].text), JSON.stringify(inside.panes))
  check('no generic icon in the card either', !inside.generic)
  check('its line says right-click holds the rest', /Right-click for more/.test(inside.text), inside.text.slice(-80))
  check('one surface on hover', (await floating()) === 1, String(await floating()))
  await h.screenshot({ path: `${dir}/card-light.png`, clip: await shot() })

  // Row to row: the next row's card comes at once, as Home's does after Inbox's.
  if (capture) {
    const kb = await kept.boundingBox()
    await point(kb, 2)
    await wait(120)
    const swapped = await h.evaluate(() => document.querySelector('[data-pair-card] [data-pair-card-pane="1"]')?.textContent ?? '')
    check('moving to the next pair row, its card swaps in at once', /Review/.test(swapped), swapped)
    await point(box, 2)
    await wait(120)
  }
  // From a page row to the pair row: the same at-once swap the sidebar's pages have.
  const homeRow = await h.locator('[data-side-row][aria-label="Home"]').first().boundingBox()
  await away()
  await point(homeRow)
  await wait(900)
  await h.screenshot({ path: `${dir}/home-peek-light.png`, clip: await shot() })
  await point(box, 4)
  await wait(120)
  check('from Home\'s row, the pair\'s card comes at once', (await h.locator('[data-pair-card]').count()) === 1)
  await away()

  // 3. The right-click menu holds every action, each once.
  await live.click({ button: 'right' })
  await wait(400)
  check('right-click puts the card away: only the menu shows', (await h.locator('[data-pair-card]').count()) === 0 && (await h.locator('[role="menu"]').count()) === 1)
  const words = (await h.locator('[role="menu"]').last().locator('[role^="menuitem"]').allInnerTexts()).map((one) => one.trim().split('\n')[0])
  for (const want of ['Open “Home” alone', 'Open “Settings” alone', 'Close “Home”', 'Close “Settings”', 'Rename…', 'Close the split', 'Pin the layout']) check(`the menu has ${want}`, words.includes(want), words.join(' | '))
  const twice = words.filter((one, at) => words.indexOf(one) !== at)
  check('no line twice; no Separate, Close pane or Close other panes beside Close the split', !twice.length && !words.some((one) => /^(Separate|Close pane|Close other panes)$/.test(one)), words.join(' | '))
  // Hover every line: no tip on any of them.
  const lines = h.locator('[role="menu"]').last().locator('[role^="menuitem"]')
  let tips = 0
  for (let at = 0; at < await lines.count(); at++) {
    await lines.nth(at).hover()
    await wait(700)
    tips += await h.evaluate(() => document.querySelectorAll('[data-slot="tooltip-content"], [data-pair-card]').length)
  }
  check('hovering every menu line shows no tip or card', tips === 0, String(tips))
  await h.screenshot({ path: `${dir}/menu-light.png`, clip: await shot() })
  const cursor = await lines.first().evaluate((one) => getComputedStyle(one).cursor)
  check('menu lines show the hand', cursor === 'pointer', cursor)
  // Close “Settings”: Home is left alone on screen.
  await h.locator('[role="menuitem"]', { hasText: 'Close “Settings”' }).click()
  await wait(900)
  const left = await h.evaluate(() => JSON.parse(localStorage.getItem('split') ?? localStorage.getItem('pane-one') ?? 'null')?.panes?.map((one) => one.trail.views[one.trail.at].id))
  check('Close “Settings” closes that pane', JSON.stringify(left) === '["home"]', JSON.stringify(left))
  await h.keyboard.press('Meta+z')
  await wait(900)

  // Dark, beside the Home row's preview and the menu.
  await c.look('dark')
  const box2 = await h.locator('[data-pair-row]').first().boundingBox()
  await point(box2)
  await wait(900)
  await h.screenshot({ path: `${dir}/card-dark.png`, clip: await shot() })
  await away()
  await point(homeRow)
  await wait(900)
  await h.screenshot({ path: `${dir}/home-peek-dark.png`, clip: await shot() })
  await away()
  await h.locator('[data-pair-row]').first().click({ button: 'right' })
  await wait(400)
  await h.screenshot({ path: `${dir}/menu-dark.png`, clip: await shot() })
  await h.keyboard.press('Escape')
  await c.look('light')

  // Rename… from the menu: a field in the row, no card over it.
  await h.locator('[data-pair-row]').first().click({ button: 'right' })
  await wait(300)
  await h.locator('[role="menuitem"]', { hasText: 'Rename…' }).click()
  await wait(500)
  check('Rename… gives the row a field to type in', (await h.locator('[data-pair-rename]').count()) === 1)
  const rb = await h.locator('[data-pair-rename]').boundingBox()
  await h.mouse.move(rb.x + 10, rb.y + 5, { steps: 3 })
  await wait(900)
  check('no card over a name being typed', (await h.locator('[data-pair-card]').count()) === 0)
  await h.keyboard.type('Reading')
  await h.keyboard.press('Enter')
  await wait(500)
  check('the name is kept', (await h.locator('[data-pair-name]').innerText().catch(() => '')).includes('Reading'))
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
