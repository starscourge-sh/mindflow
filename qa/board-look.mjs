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
const s = await sandbox({ width: 1440, height: 860 })
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
  await size(760, 800)
  await wait(600)
  const narrow = await h.evaluate(() => {
    const doc = document.scrollingElement
    const strip = document.querySelector('[data-board] [data-lane]').parentElement
    const panes = [...document.querySelectorAll('[data-pane]')].filter((one) => one.scrollWidth > one.clientWidth + 1).length
    return { page: doc.scrollWidth - doc.clientWidth, body: document.body.scrollWidth - document.body.clientWidth, panes, strip: strip.scrollWidth > strip.clientWidth, stripWidth: strip.clientWidth }
  })
  check('narrow: the page does not scroll sideways', narrow.page <= 0 && narrow.body <= 0 && narrow.panes === 0, JSON.stringify(narrow))
  check('narrow: the lists scroll sideways inside the board', narrow.strip, JSON.stringify(narrow))
  const fade = await h.evaluate(() => { const one = document.querySelector('[data-board-strip]'); return { right: one.hasAttribute('data-fade-right'), left: one.hasAttribute('data-fade-left'), mask: getComputedStyle(one).maskImage } })
  check('narrow: the side with more lists fades out, the start does not', fade.right && !fade.left && fade.mask !== 'none', JSON.stringify(fade))
  await h.evaluate(() => { const one = document.querySelector('[data-board-strip]'); one.scrollLeft = one.scrollWidth })
  await wait(200)
  const fade2 = await h.evaluate(() => { const one = document.querySelector('[data-board-strip]'); return { right: one.hasAttribute('data-fade-right'), left: one.hasAttribute('data-fade-left') } })
  check('narrow: scrolled to the end, the start fades instead', fade2.left && !fade2.right, JSON.stringify(fade2))
  await h.evaluate(() => { document.querySelector('[data-board-strip]').scrollLeft = 0 })
  await wait(200)
  await both(join(shots, 'narrow'))
  await size(560, 800)
  await wait(500)
  await both(join(shots, "phone"))
  await size(1440, 860)
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

  // A drag, filmed every 50ms and read every frame in the page: the card lifts and turns on a shadow, the place it
  // left stays as a slot, a gap opens where it would land, each new landing place taps the trackpad once (firm), and
  // letting go settles it with a spring and one more tap.
  const before = await lanes()
  const kinds = () => s.electron.evaluate(() => globalThis.haligtreeTapKinds())
  const taps0 = (await kinds()).length
  const from = h.locator('[data-board] [data-board-card]', { hasText: 'A short one' }).first()
  const mid = h.locator('[data-board] [data-board-card]', { hasText: 'Due soon' }).first()
  const to = h.locator('[data-board] [data-lane]', { hasText: 'Doing' }).locator('[data-board-card]').last()
  const a = await from.boundingBox()
  const m = await mid.boundingBox()
  const b = await to.boundingBox()
  // Per frame, in the page: the lifted card's place, turn and size, and whether a gap is open in Doing.
  await h.evaluate(() => {
    window.__boardFrames = []
    const read = () => {
      const lifted = document.querySelector('[data-board-lifted]')
      const doing = [...document.querySelectorAll('[data-board] [data-lane]')].find((one) => one.querySelector('h3')?.textContent === 'Doing')
      const gap = doing && [...doing.querySelectorAll('[data-board-card]')].some((one) => one.firstElementChild && getComputedStyle(one.firstElementChild).visibility === 'hidden')
      // Where the carried thing settles: the lifted place that holds the card under the hand (13 Nov: the one card every
      // list carries rides at the point it was taken by, inside that place, as a list's does).
      const box = lifted ? (lifted.closest('.mf-drag-picture') ?? lifted).getBoundingClientRect() : undefined
      // Two cards of one list drawn over each other (each card's top above the last one's foot).
      const overlap = [...document.querySelectorAll('[data-board] [data-lane]')].some((lane) => [...lane.querySelectorAll('[data-board-card]')].map((one) => one.getBoundingClientRect()).some((r, at, all) => at > 0 && r.top < all[at - 1].bottom - 2))
      window.__boardFrames.push({ overlap, t: performance.now(), lifted: !!lifted, x: box?.left ?? null, y: box?.top ?? null, rotate: lifted ? getComputedStyle(lifted).rotate : null, scale: lifted ? getComputedStyle(lifted).scale : null, shadow: lifted ? getComputedStyle(lifted).boxShadow !== 'none' : null, gap: !!gap })
      if (window.__boardFrames.length < 3000) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  let frame = 0
  const film = async () => h.screenshot({ path: join(shots, 'drag', `${String(frame++).padStart(3, '0')}.png`) })
  // Down its own list past three cards, then across into Doing, under its last card.
  const path = [
    ...Array.from({ length: 10 }, (_, at) => [a.x + 40, a.y + a.height / 2 + ((m.y + m.height / 2 - a.y - a.height / 2) * (at + 1)) / 10]),
    ...Array.from({ length: 12 }, (_, at) => [a.x + 40 + ((b.x - a.x) * (at + 1)) / 12, m.y + m.height / 2 + ((b.y + b.height + 10 - m.y - m.height / 2) * (at + 1)) / 12])
  ]
  const tapsAt = []
  let lifted = null
  for (const [at, [x, y]] of path.entries()) {
    const t0 = Date.now()
    await h.mouse.move(x, y)
    await film()
    tapsAt.push((await kinds()).length - taps0)
    if (at === 6) lifted = await h.evaluate(() => { const one = document.querySelector('[data-board-lifted]'); return one && { card: one.hasAttribute('data-carried-card'), words: one.querySelector('[data-drag-label]')?.textContent ?? '', shadow: getComputedStyle(one).boxShadow !== 'none' } })
    await wait(Math.max(0, 50 - (Date.now() - t0)))
  }
  // (13 Nov) A board's card is carried as every row in the app is: the one card under the hand, saying what letting go does.
  check('the carried card lifts as the one card every list carries, on a shadow, saying what letting go does', !!lifted && lifted.card && lifted.shadow && /^Move/.test(lifted.words), JSON.stringify(lifted))
  const gapOpen = await h.evaluate(() => window.__boardFrames.some((one) => one.gap))
  check('a gap opens in Doing where the card would land', gapOpen)
  await wait(200)
  const during = (await kinds()).slice(taps0)
  check('each new landing place taps the trackpad, firm, more than once over a drag through two lists', during.length >= 3 && during.every((one) => one === 'level'), `${during.join(',')} / by step ${tapsAt.join(',')}`)
  check('no buzz: fewer taps than steps of the pointer', during.length < path.length, `${during.length} taps over ${path.length} steps`)
  const upAt = await h.evaluate(() => performance.now())
  await h.mouse.up()
  for (let at = 0; at < 8; at++) { const t0 = Date.now(); await film(); await wait(Math.max(0, 50 - (Date.now() - t0))) }
  await wait(400)
  const landed = (await kinds()).slice(taps0 + during.length)
  check('letting go taps once more as it lands', landed.length === 1 && landed[0] === 'level', landed.join(','))
  const settle = await h.evaluate((up) => window.__boardFrames.filter((one) => one.t >= up && one.lifted), upAt)
  const ys = settle.map((one) => Math.round(one.y))
  const all = await h.evaluate(() => ({ n: window.__boardFrames.length, last: window.__boardFrames.at(-1) }))
  check('it settles into its place over several frames (a spring, not a jump)', settle.length >= 6, `${settle.length} frames: ${ys.join(',')} / ${JSON.stringify(all)}`)
  // It settles where it now stands in Doing, not back where it was picked up.
  const home = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-board] [data-lane]')].find((l) => l.querySelector('h3')?.textContent === 'Doing'); const card = [...one.querySelectorAll('[data-board-card]')].find((c) => c.textContent.includes('A short one')); const box = card?.getBoundingClientRect(); return box && { x: Math.round(box.left), y: Math.round(box.top) } })
  const end = settle.at(-1)
  check('the drop settles on the card in its new place', !!home && !!end && Math.abs(end.x - home.x) < 14 && Math.abs(end.y - home.y) < 14, `ends ${end && Math.round(end.x)},${end && Math.round(end.y)}; card at ${JSON.stringify(home)}`)
  const crossed = await h.evaluate((up) => window.__boardFrames.filter((one) => one.t >= up && one.overlap).length, upAt)
  check('after the drop no card is drawn over another in any frame', crossed === 0, `${crossed} frames`)
  const hidden = await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-board-card]')].filter((one) => one.firstElementChild && getComputedStyle(one.firstElementChild).visibility === 'hidden').length)
  check('no card is left hidden after the drop', hidden === 0, String(hidden))
  const after = await lanes()
  check('the card landed in Doing', /Ideas:4/.test(after) && /Doing:3/.test(after), `${before} -> ${after}`)

  // Keys: ⌥↑ and ⌥→ carry the picked card, with motion and the same firm tap, one each.
  await h.locator('[data-board] [data-board-card]', { hasText: 'Due soon' }).first().click()
  await wait(200)
  const k0 = (await kinds()).length
  await h.keyboard.press('Alt+ArrowUp')
  const glideUp = await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-board-card]')].filter((one) => one.getAnimations().length).length)
  await wait(400)
  const order = await h.evaluate(() => [...[...document.querySelectorAll('[data-board] [data-lane]')][0].querySelectorAll('[data-board-card] p')].map((one) => one.textContent.trim().slice(0, 12)).join(' / '))
  check('⌥↑ moves the card up its list, the cards gliding to their places', /Due soon \/ Tagged/.test(order) && glideUp >= 2, `${order} / ${glideUp} gliding`)
  await h.keyboard.press('Alt+ArrowRight')
  const glideRight = await h.evaluate(() => [...document.querySelectorAll('[data-board] [data-board-card]')].filter((one) => one.getAnimations().length).length)
  await wait(400)
  check('⌥→ carries it to the next list, gliding', /Ideas:3/.test(await lanes()) && /Doing:4/.test(await lanes()) && glideRight >= 1, `${await lanes()} / ${glideRight} gliding`)
  const keyTaps = (await kinds()).slice(k0)
  check('each key move taps the trackpad once, firm', keyTaps.length === 2 && keyTaps.every((one) => one === 'level'), keyTaps.join(','))
  await h.keyboard.press('Escape')
  await wait(200)

  // A card's ⋯: none at rest, one on the card under the pointer, never a second on the picked card.
  await h.mouse.move(1300, 800)
  await wait(300)
  const moreShown = () => h.evaluate(() => [...document.querySelectorAll('[data-board] [data-card-more]')].filter((one) => +getComputedStyle(one).opacity > 0.5).length)
  check('no ⋯ shows on cards at rest', (await moreShown()) === 0, String(await moreShown()))
  const pickedCard = h.locator('[data-board] [data-board-card]', { hasText: 'Card number 1' }).first()
  await pickedCard.click()
  const other = await h.locator('[data-board] [data-board-card]', { hasText: 'Card number 2' }).first().boundingBox()
  await h.mouse.move(other.x + 30, other.y + other.height / 2)
  await wait(300)
  const hover = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-board] [data-board-card]')].find((c) => c.textContent.includes('Card number 2')); const css = getComputedStyle(one); return { bg: css.backgroundColor, ring: css.boxShadow } })
  check('pointing at one card with another picked shows one ⋯, on the pointed card', (await moreShown()) === 1, String(await moreShown()))
  await h.mouse.move(1300, 800)
  await wait(300)
  const rest = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-board] [data-board-card]')].find((c) => c.textContent.includes('Card number 2')); return getComputedStyle(one).backgroundColor })
  check('a pointed card fills a little, as rows do, rather than ringing', hover.bg !== rest, `${rest} -> ${hover.bg}`)
  await h.keyboard.press('Escape')

  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Garden plans' }] }] } }))
  await wait(800)
  // The new card's line is the app's editor line: @ picks a note, and the card shows the link. While it is
  // typed in, no other card keeps a ring.
  await h.locator('[data-board] [data-board-card]', { hasText: 'Card number 3' }).first().click()
  await wait(150)
  await h.keyboard.press('n')
  await wait(500)
  const rings = await h.evaluate(() => document.querySelectorAll('[data-board] [data-board-cursor]').length)
  check('typing a new card, no other card shows a ring', rings === 0, String(rings))
  const fonts = await h.evaluate(() => { const line = document.querySelector('[data-add-card-line] p'); const card = document.querySelector('[data-board] [data-board-card] p'); return { line: line && getComputedStyle(line).fontSize, card: card && getComputedStyle(card).fontSize } })
  check('the new card line writes at the cards\' own size', !!fonts.line && fonts.line === fonts.card, JSON.stringify(fonts))
  await h.keyboard.type('Read with @garden', { delay: 30 })
  await wait(1000)
  const menu = await h.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu-title')].map((one) => one.textContent))
  check('@ in the new card line offers notes', menu.some((one) => /Garden plans/.test(one)), JSON.stringify(menu))
  await h.screenshot({ path: join(shots, 'at-in-card.png') })
  await h.keyboard.press('Enter')
  await wait(300)
  await h.keyboard.press('Enter')
  await wait(600)
  const link = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-board] [data-board-card]')].find((c) => c.textContent.includes('Read with')); return one && { link: !!one.querySelector('[data-note]'), text: one.textContent.trim() } })
  check('the card holds the picked note as a link', !!link && link.link, JSON.stringify(link))
  await h.keyboard.press('Escape')
  await wait(300)

  // A list carried by its heading to the front settles there too, with the same taps.
  {
    const head = await h.locator('[data-board] [data-lane] h3', { hasText: 'Doing' }).boundingBox()
    const first = await h.locator('[data-board] [data-lane]').first().boundingBox()
    const t0 = (await kinds()).length
    await h.evaluate(() => { window.__laneFrames = []; const read = () => { const one = document.querySelector('.mf-drag-picture'); const box = one?.getBoundingClientRect(); window.__laneFrames.push({ t: performance.now(), x: box?.left ?? null }); if (window.__laneFrames.length < 3000) requestAnimationFrame(read) }; requestAnimationFrame(read) })
    await h.mouse.move(head.x + 10, head.y + head.height / 2)
    await h.mouse.down()
    for (let at = 1; at <= 12; at++) { await h.mouse.move(head.x + 10 + ((first.x + 20 - head.x) * at) / 12, head.y + head.height / 2); await wait(40) }
    const upLane = await h.evaluate(() => performance.now())
    await h.mouse.up()
    await wait(700)
    const order = await lanes()
    const laneTaps = (await kinds()).slice(t0)
    const xs = await h.evaluate((up) => window.__laneFrames.filter((one) => one.t >= up && one.x !== null).map((one) => Math.round(one.x)), upLane)
    const firstNow = await h.evaluate(() => Math.round(document.querySelector('[data-board] [data-lane]').getBoundingClientRect().left))
    check('a list carried to the front lands there', /^Doing/.test(order), order)
    check('the list settles on its new place, not its old one', xs.length > 2 && Math.abs(xs.at(-1) - firstNow) < 14, `${xs.join(',')} -> ${firstNow}`)
    check('carrying a list taps at each new place and on landing, firm', laneTaps.length >= 2 && laneTaps.every((one) => one === 'level'), laneTaps.join(','))
    await h.keyboard.press('Meta+z')
    await wait(400)
  }

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
