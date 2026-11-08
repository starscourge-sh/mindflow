// A note seen as a board looks made by the same hand as the group panels: each list a faint panel in its
// colour with a dot, a chevron, its name and count; cards on the page's paper with a picture, tags and a date
// where they have them; "Add a list" named in place. Shot light and dark, wide and narrow (lists scroll
// sideways inside the board, the page never does), a card's drag filmed every 50ms, and the list gestures tried.
//
//   npx electron-vite build --outDir out-board
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-board/main/index.js HALIGTREE_QA_AWAY=1 node qa/board-look.mjs
//
// SHOTS=dir keeps the pictures (default: a folder in the system's temp).
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? join(tmpdir(), `board-look-${Date.now()}`)
mkdirSync(join(shots, 'drag'), { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 860 })
const { h, v, send, size, both, look } = s
const wait = (ms = 300) => h.waitForTimeout(ms)
const lanes = () => h.evaluate(() => [...document.querySelectorAll('[data-board] [data-lane] h3')].map((one) => `${one.textContent}:${one.closest('[data-lane]').querySelectorAll('[data-board-card]').length}`).join(' | '))
const open = async (id) => { await send('article', id); await wait(1800) }

try {
  await v('settings:set', { hintRate: 0 })
  const items = await v('items', 'article')
  const shelf = items.find((one) => one.title === 'Reading this winter')
  check('the sandbox has the board note', !!shelf)
  // A board with what a card can show: a picture, tags, a date, a long title.
  const dot = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#c9a66b"/><circle cx="90" cy="80" r="44" fill="#7a5c3a"/></svg>').toString('base64')
  const rich = await v('article:new')
  await v('item:save', rich, { title: 'Board look', body: `## Ideas\n\n- A short one\n- With a picture\n\n  ![](${dot})\n- Tagged for later #reading #slow\n- Due soon @{2026-11-20}\n- A very long title that keeps going well past one line and past two lines, so the card has to stop it at three lines and say no more than that\n\n## Doing\n\n- [ ] A checklist card #work\n- [x] One already done\n\n## Done\n\n${Array.from({ length: 30 }, (_, at) => `- Card number ${at + 1}`).join('\n')}\n` })
  await v('notes:fields:set', 'nuggets', rich, 'kanban-plugin', 'board')

  await open(shelf.id)
  check('Reading this winter opens as a board', await h.evaluate(() => document.querySelectorAll('[data-board] [data-lane]').length === 3), await lanes())
  await h.mouse.move(700, 700)
  await both(join(shots, 'wide'))
  // Lanes: a faint panel, no drawn border, a dot in the list's colour.
  const lane = await h.evaluate(() => {
    const one = document.querySelector('[data-board] [data-lane]')
    const css = getComputedStyle(one)
    return { border: css.borderTopWidth, radius: css.borderTopLeftRadius, dot: !!one.querySelector('[data-lane-dot]'), card: getComputedStyle(one.querySelector('[data-board-card]')).borderTopLeftRadius, cursor: getComputedStyle(one.querySelector('[data-board-card]')).cursor }
  })
  check('a list is a panel with no drawn border, 14px corners and its colour dot', lane.border === '0px' && lane.radius === '14px' && lane.dot, JSON.stringify(lane))
  check('a card has square-ish 6px corners and the hand', lane.card === '6px' && lane.cursor === 'pointer', JSON.stringify(lane))
  const hands = await h.evaluate(() => [...document.querySelectorAll('[data-board] button')].filter((one) => one.getClientRects().length && getComputedStyle(one).cursor !== 'pointer').map((one) => one.getAttribute('aria-label') || one.textContent.trim()))
  check('every button on the board shows the hand', hands.length === 0, hands.join(', '))

  // The narrow pane: lists scroll inside the board, the page never sideways.
  await size(560, 800)
  await wait(600)
  const narrow = await h.evaluate(() => {
    const doc = document.scrollingElement
    const strip = document.querySelector('[data-board] [data-lane]').parentElement
    const panes = [...document.querySelectorAll('[data-pane]')].filter((one) => one.scrollWidth > one.clientWidth + 1).length
    return { page: doc.scrollWidth - doc.clientWidth, body: document.body.scrollWidth - document.body.clientWidth, panes, strip: strip.scrollWidth > strip.clientWidth, stripWidth: strip.clientWidth }
  })
  check('narrow: the page does not scroll sideways', narrow.page <= 0 && narrow.body <= 0 && narrow.panes === 0, JSON.stringify(narrow))
  check('narrow: the lists scroll sideways inside the board', narrow.strip, JSON.stringify(narrow))
  await both(join(shots, 'narrow'))
  await size(1400, 860)
  await wait(600)

  // The rich board: a picture, tags and a date at the foot, a long title held to three lines.
  await open(rich)
  await h.mouse.move(700, 800)
  await both(join(shots, 'rich'))
  const rich1 = await h.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-board] [data-board-card]')]
    const by = (words) => cards.find((one) => one.textContent.includes(words))
    const long = by('A very long title')?.querySelector('p')
    const lh = long ? parseFloat(getComputedStyle(long).lineHeight) : 0
    return {
      cover: !!by('With a picture')?.querySelector('[data-card-cover]'),
      tags: [...(by('Tagged for later')?.querySelectorAll('[data-tag-chip]') ?? [])].map((one) => one.dataset.tagChip).join(','),
      tagLine: by('Tagged for later')?.querySelector('p')?.textContent.trim(),
      date: by('Due soon')?.querySelector('[data-card-date]')?.textContent.trim(),
      dateLine: by('Due soon')?.querySelector('p')?.textContent.trim(),
      lines: long ? Math.round(long.getBoundingClientRect().height / lh) : 0
    }
  })
  check('a card with a picture shows it at its head', rich1.cover, JSON.stringify(rich1))
  check('end tags sit at the foot as chips, not in the title', rich1.tags === 'reading,slow' && rich1.tagLine === 'Tagged for later', JSON.stringify(rich1))
  check('a date sits at the foot', !!rich1.date && rich1.dateLine === 'Due soon', JSON.stringify(rich1))
  check('a long title stops at three lines', rich1.lines === 3, JSON.stringify(rich1))

  // Keys: arrows pick, ⌫ deletes with an Undo toast, Esc lets go.
  await h.locator('[data-board] [data-lane] h3').first().click()
  await wait(200)
  const count0 = await lanes()
  await h.keyboard.press('ArrowDown')
  await wait(150)
  const picked = await h.evaluate(() => !!document.querySelector('[data-board] [data-board-card][data-board-cursor]'))
  check('↓ picks a card, and the note stays open (before, the list stepper took ↓ to the next note)', picked && await h.evaluate(() => !!document.querySelector('[data-board]')))
  await h.keyboard.press('Backspace')
  await wait(400)
  const toast = await h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).join(' | '))
  check('⌫ deletes the card and offers Undo', toast.includes('Deleted the card') && /Undo/.test(toast) && (await lanes()) !== count0, `${toast} / ${count0} -> ${await lanes()} / ${await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`)
  await h.keyboard.press('Meta+z')
  await wait(500)
  check('⌘Z puts it back', (await lanes()) === count0, `${count0} -> ${await lanes()}`)
  await h.keyboard.press('Escape')
  await wait(200)
  check('Esc lets the card go', await h.evaluate(() => !document.querySelector('[data-board] [data-board-card][data-board-cursor]')))

  // A drag, filmed every 50ms: the card lifts and turns, the gap opens, then it lands in the next list.
  const before = await lanes()
  const from = h.locator('[data-board] [data-board-card]', { hasText: 'A short one' }).first()
  const to = h.locator('[data-board] [data-lane]', { hasText: 'Doing' }).locator('[data-board-card]').last()
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  let frame = 0
  const film = async () => h.screenshot({ path: join(shots, 'drag', `${String(frame++).padStart(3, '0')}.png`) })
  const steps = 18
  let lifted = null
  for (let at = 1; at <= steps; at++) {
    const t0 = Date.now()
    await h.mouse.move(a.x + 40 + ((b.x - a.x) * at) / steps, a.y + a.height / 2 + ((b.y + b.height + 10 - a.y - a.height / 2) * at) / steps)
    await film()
    if (at === 8) lifted = await h.evaluate(() => { const one = document.querySelector('[data-board-lifted]'); return one && { rotate: getComputedStyle(one).rotate, shadow: getComputedStyle(one).boxShadow !== 'none' } })
    await wait(Math.max(0, 50 - (Date.now() - t0)))
  }
  check('the carried card lifts on a shadow and turns a little', !!lifted && lifted.shadow && lifted.rotate !== 'none', JSON.stringify(lifted))
  await h.mouse.up()
  for (let at = 0; at < 8; at++) { const t0 = Date.now(); await film(); await wait(Math.max(0, 50 - (Date.now() - t0))) }
  await wait(400)
  const after = await lanes()
  check('the card landed in Doing', /Ideas:4/.test(after) && /Doing:3/.test(after), `${before} -> ${after}`)

  // "Add a list": named in place, its name picked to type over, Enter keeps it.
  await h.locator('[data-board] [data-add-list]').click()
  await wait(300)
  const naming = await h.evaluate(() => { const one = document.querySelector('[data-new-list] input'); return one && { value: one.value, picked: one.selectionStart === 0 && one.selectionEnd === one.value.length, focused: document.activeElement === one } })
  check('Add a list opens a list named in place, its name picked', !!naming && naming.value === 'New list' && naming.picked && naming.focused, JSON.stringify(naming))
  await h.screenshot({ path: join(shots, 'new-list-light.png') })
  await h.keyboard.type('Later')
  await h.keyboard.press('Enter')
  await wait(500)
  check('Enter makes the list', /Later:0/.test(await lanes()), await lanes())
  // ⌘Z takes it back, as in the note.
  await h.locator('[data-board] [data-lane] h3').first().click()
  await h.keyboard.press('Meta+z')
  await wait(500)
  check('⌘Z takes the new list back', !/Later/.test(await lanes()), await lanes())

  // Siblings, for the eye: the folder and its group panels, light and dark.
  await look('light')
  await send('view', 'articles')
  await wait(1200)
  await h.locator('[data-pane] [data-group-row], [data-pane] [data-row]', { hasText: 'Films and books' }).first().click().catch(() => {})
  await wait(1000)
  await both(join(shots, 'sibling-folder'))
  console.log(`shots: ${shots}`)
  check('no errors on the page', s.errors.filter((one) => !/favicon|ERR_FILE_NOT_FOUND/.test(one)).length === 0, s.errors.join('\n'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await s.close()
  done()
}
