// The board's lists are managed from the board: renamed in place, moved, given a colour, deleted with Undo; a
// right click never picks a line by its own release; a card can become a study card; the first visit teaches the
// keys; the title sits on the board's left edge; list names are 15px; lists get distinct colours in order.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/board-manage.mjs
// SHOTS=dir keeps the pictures.
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? join(tmpdir(), `board-manage-${Date.now()}`)
mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1440, height: 860 })
const { h, v, send, both } = s
const wait = (ms = 300) => h.waitForTimeout(ms)
const lanes = () => h.evaluate(() => [...document.querySelectorAll('[data-board] [data-lane]')].map((one) => `${one.querySelector('[data-lane-name]')?.textContent}:${one.querySelectorAll('[data-board-card]').length}`).join(' | '))
const lines = () => h.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1)
  return menu ? [...menu.querySelectorAll(':scope [role^="menuitem"]')].map((one) => one.textContent.trim()).filter(Boolean) : []
})
const toasts = () => h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).join(' | '))
const shut = async () => { await h.keyboard.press('Escape'); await wait(300) }
const pick = async (label) => {
  const item = h.locator('[role="menu"] [role^="menuitem"]', { hasText: label }).last()
  await item.hover()
  await wait(80)
  await item.click()
  await wait(500)
}
const lane = (name) => h.locator('[data-board] [data-lane]', { has: h.locator('[data-lane-name]', { hasText: name }) }).first()
const body = async (id) => JSON.stringify((await v('item', id))?.body ?? '')
try {
  await v('settings:set', { hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Moving house', body: '## Todo\n\n- [ ] pack the van\n- [ ] book the ferry\n- [ ] What is the ferry company called? :: Red Funnel #travel\n\n## Doing\n\n- [ ] sell the sofa\n\n## A list with a very long name that cannot fit on the heading\n\n- [ ] one\n\n## Done\n\n- [x] sell the bike\n' })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  await send('view', 'articles')
  await wait(1200)
  await send('article', id)
  await wait(1800)
  check('the page is a board', await h.evaluate(() => !!document.querySelector('[data-board] section')), await lanes())
  await h.mouse.move(900, 820)
  await both(join(shots, 'board'))

  // Layout and type: the title on the lists' left edge, names at 15px, a colour each, all different.
  const look = await h.evaluate(() => {
    const first = document.querySelector('[data-board] [data-lane]').getBoundingClientRect().left
    const head = document.querySelector('[data-page-title]')
    // The heading step of the type scale (0.9375rem: 15px at the app's normal size).
    const name = parseFloat(getComputedStyle(document.querySelector('[data-board] [data-lane-name]')).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize) * 16 + 'px'
    const dots = [...document.querySelectorAll('[data-board] [data-lane-dot]')].map((one) => getComputedStyle(one).backgroundColor)
    const hint = document.querySelector('[data-board] [data-hint-line="board"]')
    return { first: Math.round(first), title: head ? Math.round(head.getBoundingClientRect().left) : null, name, dots, hint: hint?.textContent ?? '', hintLeft: hint ? Math.round(hint.getBoundingClientRect().left) : null }
  })
  check('the title starts on the first list\'s left edge (before, 225px right of it)', look.title !== null && Math.abs(look.title - look.first) <= 2, JSON.stringify(look))
  check('list names are 15px', look.name === '15px', look.name)
  check('four lists, four different colours', new Set(look.dots).size === look.dots.length && look.dots.length === 4, look.dots.join(' '))
  check('the first board says what it is and its keys, on the lists\' left edge', /Each heading is a list/.test(look.hint) && /R renames a list/.test(look.hint) && Math.abs(look.hintLeft - look.first) <= 2, JSON.stringify(look))
  // Cut names: the whole name in a tip.
  await lane('A list with').locator('[data-lane-name]').hover()
  await wait(900)
  const tip = await h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]')].map((one) => one.textContent).join(' | '))
  check('a list name cut short shows whole in a tip', tip.includes('A list with a very long name that cannot fit on the heading'), tip)
  await h.mouse.move(900, 820)
  await wait(300)

  // Right-click safety: a right click opens the card's menu where it was clicked, and its own release, even over a
  // line ("Done"), picks nothing.
  const van = h.locator('[data-board] [data-board-card]', { hasText: 'pack the van' }).first()
  const box = await van.boundingBox()
  await h.mouse.move(box.x + 60, box.y + box.height / 2)
  await h.mouse.down({ button: 'right' })
  await wait(300)
  const right = await lines()
  const menuBox = await h.evaluate(() => { const one = [...document.querySelectorAll('[role="menu"]')].at(-1)?.getBoundingClientRect(); return one && { x: Math.round(one.left), y: Math.round(one.top) } })
  check('a right click opens the card\'s menu where it was clicked', !!menuBox && Math.abs(menuBox.x - (box.x + 60)) < 12 && Math.abs(menuBox.y - (box.y + box.height / 2)) < 12, `${JSON.stringify(menuBox)} vs ${Math.round(box.x + 60)},${Math.round(box.y + box.height / 2)}`)
  check('its lines: Make a study card among them, Delete card last', right.some((one) => one.startsWith('Make a study card')) && /^Delete card/.test(right.at(-1)), right.join(' | '))
  // A menu pushed up under the pointer (a tall card, the window's foot): the button let go where it went down, over
  // "Done". Its release comes to the line as it would, at the press's own place.
  const press = { x: box.x + 60, y: box.y + box.height / 2 }
  const isTicked = () => h.evaluate(() => [...document.querySelectorAll('[data-board] [data-board-card]')].find((one) => one.textContent.includes('pack the van'))?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'))
  const release = (at) => h.evaluate(({ x, y }) => { const line = [...[...document.querySelectorAll('[role="menu"]')].at(-1).querySelectorAll('[role^="menuitem"]')].find((one) => /^Done/.test(one.textContent.trim())); line.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, pointerType: 'mouse' })) }, at)
  await release(press)
  await wait(400)
  check('letting go of the right click where it went down, over "Done", ticks nothing, and the menu stays', (await isTicked()) === 'false' && (await lines()).length > 0, `ticked ${await isTicked()}`)
  await h.mouse.up({ button: 'right' })
  await wait(200)
  // Carried onto "Done" and let go there, as a Mac menu allows: that picks it.
  const doneLine = await h.locator('[role="menu"] [role^="menuitem"]', { hasText: /^Done/ }).last().boundingBox()
  await release({ x: doneLine.x + 20, y: doneLine.y + doneLine.height / 2 })
  await wait(500)
  check('pressed, carried onto "Done" and let go there, it ticks the card', (await isTicked()) === 'true', `ticked ${await isTicked()}`)
  await h.keyboard.press('Meta+z')
  await wait(400)
  await shut()
  // The ⋯ opens the same lines, under it.
  await van.hover()
  await van.locator('[data-card-more]').click()
  await wait(300)
  const dots = await lines()
  check('the ⋯ opens the same lines as a right click', dots.join('|') === right.join('|'), dots.join(' | '))
  await shut()

  // A study card from a card.
  await h.locator('[data-board] [data-board-card]', { hasText: 'ferry company' }).first().click({ button: 'right', position: { x: 40, y: 12 } })
  await wait(300)
  await pick('Make a study card')
  const said = await toasts()
  const cards = [...await v('items', 'card'), ...await v('items', 'nugget')]
  const found = cards.find((one) => /ferry company/.test(one.title ?? ''))
  const made = found && { ...found, ...(await v('item', found.id)) }
  check('"Make a study card" makes one, question then answer, its tag with it, with Undo', /Study card made/.test(said) && /Undo/.test(said) && !!made && made.title === 'What is the ferry company called?' && /Red Funnel/.test(JSON.stringify(made.body)) && /#travel/.test(JSON.stringify(made.body)), `${said} / ${JSON.stringify(made && { title: made.title, body: made.body })}`)
  await h.locator('[data-board] [data-board-card]', { hasText: 'pack the van' }).first().click({ button: 'right', position: { x: 40, y: 12 } })
  await wait(300)
  await pick('Make a study card')
  check('a card with no answer is told how to give it one', /needs its answer/.test(await toasts()), await toasts())

  // Rename a list in place from its menu.
  await lane('Doing').locator('header').click({ button: 'right', position: { x: 100, y: 20 } })
  await wait(300)
  const laneLines = await lines()
  check('a list\'s menu: rename, colour, move, delete last', ['Rename list', 'Move left', 'Move right'].every((one) => laneLines.some((line) => line.startsWith(one))) && /^Delete list/.test(laneLines.at(-1)), laneLines.join(' | '))
  await pick('Rename list')
  await h.keyboard.type('In progress')
  await h.keyboard.press('Enter')
  await wait(600)
  check('Rename list names it in place, in the note too', (await lanes()).includes('In progress:1') && (await body(id)).includes('In progress'), `${await lanes()} / ${(await body(id)).slice(0, 120)}`)

  // Colour from the list menu.
  const colourBefore = await lane('In progress').locator('[data-lane-dot]').evaluate((one) => getComputedStyle(one).backgroundColor)
  await lane('In progress').locator('header').click({ button: 'right', position: { x: 100, y: 20 } })
  await wait(300)
  await h.locator('[role="menu"] [role="menuitemradio"][aria-label="Pink"]').last().click()
  await wait(400)
  const colourAfter = await lane('In progress').locator('[data-lane-dot]').evaluate((one) => getComputedStyle(one).backgroundColor)
  check('a colour picked from the list menu is the list\'s', colourBefore !== colourAfter, `${colourBefore} -> ${colourAfter}`)

  // Move right, the colour going with it.
  await lane('In progress').locator('header').click({ button: 'right', position: { x: 100, y: 20 } })
  await wait(300)
  await pick('Move right')
  await wait(400)
  const order = await lanes()
  const moved = await lane('In progress').locator('[data-lane-dot]').evaluate((one) => getComputedStyle(one).backgroundColor)
  check('Move right moves the list one place, its colour with it', /^Todo:3 \| A list with[^|]+\| In progress:1/.test(order) && moved === colourAfter, `${order} / ${moved}`)

  // Delete a list: gone, with Undo; ⌘Z brings it back.
  await lane('In progress').locator('header').click({ button: 'right', position: { x: 100, y: 20 } })
  await wait(300)
  await pick('Delete list')
  const gone = await lanes()
  const del = await toasts()
  check('Delete list takes it and its card away, saying so with Undo', !gone.includes('In progress') && /Deleted the list In progress and its card/.test(del) && /Undo/.test(del), `${gone} / ${del}`)
  await h.locator('[data-board]').focus()
  await h.keyboard.press('Meta+z')
  await wait(600)
  check('⌘Z brings the list back', (await lanes()).includes('In progress:1'), await lanes())

  // Keys: R renames the list the cursor is in, F folds it, ⌥⇧← moves it.
  await h.locator('[data-board] [data-board-card]', { hasText: 'pack the van' }).first().click()
  await wait(200)
  await h.keyboard.press('r')
  await wait(300)
  check('R opens the list\'s name to type over', await h.evaluate(() => !!document.querySelector('[data-board] [data-lane] input[data-name-in-place]')))
  await h.keyboard.press('Escape')
  await wait(300)
  check('Esc leaves the name as it was', (await lanes()).startsWith('Todo:3'), await lanes())
  await h.keyboard.press('ArrowRight')
  await wait(150)
  await h.keyboard.press('Alt+Shift+ArrowLeft')
  await wait(600)
  check('⌥⇧← moves the list the cursor is in one place left', /^A list with/.test(await lanes()), await lanes())
  await h.keyboard.press('f')
  await wait(500)
  const folded = await h.evaluate(() => { const one = document.querySelector('[data-board] [data-lane][data-folded]'); const board = document.querySelector('[data-board-strip]'); return one && { h: Math.round(one.getBoundingClientRect().height), board: Math.round(board.getBoundingClientRect().height) } })
  check('F folds it, to a strip as tall as its name, not the whole board', !!folded && folded.h < folded.board - 100, JSON.stringify(folded))
  await h.mouse.move(900, 820)
  await both(join(shots, 'managed'))

  // Frames every 50ms: a card deleted with ⌫ fades where it stands, then the cards under it glide up; a list moved
  // with ⌥⇧→ glides along. Read in the page per frame, and shot.
  mkdirSync(join(shots, 'frames'), { recursive: true })
  await h.locator('[data-board] [data-board-card]', { hasText: 'pack the van' }).first().click()
  await wait(200)
  await h.evaluate(() => {
    window.__frames = []
    const read = () => {
      const lane = [...document.querySelectorAll('[data-board] [data-lane]')].find((one) => one.querySelector('[data-lane-name]')?.textContent === 'Todo')
      const cards = [...(lane?.querySelectorAll('[data-board-card]') ?? [])]
      window.__frames.push({ t: performance.now(), n: cards.length, ops: cards.map((one) => Number(getComputedStyle(one).opacity).toFixed(2)).join(','), ys: cards.map((one) => Math.round(one.getBoundingClientRect().top)).join(',') })
      if (window.__frames.length < 120) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  await h.keyboard.press('Backspace')
  for (let at = 0; at < 10; at++) { const t0 = Date.now(); await h.screenshot({ path: join(shots, 'frames', `delete-${String(at).padStart(2, '0')}.png`) }); await wait(Math.max(0, 50 - (Date.now() - t0))) }
  await wait(400)
  const frames = await h.evaluate(() => window.__frames)
  const faded = frames.some((one) => one.n === 3 && one.ops.split(',').some((op) => op !== '1.00' && Number(op) > 0))
  const goneAt = frames.findIndex((one) => one.n === 2)
  const ys = frames.slice(goneAt, goneAt + 12).map((one) => one.ys.split(',')[0])
  check('⌫ on a card: it fades where it stands, then it goes and the next card glides up into its room', faded && goneAt > 0 && new Set(ys).size > 2, `faded ${faded}; gone at frame ${goneAt}; first card top ${ys.join(' ')}`)
  check('the deleted card\'s place is drawn whole again for the card that took it', (await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-board-card]')].filter((one) => getComputedStyle(one).opacity !== '1').length)) === 0)
  await h.keyboard.press('Meta+z')
  await wait(500)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await s.close()
}
done()
