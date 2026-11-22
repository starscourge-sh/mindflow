// The book switcher at the sidebar's foot is a shelf (books.tsx BookShelf): each book the Settings book, a woven cloth
// spine in its own colour with its name up it whole in foil, its cover printed paper with its card crisp, turned a little so a sliver of its
// cover shows, every book one height on one foot line, the open one turned to its cover, the one pointed at (or reached by the keys) pulled out and
// turned instead and named under the shelf, the shelf one width throughout; a press on another book opens it. Real
// pointer and keys; on a copy of a data folder with several books (the user's, QA_DATA).
// QA_SHOTS films the menu opening and the pointer crossing the shelf, every 50ms, and keeps a picture of the menu with
// the pointer on each of the first books, in the light look and the dark, and the Settings book in each for comparison.
//   QA_DATA=<a copy of book-master> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 node qa/book-shelf.mjs
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
// At scale: the shelf of the copy filled to 30 books, a few with long names, written before the app reads it.
const shelfFile = join(process.env.QA_DATA, 'books.json')
// The sandbox is one book with no shelf file: this runs on a copy of book-master (the gate's "book-shelf+book").
if (/--sandbox/.test(process.env.QA_ARGS ?? '') || !existsSync(shelfFile)) {
  console.log(`FAIL  run on a copy of book-master, not the sandbox: no ${shelfFile}`)
  process.exit(1)
}
const kept = JSON.parse(readFileSync(shelfFile, 'utf8'))
const HUES = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'gray', null]
const NAMES = ['Thesis', 'Reading year', 'The Long Commonplace Book of Everything I Ever Meant to Remember', 'Greek', 'Recipes', 'Garden', 'Work 2026', 'Anki imports', 'Notes from the Unisa years']
for (let n = kept.books.length + 1; n < 30; n++) kept.books.push({ id: `b-qa${String(n).padStart(8, '0')}`, name: `${NAMES[n % NAMES.length]}${n > 9 ? ` ${n}` : ''}`, createdAt: '2026-11-01T09:00:00.000Z', ...(HUES[n % 9] && { color: HUES[n % 9] }) })
writeFileSync(shelfFile, JSON.stringify(kept, null, 2))
// A closed book full of notes beside the open one, as the user's Garden of Loose Ends stood while Caelid was open (21 Nov:
// its cover showed only its name): a clone of the copy's real book file (older schema, hundreds of notes) as one of the
// books made here, so its card is read from a file the app does not have open.
const real = kept.books.find((one) => existsSync(join(process.env.QA_DATA, 'books', one.id, 'haligtree.db')))
const closed = real && kept.books.find((one) => one.id.startsWith('b-qa'))
if (closed) {
  mkdirSync(join(process.env.QA_DATA, 'books', closed.id), { recursive: true })
  copyFileSync(join(process.env.QA_DATA, 'books', real.id, 'haligtree.db'), join(process.env.QA_DATA, 'books', closed.id, 'haligtree.db'), constants.COPYFILE_FICLONE)
}
const s = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, electron, close, errors } = s
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
const film = async (name, n) => { if (!shots) return; for (let i = 0; i < n; i++) { await h.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const spines = () => h.evaluate(() => [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => ({ id: one.getAttribute('data-book'), open: one.getAttribute('aria-current') === 'true', w: Math.round(one.getBoundingClientRect().width), x: Math.round(one.getBoundingClientRect().x), lit: one.hasAttribute('data-highlighted'), face: new DOMMatrix(getComputedStyle(one.querySelector('.mf-book')).transform).m11, cursor: getComputedStyle(one).cursor })))
// face: how square the book's cover stands to you (the cosine of its turn): 1 facing you, 0 its spine to you.
const floating = () => h.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="tooltip"], [data-menu-peek]')].filter((one) => { const r = one.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(one).visibility !== 'hidden' }).length)
try {
  // QA_THEME=light|dark: filmed in that look.
  if (process.env.QA_THEME) await s.look(process.env.QA_THEME)
  const books = await s.v('books:list')
  check('the shelf holds 30 books', books.books.length === 30, books.books.map((one) => one.name).join(', '))
  // An effect that hands React a promise (this Chromium's scrollIntoView answers with one) stopped the whole window as the
  // menu opened in dev mode and as it closed in a build: "destroy is not a function". Opened, closed and opened again.
  await h.locator('[aria-label="Haligtree menu"]').click(); await wait(400); await h.keyboard.press('Escape'); await wait(400)
  check('the book menu opens and closes with no page error', errors.length === 0 && (await h.locator('[aria-label="Haligtree menu"]').count()) === 1, errors.join(' | '))
  await h.locator('[aria-label="Haligtree menu"]').click(); await film('open', 6); await wait(400)
  const at = await spines()
  check('the menu opens with every book on the shelf', at.length === books.books.length && at.length === 30, JSON.stringify(at))
  const open = at.find((one) => one.open)
  check('the open book stands turned to its face', open?.w >= 80 && Number(open.face) > 0.9, JSON.stringify(open))
  // Its cover is its reader card (reader-card.tsx ShelfCover), as Settings draws it, the picture at its size.
  const card = await h.evaluate(() => { const one = document.querySelector('[data-book-shelf] [aria-current] [data-shelf-card]'); return one && { name: one.querySelector('[data-reader-name]')?.textContent, title: one.querySelector('[data-reader-title]')?.textContent, since: one.querySelector('[data-reader-since]')?.textContent, shape: Math.round(one.querySelector('[data-reader-shape] > svg:not(.size-0)')?.getBoundingClientRect().width ?? 0) } })
  check('the open book wears its own reader card: its name, title, day begun and picture', card?.name === books.books.find((one) => one.current)?.name && !!card.title && /Kept since|Not begun/.test(card.since) && card.shape >= 45, JSON.stringify(card))
  // Every spine one height; the turned book on the same line, as the user's references stand theirs (21 Nov: "still
  // don't get why active book is lifted"): its foot on the ledge with theirs, its head no higher. And every book at rest
  // turned a little, a sliver of its cover showing at its spine's right ("rather than look dead straight into the side").
  const tall = await h.evaluate(() => [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => { const face = (one.getAttribute('aria-current') ? one.querySelector('[data-shelf-card]')?.parentElement : one.querySelector('[data-reader-spine-face]'))?.getBoundingClientRect(); const spine = one.querySelector('[data-reader-spine-face]').getBoundingClientRect(); const cover = one.querySelector('.mf-card-cover').getBoundingClientRect(); return { open: !!one.getAttribute('aria-current'), w: Math.round(face?.width ?? 0), h: Math.round(face?.height ?? 0), top: face?.top ?? 0, bottom: face?.bottom ?? 0, sliver: Math.round(cover.width * 10) / 10, side: Math.round(cover.left - spine.right), card: !!one.querySelector('.mf-card-cover [data-shelf-card]') } }))
  const spinesTall = tall.filter((one) => !one.open)
  const turnedTall = tall.find((one) => one.open)
  check('every spine stands one height, within 1px, about six times as tall as it is wide', Math.max(...spinesTall.map((one) => one.h)) - Math.min(...spinesTall.map((one) => one.h)) <= 1 && spinesTall.every((one) => one.h >= one.w * 5 && one.h <= one.w * 7), JSON.stringify(spinesTall.slice(0, 6)))
  const spineTop = Math.min(...spinesTall.map((one) => one.top))
  check('the turned book stands on the ledge with the spines, not lifted: one foot line within 1px, its head at most 2px above theirs', spinesTall.every((one) => Math.abs(one.bottom - turnedTall.bottom) <= 1) && turnedTall.top >= spineTop - 2, JSON.stringify({ turned: turnedTall, spine: spinesTall[0] }))
  const slivered = (one) => one.sliver >= 2 && one.sliver <= 10 && Math.abs(one.side) <= 2 && one.card
  check('every book at rest shows a sliver of its cover (2 to 10px) at its spine\'s right, its card on it', spinesTall.every(slivered), JSON.stringify(spinesTall.filter((one) => !slivered(one)).concat(spinesTall.slice(0, 3))))
  // Each spine's name (22 Nov: "gets cut off with an ellipsis which breaks the illusion of a real book. maybe we should
  // use the shiny gold for rim text?"): whole, between its rules, in the Settings spine's serif, in foil (a gradient
  // clipped to the letters), and every stop of that foil against its own colour, read as the screen shows them (a 1px
  // canvas turns any colour to sRGB), through the veil a book not pulled out stands behind: 3:1 or more, as large
  // decorative type, bright gold on a deep spine and bronze on a pale one.
  const inks = await h.evaluate(() => {
    const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgb = (colour) => { paint.clearRect(0, 0, 1, 1); paint.fillStyle = colour; paint.fillRect(0, 0, 1, 1); return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    return [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => {
      const name = one.getAttribute('aria-label')
      const title = one.querySelector('[data-spine-title]')
      const face = one.querySelector('[data-reader-spine-face]')
      const look = getComputedStyle(title)
      const shade = face.querySelector('[data-reader-veil]')
      const veil = shade ? Number(getComputedStyle(shade).opacity) : 0
      const sample = document.createElement('span')
      face.append(sample)
      const foil = ['lo', 'mid', 'hi'].map((stop) => { sample.style.color = `var(--mf-foil-${stop})`; return rgb(getComputedStyle(sample).color) })
      sample.remove()
      const dim = (c) => c.map((v) => v * (1 - veil))
      const ground = dim(rgb(getComputedStyle(face).backgroundColor))
      const ratio = Math.min(...foil.map((stop) => { const [a, b] = [lum(dim(stop)), lum(ground)]; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }))
      const [head, foot] = [...face.querySelectorAll('.mf-shelf-spine-rule')].map((rule) => rule.getBoundingClientRect())
      const box = title.getBoundingClientRect()
      const edge = face.getBoundingClientRect()
      return {
        name: title.textContent, whole: !!name?.startsWith(`${title.textContent}, `), veil, ground: ground.map(Math.round).join(','), ratio: Math.round(ratio * 100) / 100,
        cut: title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1 || /ellipsis/.test(look.textOverflow),
        inside: box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5 && box.top >= head.bottom - 0.5 && box.bottom <= foot.top + 0.5,
        foil: /gradient/.test(look.backgroundImage) && /text/.test(look.backgroundClip || look.webkitBackgroundClip) && /rgba\(0, 0, 0, 0\)|transparent/.test(look.webkitTextFillColor),
        font: look.fontFamily.split(',')[0], size: look.fontSize, box: [Math.round(box.width), Math.round(box.height)]
      }
    })
  })
  check('every spine\'s name is set whole, never an ellipsis: its letters all inside its box, and that box inside the spine between its rules', inks.every((one) => one.whole && !one.cut && one.inside), JSON.stringify(inks.filter((one) => !(one.whole && !one.cut && one.inside)).concat(inks.slice(0, 2))))
  check('every spine\'s name is in foil, in the Settings spine\'s serif', inks.every((one) => one.foil && /Fraunces/.test(one.font)), JSON.stringify(inks.filter((one) => !(one.foil && /Fraunces/.test(one.font))).slice(0, 3)))
  check('every stop of every spine\'s foil reads at 3:1 or more on its cloth, dimmed as it stands', inks.every((one) => one.ratio >= 3), JSON.stringify(inks.filter((one) => one.ratio < 3).concat(inks.slice(0, 3))))
  // The longest name on the shelf (64 letters) set small on two lines or more, never cut.
  const longest = inks.reduce((best, one) => (one.name.length > best.name.length ? one : best), inks[0])
  check('the longest name is whole too, set smaller across the spine', longest.name.length > 40 && !longest.cut && longest.inside, JSON.stringify(longest))
  // The cloth (22 Nov: "too much grain", read as dirt): a woven tile, no noise, its threads 2 css px or more at the shelf's size.
  const weaves = await h.evaluate(() => [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => {
    const face = one.querySelector('[data-reader-spine-face]')
    const look = getComputedStyle(face)
    const tile = decodeURIComponent(look.backgroundImage.split('url(').at(-1) ?? '')
    const shrink = face.getBoundingClientRect().height / face.offsetHeight
    // Two threads each way in a tile, as shelf.css draws it.
    const thread = (parseFloat(look.backgroundSize.split(',').at(-1)) / 2) * shrink
    return { thread: Math.round(thread * 100) / 100, noise: /feTurbulence/.test(tile) || !!face.querySelector('[data-spine-grain]'), woven: /<path/.test(tile) }
  }))
  check('every spine is woven cloth, no noise, its threads 2 css px or more as the shelf shows it', weaves.every((one) => one.woven && !one.noise && one.thread >= 2), JSON.stringify(weaves.slice(0, 3)))
  check('no two neighbouring spines the same colour', inks.every((one, at) => !at || one.ground !== inks[at - 1].ground), JSON.stringify(inks.map((one) => one.ground)))
  // The caption under the shelf: its whole box inside the menu, and neither line cut at its foot (21 Nov: clipped).
  const captionRoom = await h.evaluate(() => { const one = document.querySelector('[data-book-caption]'); const menu = one.closest('[role="menu"]').getBoundingClientRect(); const box = one.getBoundingClientRect(); return { inside: box.top >= menu.top && box.bottom <= menu.bottom && box.left >= menu.left && box.right <= menu.right, lines: [...one.children].map((line) => line.scrollHeight - line.clientHeight), box: [Math.round(box.top), Math.round(box.bottom)], menu: [Math.round(menu.top), Math.round(menu.bottom)] } })
  check('the caption sits wholly inside the menu, neither of its lines cut', captionRoom.inside && captionRoom.lines.every((over) => over <= 0), JSON.stringify(captionRoom))
  check('the others stand as spines', at.filter((one) => !one.open).every((one) => one.w <= 36), JSON.stringify(at.map((one) => one.w)))
  check('every spine shows the hand', at.every((one) => one.cursor === 'pointer'))
  const width = (list) => list.reduce((sum, one) => sum + one.w, 0)
  const room = await h.evaluate(() => { const one = document.querySelector('[data-book-shelf]'); const menu = one.closest('[role="menu"]'); return { shelf: one.clientWidth, holds: one.scrollWidth, menu: menu.getBoundingClientRect().width, fade: getComputedStyle(one).maskImage, win: window.innerWidth, right: menu.getBoundingClientRect().right } })
  check('30 books: the menu keeps its width, the shelf scrolls sideways inside it', at.length === 30 && room.holds > room.shelf && room.menu < 300, JSON.stringify(room))
  check('the side with more fades out', /gradient/.test(room.fade), room.fade)
  const before = await h.evaluate(() => document.querySelector('[data-book-shelf]').scrollLeft)
  const mid = await h.locator('[data-book-shelf]').boundingBox()
  await h.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2); await h.mouse.wheel(0, 300); await wait(400)
  check('the wheel scrolls the shelf sideways', (await h.evaluate(() => document.querySelector('[data-book-shelf]').scrollLeft)) > before)
  await h.evaluate(() => (document.querySelector('[data-book-shelf]').scrollLeft = 0)); await h.mouse.move(5, 5); await wait(300)
  // Across the shelf, slowly, from the first spine to the last.
  const other = at.find((one) => !one.open)
  const box = await h.locator(`[data-book-shelf] [data-book="${other.id}"]`).boundingBox()
  await h.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 4 })
  await film('hover', 6); await wait(300)
  const lit = await spines()
  const pulled = lit.find((one) => one.id === other.id)
  check('the book pointed at is pulled out and turned', pulled?.w >= 80 && Number(pulled.face) > 0.9, JSON.stringify(pulled))
  check('and the open one goes back to a spine', lit.find((one) => one.open)?.w <= 36, JSON.stringify(lit.find((one) => one.open)))
  // The one pulled out at full brightness, every other a little dimmer, and their slivers of cover dimmer still.
  const veils = await h.evaluate(() => [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => ({ id: one.getAttribute('data-book'), spine: Number(getComputedStyle(one.querySelector('[data-reader-veil="spine"]')).opacity), cover: Number(getComputedStyle(one.querySelector('[data-reader-veil="front"]')).opacity) })))
  const up = veils.find((one) => one.id === other.id)
  const held = veils.filter((one) => one.id !== other.id)
  check('the book pulled out stands undimmed, the others dimmed to 80 to 90%, their slivers of cover deeper still', up?.spine < 0.01 && up.cover < 0.01 && held.every((one) => one.spine >= 0.1 && one.spine <= 0.2 && one.cover > one.spine + 0.15), JSON.stringify({ up, held: held.slice(0, 3) }))
  check('the shelf keeps one width', Math.abs(width(lit) - width(at)) <= 2, `${width(at)} then ${width(lit)}`)
  const still = await h.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-book]')?.getAttribute('data-book'), [box.x + 8, box.y + box.height / 2])
  check('the pointer is still on the book it pointed at', still === other.id, still)
  check('one floating thing: the menu, no card or tip beside it', (await floating()) === 1, String(await floating()))
  // The book pulled out is the Settings book, wearing its own reader card (21 Nov: "the book in the settings needs to be
  // your reference"): its name, title and drawn shape on the cream paper.
  const cardOf = (id) => h.evaluate((id) => { const book = document.querySelector(`[data-book-shelf] [data-book="${id}"]`); const one = book?.querySelector('[data-shelf-card]'); return one && { name: one.querySelector('[data-reader-name]')?.textContent, title: one.querySelector('[data-reader-title]')?.textContent, since: one.querySelector('[data-reader-since]')?.textContent, stamps: one.querySelectorAll('[data-reader-stamp]').length, shape: Math.round(one.querySelector('[data-reader-shape] > svg:not(.size-0)')?.getBoundingClientRect().width ?? 0) } }, id)
  const name = books.books.find((one) => one.id === other.id)?.name
  const otherCard = await cardOf(other.id)
  check('the book pulled out wears its own reader card: its name, title and drawn shape', otherCard?.name === name && !!otherCard.title && otherCard.shape >= 45, JSON.stringify(otherCard))
  // Printed paper, crisp (22 Nov: grain over the card, "I can barely even read the text now"): the card's title is what
  // lies under its middle, and nothing drawn over the card is a texture or blends into it.
  const crisp = await h.evaluate((id) => {
    const book = document.querySelector(`[data-book-shelf] [data-book="${id}"]`)
    const card = book.querySelector('[data-shelf-card]')
    const title = card.querySelector('[data-reader-title]').getBoundingClientRect()
    const hit = document.elementFromPoint(title.left + title.width / 2, title.top + title.height / 2)
    const over = [...book.querySelectorAll('.mf-card-cover *')].filter((one) => !card.contains(one) && card.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING).filter((one) => {
      const look = getComputedStyle(one)
      return /url\(/.test(look.backgroundImage) || (look.mixBlendMode !== 'normal' && Number(look.opacity) > 0.01 && !one.hasAttribute('data-reader-shine'))
    })
    return { hit: hit?.closest('[data-reader-title]') ? 'title' : hit?.tagName ?? 'none', grain: book.querySelectorAll('[data-reader-grain]').length, over: over.map((one) => String(one.className)) }
  }, other.id)
  check('its card is crisp: its title under the pointer is the card\'s own words, no grain or texture laid over it', crisp.hit === 'title' && crisp.grain === 0 && crisp.over.length === 0, JSON.stringify(crisp))
  // No spine words over the turned cover (21 Nov: the spine's name, squeezed thin, ghosted down the cover's left edge):
  // the cover's left strip is the cover, and the spine's name is gone once it is turned.
  const ghost = await h.evaluate((id) => {
    const book = document.querySelector(`[data-book-shelf] [data-book="${id}"]`)
    const cover = book.querySelector('.mf-card-cover').getBoundingClientRect()
    // The name as shown: its own opacity times every one above it up to the spine (the turn fades the words' wrapper,
    // the foil and its impression together, book-box.tsx `words`).
    const title = book.querySelector('[data-spine-title]')
    let opacity = 1
    for (let one = title; one && !one.hasAttribute('data-reader-spine-face'); one = one.parentElement) opacity *= Number(getComputedStyle(one).opacity)
    const strip = [2, 5, 9].map((dx) => document.elementFromPoint(cover.left + dx, cover.top + cover.height / 2))
    return { strip: strip.map((one) => (one?.closest('[data-spine-title], [data-reader-spine-face]') ? 'spine' : one?.closest('.mf-card-cover') ? 'cover' : one?.tagName ?? 'none')), opacity }
  }, other.id)
  check('no spine words over the turned cover: its left strip is the cover, the spine\'s name faded to nothing', ghost.strip.every((one) => one === 'cover') && Number(ghost.opacity) === 0, JSON.stringify(ghost))
  const caption = await h.locator('[data-book-caption]').textContent()
  check('and the shelf names it underneath, with when you were in it', caption?.startsWith(name) && /Open now|In it last|Opened|Not opened yet/.test(caption), caption)
  // The keys: the next book turns at once (no swing), the shelf the same width.
  const focusedBefore = await h.evaluate(() => { const one = document.activeElement; return one?.closest('[data-book]')?.getAttribute('data-book') ?? `${one?.tagName ?? 'none'}${one?.getAttribute('role') ? `[role=${one.getAttribute('role')}]` : ''}` })
  check('the book pointed at holds the focus once it has turned out', focusedBefore === other.id, focusedBefore)
  await h.keyboard.press('ArrowDown'); await wait(60)
  const keyed = await spines()
  const next = keyed.find((one) => one.lit)
  // The book after the one pointed at, in the order the shelf draws them (the open book first, then the one you were in
  // last), not the menu's first item: a pointer at rest gave the menu the focus as the books moved under it, and ↓ then
  // started from the top (21 Nov).
  const after = at[at.findIndex((one) => one.id === other.id) + 1]?.id
  check('a key moves to the next book, turned at once', next && next.id === after && next.w >= 80 && Number(next.face) > 0.9 && keyed.filter((one) => Number(one.face) > 0.5).length === 1, JSON.stringify({ next, after, focusedBefore }))
  check('and the shelf keeps one width under the keys', Math.abs(width(keyed) - width(at)) <= 2, `${width(at)} then ${width(keyed)}`)
  await film('keyed', 2)
  // And back up to the book pointed at, which turns out again under the pointer.
  await h.keyboard.press('ArrowUp'); await wait(60)
  const backed = await spines()
  const focused = await h.evaluate(() => { const one = document.activeElement; return one?.closest('[data-book]')?.getAttribute('data-book') ?? `${one?.tagName ?? 'none'}${one?.getAttribute('role') ? `[role=${one.getAttribute('role')}]` : ''}` })
  check('the key back turns the book before it out again', backed.find((one) => one.id === other.id)?.w >= 80,
    JSON.stringify({ wanted: other.id, from: next?.id, width: backed.find((one) => one.id === other.id)?.w, lit: backed.findIndex((one) => one.lit), litId: backed.find((one) => one.lit)?.id, focused, wide: backed.filter((one) => one.w > 36).map((one) => `${one.id}:${one.w}`) }))
  if (shots) {
    await h.keyboard.press('Escape'); await wait(300)
    for (const name of ['light', 'dark']) {
      await s.look(name)
      await h.locator('[aria-label="Haligtree menu"]').click(); await wait(500)
      const ids = (await spines()).slice(0, 7).map((one) => one.id)
      for (const [at, id] of ids.entries()) {
        const spot = await h.locator(`[data-book-shelf] [data-book="${id}"]`).boundingBox()
        await h.mouse.move(spot.x + Math.min(8, spot.width / 2), spot.y + spot.height / 2, { steps: 3 }); await wait(700)
        await h.locator('[role="menu"]').first().screenshot({ path: `${shots}/shelf-${name}-${at}.png` })
      }
      await h.mouse.move(5, 5); await h.keyboard.press('Escape'); await wait(300)
    }
    // The Settings book beside them, the reference the shelf's books are matched to, in each look.
    for (const name of ['light', 'dark']) {
      await s.look(name); await s.go('settings'); await h.click('[data-section="Your book"]'); await wait(900)
      const cover = await h.locator('[data-reader-card]').boundingBox()
      if (cover) await h.screenshot({ path: `${shots}/settings-book-${name}.png`, clip: { x: Math.max(0, cover.x - 70), y: Math.max(0, cover.y - 30), width: cover.width + 140, height: cover.height + 80 } })
    }
    await s.go('home')
    await s.look('light')
    await h.locator('[aria-label="Haligtree menu"]').click(); await wait(500)
    await h.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 3 }); await wait(500)
  }
  // Every closed book that has notes wears its own card read from its file: its notes counted (the day begun and its
  // stamps), not a blank card under its name. Asked of main for each, and seen on the shelf for the clone made above.
  const full = []
  for (const one of books.books.filter((book) => !book.current)) {
    const read = await s.v('books:card', one.id)
    if (read?.facts?.notes) full.push({ id: one.id, notes: read.facts.notes, since: read.facts.since, seed: read.seed })
  }
  check('every closed book with notes has its card read from its file, the day it began with it', !closed || (full.some((one) => one.id === closed.id) && full.every((one) => !!one.since)), JSON.stringify(full))
  if (closed) {
    await h.evaluate((id) => document.querySelector(`[data-book-shelf] [data-book="${id}"]`).scrollIntoView({ inline: 'center', block: 'nearest' }), closed.id); await wait(300)
    const spot = await h.locator(`[data-book-shelf] [data-book="${closed.id}"]`).boundingBox()
    await h.mouse.move(spot.x + Math.min(8, spot.width / 2), spot.y + spot.height / 2, { steps: 3 }); await wait(700)
    const shown = await cardOf(closed.id)
    const asked = full.find((one) => one.id === closed.id)
    check('pulled out, the closed book full of notes shows its card with the day it began and its stamps', shown?.name === closed.name && /Kept since/.test(shown.since ?? '') && shown.stamps >= (asked?.notes >= 100 ? 1 : 0) && shown.shape >= 45, JSON.stringify({ shown, asked }))
    // Off the shelf first, so the open book stands turned again and every spine is back where `box` was measured: moved
    // straight back, the books before the clone stood closer (the open one a spine), and `box` lay on the clone itself.
    await h.mouse.move(5, 5); await wait(500)
    await h.evaluate(() => (document.querySelector('[data-book-shelf]').scrollLeft = 0)); await wait(300)
    await h.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 4 }); await wait(500)
    const back = await h.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-book]')?.getAttribute('data-book'), [box.x + 8, box.y + box.height / 2])
    check('back on the first book pointed at before the press', back === other.id, back)
  }
  // A press opens it: the restart is caught, not made.
  await electron.evaluate(({ app }) => {
    globalThis.__relaunched = null
    const children = process.mainModule.require('child_process')
    children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
    app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
    app.quit = () => void (globalThis.__quit = true)
    app.exit = () => void (globalThis.__quit = true)
  })
  await h.mouse.click(box.x + 8, box.y + box.height / 2)
  let args = null
  for (let i = 0; i < 60 && !args; i++) (await wait(100), (args = await electron.evaluate(() => globalThis.__relaunched)))
  check('a press on it opens that book', (args ?? []).includes(`--book=${other.id}`), JSON.stringify(args))
} finally {
  await close()
}
done()
