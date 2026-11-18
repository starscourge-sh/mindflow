// A note says how big it is (components/count/note-size.tsx): its bar shows its lines (the margin's own count) and
// words, and pointing at them, a click or ⇧⌘W shows one card with the rest. On a COPY of a book (QA_DATA), never the
// book itself, its largest open note and a short one:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/note-size.mjs
//
// QA_PART=counts (the default): the bar and the card against the note as the editor holds it (the stored note read by the app's own schema; its words against the stored copy's, and where the two part said)
// and the count as it was read before (the whole note's words at once), typing changing them, the pill under the last
// line gone with the picked words' count kept, the key and Esc. QA_PART=frames: frames while typing in the largest
// note (QA_FRAMES_OK=1 makes "none over 17.5 ms" a check; otherwise the numbers are said, to set beside another build's).
// QA_PART=look: the bar and the card, light and dark, at 1190 by 744 and 560 by 400, and the card's arrival every 50 ms,
// as pictures under QA_SHOTS (default: the scratch folder's u1-shots).
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const PART = process.env.QA_PART ?? 'counts'
const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/5b575690-5d8d-4c00-8355-6cbcae36c52e/scratchpad/u1-shots'
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const largest = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
const short = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 1500 and 4000 order by id limit 1").get()
// The same note page elsewhere: Writing's largest page outside a folder and the longest question, each with the Inbox's own checks.
const others = [['Writing', 'article'], ['a question', 'question']]
  .map(([name, tier]) => [name, db.prepare("select id from nuggets where tier = ? and body is not null and binned_at is null and archived_at is null and superseded_by is null order by group_id is null desc, length(body) desc limit 1").get(tier), tier])
  .filter(([, one]) => one)
db.close()
const load = () => `load ${loadavg()[0].toFixed(1)}`
console.log(`largest ${largest.id.slice(0, 8)}, short ${short?.id.slice(0, 8)}  (${load()})`)

const WIDE = { width: 1190, height: 744 }
const c = await sandbox({ ...(PART === 'look' ? WIDE : WIDE), seeded: false })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)

/** Opened (in the Inbox, or where `type` opens), its words drawn. */
const open = async (id, long, type = 'capture') => {
  await send(type, id)
  const drawn = await h.waitForFunction(([id, long]) => !!document.querySelector(`[data-open="${id}"] .tiptap${long ? '[data-long]' : ''}`), [id, long], { timeout: type === 'capture' ? 60000 : 20000 }).then(() => true, () => false)
  // Not drawn: what the page shows instead, said and kept as a picture, so the run goes on to the next note.
  if (!drawn) {
    const there = await h.evaluate(() => ({ url: location.search, open: [...document.querySelectorAll('[data-open]')].map((el) => `${el.getAttribute('data-open')}: ${el.textContent.trim().slice(0, 80)}`).slice(0, 3), view: document.querySelector('[data-view]')?.getAttribute('data-view') ?? null }))
    mkdirSync(SHOTS, { recursive: true })
    await h.screenshot({ path: `${SHOTS}/not-opened-${type}-${id.slice(0, 8)}.png` })
    check(`${type} ${id.slice(0, 8)} opens`, false, JSON.stringify(there))
    return false
  }
  await h.waitForFunction(() => !!document.querySelector('[data-open] [data-note-size]'), null, { timeout: 20000 }).catch(() => {})
  await wait(1500)
  return true
}

/** What the stored note holds, parsed by the app's own schema, counted here by this probe's own walk. */
const stored = (id, type = 'capture') => h.evaluate(async ([id, type]) => {
  const ed = document.querySelector('[data-open] .tiptap').editor
  const found = type === 'capture' ? await window.api.captures.get(id) : await window.api.haligtree('item', id)
  const doc = ed.schema.nodeFromJSON(typeof found.body === 'string' ? JSON.parse(found.body) : found.body)
  const shown = (node) => (node.type.name === 'noteLink' ? String(node.attrs.text || node.attrs.label || ' ') : ' ')
  const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])
  const linesOf = (node) => {
    let n = 0
    if (LISTS.has(node.type.name)) node.forEach((item) => { n += 1; item.forEach((child) => { if (LISTS.has(child.type.name)) n += linesOf(child) }) })
    else if (node.type.name === 'blockquote') { node.forEach((child) => { n += linesOf(child) }); n = Math.max(1, n) } else n = 1
    return n
  }
  const count = (doc) => {
  let lines = 0
  doc.forEach((block) => { lines += linesOf(block) })
  let headings = 0
  let pictures = 0
  let links = 0
  let cards = 0
  doc.descendants((node) => {
    if (node.type.name === 'heading') headings += 1
    if (node.type.name === 'image' || node.type.name === 'excalidraw') pictures += 1
    if (node.type.name === 'noteLink' || node.type.name === 'bookmark') links += 1
    if (node.isTextblock) {
      let href = null
      node.forEach((child) => {
        const at = child.isText ? (child.marks.find((mark) => mark.type.name === 'link')?.attrs.href ?? null) : null
        if (at && at !== href) links += 1
        href = at
      })
      // A card: "question :: answer" outside code (study.ts lineCard's split, its spans shielded).
      if (node.type.name !== 'codeBlock') {
        let text = ''
        node.forEach((child) => { text += child.type.name === 'inlineMath' ? `$${child.attrs.latex ?? ''}$` : child.isText ? (child.marks.some((m) => m.type.name === 'code') ? `\`${child.text}\`` : child.text) : child.textContent })
        const whole = text.trim()
        const blanked = whole.replace(/`[^`\n]+`|\$[^$\n]+\$/g, (span) => '\u0000'.repeat(span.length))
        const match = /^(.*?\S)\s+::\s+(\S.*)$/.exec(blanked)
        if (match) {
          const question = whole.slice(0, match[1].length).replace(/^[-*+]\s+|^\d+[.)]\s+|^\[[ x]\]\s+/i, '').trim()
          const answer = whole.slice(whole.length - match[2].length).trim()
          if (question && answer && !(/\s:\s/.test(question) && /\s:\s/.test(answer))) cards += 1
        }
      }
    }
    return true
  })
  // As the count was read before it was kept block by block: the whole note's words at once.
  const words = doc.textBetween(0, doc.content.size, ' ', (node) => ` ${shown(node)} `).split(/\s+/).filter((word) => word && word !== '/').length
  const characters = doc.textBetween(0, doc.content.size, undefined, shown).length
  return { lines, words, characters, headings, pictures, links, cards }
  }
  const kept = count(doc)
  const now = ed.state.doc
  // Not the same as the editor holds it (it read the stored note into its own shapes as it opened): where the two
  // first part, and the blocks there, said so it can be read.
  const same = doc.eq(now)
  let parted = null
  if (!same) {
    let at = 0
    while (at < Math.min(doc.childCount, now.childCount) && doc.child(at).eq(now.child(at))) at++
    const cut = (node) => (node ? JSON.stringify(node.toJSON()).slice(0, 360) : null)
    parted = { blocks: [doc.childCount, now.childCount], at, stored: cut(doc.maybeChild(at)), shown: cut(now.maybeChild(at)), next: [cut(doc.maybeChild(at + 1))?.slice(0, 160), cut(now.maybeChild(at + 1))?.slice(0, 160)] }
  }
  // The note as the editor holds it, which the margin numbers: what the bar must say. The stored copy's own counts beside.
  return { ...(same ? kept : count(now)), kept, same, parted }
}, [id, type])

/** The bar's size and, if up, its card. */
const bar = () => h.evaluate(() => {
  const button = document.querySelector('[data-open] [data-note-size]')
  const card = document.querySelector('[data-note-size-card]')
  const num = (text) => Number(String(text ?? '').replace(/[^\d]/g, ''))
  const rows = card ? Object.fromEntries([...card.querySelectorAll('[data-size-row]')].map((row) => [row.getAttribute('data-size-row'), num(row.textContent)])) : null
  const label = button?.getAttribute('aria-label') ?? ''
  const [lines, words] = label.split(', ').map(num)
  const box = button?.getBoundingClientRect()
  return {
    shown: !!button && !!box?.width, text: button?.textContent ?? null, lines, words,
    card: card ? { rows, read: card.querySelector('[data-size-read]')?.textContent, place: card.querySelector('[data-size-place]')?.textContent ?? null, keyed: card.hasAttribute('data-keyed') } : null,
    pill: document.querySelectorAll('[data-open] .tiptap-word-count').length,
  }
})
/** A real pointer resting on the size, as a person points. */
const pointAt = async () => {
  const at = await h.evaluate(() => { const r = document.querySelector('[data-open] [data-note-size]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(at.x - 60, at.y + 40)
  await h.mouse.move(at.x, at.y, { steps: 6 })
}
const away = async () => { await h.mouse.move(600, 600, { steps: 4 }); await wait(400) }
const cardUp = () => h.waitForFunction(() => !!document.querySelector('[data-note-size-card]'), null, { timeout: 4000 }).then(() => true, () => false)
const cardGone = () => h.waitForFunction(() => !document.querySelector('[data-note-size-card]'), null, { timeout: 4000 }).then(() => true, () => false)

try {
  if (PART === 'counts') {
    for (const [name, note, type] of [['largest', largest, 'capture'], ['short', short, 'capture'], ...others]) {
      if (!note) continue
      if (!(await open(note.id, name === 'largest', type))) continue
      const want = await stored(note.id, type)
      const now = await bar()
      const { kept, same, parted, ...held } = want
      console.log(`${name}: as the editor holds it ${JSON.stringify(held)}; bar ${JSON.stringify({ text: now.text, lines: now.lines, words: now.words })}`)
      // The editor read the stored note into its own shapes as it opened (a picture kept inside a line becomes a
      // picture of its own): said, with where, and the stored copy's counts, for the report to name.
      if (!same) console.log(`${name}: the stored copy counts ${JSON.stringify(kept)}; it parts from the editor's at ${JSON.stringify(parted)}`)
      // Nothing written in it (every question in the user's book so far): nothing to count says nothing.
      if (!want.words && want.lines < 2) {
        check(`${name}: nothing written, so no size in its bar, and none under its last line`, !now.shown && now.pill === 0, JSON.stringify(now))
        continue
      }
      check(`${name}: the bar says its lines and words, counted this probe's own way from the note it shows (the margin's lines)`, now.shown && now.lines === want.lines && now.words === want.words, JSON.stringify(now))
      check(`${name}: the bar's words are the stored note's words`, now.words === kept.words, `${now.words} against ${kept.words}`)
      check(`${name}: no count under the last line: the bar holds the size`, now.pill === 0, `pills ${now.pill}`)
      await pointAt()
      const up = await cardUp()
      const card = (await bar()).card
      check(`${name}: pointed at, the card comes`, up && !!card, '')
      if (card) {
        const rows = card.rows
        const matches = ['Words', 'Characters', 'Headings', 'Pictures', 'Links', 'Review cards'].every((label) => {
          const key = { Lines: 'lines', Words: 'words', Characters: 'characters', Headings: 'headings', Pictures: 'pictures', Links: 'links', 'Review cards': 'cards' }[label]
          return (rows[label] ?? 0) === want[key]
        })
        check(`${name}: every number on the card is the note's own`, matches, JSON.stringify({ rows, want: held }))
        const minutes = want.words ? Math.max(1, Math.round(want.words / 238)) : 0
        check(`${name}: the card says how long it takes to read`, minutes ? /About .+ to read/.test(card.read ?? '') : /Nothing/.test(card.read ?? ''), card.read)
        check(`${name}: the card says how far in, of every line`, new RegExp(`^Line [\\d,]+ of ${want.lines.toLocaleString('en')} · \\d+% in$`).test(card.place ?? ''), card.place)
        check(`${name}: pointed at, it comes without the opening cue's mark of a key`, !card.keyed, '')
      }
      await away()
      check(`${name}: the pointer gone, the card goes`, await cardGone(), '')
    }

    // Typing in the largest note: the bar moves with the words.
    await open(largest.id, true)
    const before = await bar()
    const spot = await h.evaluate(() => {
      const note = document.querySelector('[data-open] .tiptap[data-long]')
      const r = note.getBoundingClientRect()
      const line = [...note.children].find((el) => el.tagName === 'P' && el.textContent.trim().length > 20 && el.getBoundingClientRect().top > 120 && el.getBoundingClientRect().bottom < innerHeight - 80)
      const b = line.getBoundingClientRect()
      return { x: b.right - 4, y: b.top + 8, left: r.left }
    })
    await h.mouse.click(spot.x, spot.y)
    await h.keyboard.press('End')
    // With Vim's keys on (the user's book has them), the caret sits in normal mode: into insert mode before typing.
    if (await h.evaluate(() => !!document.querySelector('[data-open] .tiptap[data-vim-mode="normal"]'))) await h.keyboard.press('i')
    await h.keyboard.type(' sizeword anotherword', { delay: 40 })
    await wait(300)
    const typed = await bar()
    // What the note holds now, counted this probe's own way: where End leaves the caret (a wrapped line's end sits after its
    // space), the words typed may join the next one, so the count to match is the note's own, not a sum made here.
    const afterTyping = await stored(largest.id)
    check('typing two words in the largest note: the bar moves at once to what the note now holds', typed.words > before.words && typed.words === afterTyping.words && typed.lines === afterTyping.lines, `${before.words} → ${typed.words} words (the note: ${afterTyping.words}), ${typed.lines} lines (the note: ${afterTyping.lines})`)
    await h.keyboard.press('Enter')
    await h.keyboard.type('a new line', { delay: 40 })
    await wait(300)
    const lined = await bar()
    const afterLine = await stored(largest.id)
    check('a new line typed: the bar says one line more, and the words the note now holds', lined.lines === typed.lines + 1 && lined.lines === afterLine.lines && lined.words === afterLine.words, `${typed.lines} → ${lined.lines} lines (the note: ${afterLine.lines}), ${typed.words} → ${lined.words} words (the note: ${afterLine.words})`)

    // The key, with the caret in the note: the card at once, the caret's own line; Esc puts it away and only it.
    await h.keyboard.press('Meta+Shift+KeyW')
    const keyed = await cardUp()
    const card = (await bar()).card
    const caret = await h.evaluate(() => {
      const ed = document.querySelector('[data-open] .tiptap').editor
      const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])
      const linesOf = (node) => {
        let n = 0
        if (LISTS.has(node.type.name)) node.forEach((item) => { n += 1; item.forEach((child) => { if (LISTS.has(child.type.name)) n += linesOf(child) }) })
        else if (node.type.name === 'blockquote') { node.forEach((child) => { n += linesOf(child) }); n = Math.max(1, n) } else n = 1
        return n
      }
      const index = ed.state.selection.$head.index(0)
      let before = 0
      for (let i = 0; i < index; i++) before += linesOf(ed.state.doc.child(i))
      return { line: before + 1, focused: ed.isFocused }
    })
    check('⇧⌘W with the caret in the note: the card comes at once, without its entrance', keyed && !!card?.keyed, JSON.stringify(card))
    check('the card says the caret\'s own line', card?.place?.startsWith(`Line ${caret.line.toLocaleString('en')} of`), `${card?.place} (caret on ${caret.line})`)
    await h.keyboard.press('Escape')
    check('Esc puts the card away', await cardGone(), '')
    check('Esc took the card, not the note: the caret is still in it', await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.isFocused), '')

    // A click on it shows it and keeps it while the pointer is on it.
    await pointAt()
    await h.mouse.down()
    await h.mouse.up()
    check('a click shows the card', await cardUp(), '')
    await wait(700)
    check('it stays after the click (no shut and open again)', !!(await bar()).card, '')
    await away()

    // Words picked: their own count, where it always was.
    await h.mouse.click(spot.x - 40, spot.y)
    // With Vim's keys on (the user's book has them), the caret sits in normal mode: into insert mode before typing.
    if (await h.evaluate(() => !!document.querySelector('[data-open] .tiptap[data-vim-mode="normal"]'))) await h.keyboard.press('i')
    await h.keyboard.down('Shift')
    await h.keyboard.press('Home')
    await h.keyboard.up('Shift')
    await wait(400)
    const picked = await h.evaluate(() => ({ count: document.querySelector('[data-picked-count]')?.textContent ?? null, bar: !!document.querySelector('[data-selection-bar]') }))
    // While the format bar is up it is the one floating thing, and the picked count waits for it (word-count.tsx).
    check('words picked: their own count at the foot of the note, or only the format bar while it is up', /selected$/.test(picked.count ?? '') || (picked.bar && !picked.count), JSON.stringify(picked))
    // Undo the typing, so nothing is left as it was not (the copy is thrown away after).
    for (let i = 0; i < 4; i++) await h.keyboard.press('Meta+z')
  }

  if (PART === 'frames') {
    await open(largest.id, true)
    const spot = await h.evaluate(() => {
      const note = document.querySelector('[data-open] .tiptap[data-long]')
      const line = [...note.children].find((el) => el.tagName === 'P' && el.textContent.trim().length > 20 && el.getBoundingClientRect().top > 120 && el.getBoundingClientRect().bottom < innerHeight - 80)
      const b = line.getBoundingClientRect()
      return { x: b.right - 4, y: b.top + 8 }
    })
    await h.mouse.click(spot.x, spot.y)
    await h.keyboard.press('End')
    // With Vim's keys on (the user's book has them), the caret sits in normal mode: into insert mode before typing.
    if (await h.evaluate(() => !!document.querySelector('[data-open] .tiptap[data-vim-mode="normal"]'))) await h.keyboard.press('i')
    await wait(1500)
    await h.evaluate(() => {
      window.__frames = []
      window.__rec = true
      let last = performance.now()
      const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await h.keyboard.type(' the quick brown fox jumps over the lazy dog again and again', { delay: 70 })
    await wait(300)
    const frames = await h.evaluate(() => { window.__rec = false; return window.__frames.slice(1) })
    const over = frames.filter((ms) => ms > 17.5)
    console.log(`typing in the largest note: ${frames.length} frames, ${over.length} over 17.5 ms, longest ${Math.round(Math.max(0, ...frames) * 10) / 10} ms (${load()})`)
    const size = await bar()
    check('the bar is there while typing in the largest note', size.shown || !process.env.QA_FRAMES_BAR, size.text)
    if (process.env.QA_FRAMES_OK) check('no frame over 17.5 ms while typing in the largest note', over.length === 0, over.map((ms) => Math.round(ms)).join(', '))
    for (let i = 0; i < 3; i++) await h.keyboard.press('Meta+z')
  }

  if (PART === 'look') {
    mkdirSync(SHOTS, { recursive: true })
    await open(largest.id, true)
    const head = async () => h.evaluate(() => { const r = document.querySelector('[data-open] [data-note-head]').getBoundingClientRect(); return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: Math.min(innerWidth - Math.max(0, r.left - 8), r.width + 16), height: 340 } })
    for (const [name, dims] of [['wide', WIDE], ['narrow', { width: 560, height: 400 }]]) {
      await c.size(dims.width, dims.height)
      await wait(800)
      for (const look of ['light', 'dark']) {
        await c.look(look)
        await away()
        await h.screenshot({ path: `${SHOTS}/size-${name}-bar-${look}.png` })
        const now = await bar()
        if (!now.shown) { console.log(`${name} ${look}: the size is folded away (${dims.width} wide)`); continue }
        await pointAt()
        await cardUp()
        await wait(400)
        await h.screenshot({ path: `${SHOTS}/size-${name}-card-${look}.png` })
        // The card inside the window, 8px from every edge (a tip's room).
        const fits = await h.evaluate(() => { const r = document.querySelector('[data-note-size-card]').getBoundingClientRect(); return { left: r.left, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom } })
        check(`${name} ${look}: the card stays 8px clear of the window's edges`, Math.min(fits.left, fits.top, fits.right, fits.bottom) >= 8, JSON.stringify(fits))
        await away()
        await cardGone()
      }
    }
    // Its arrival, a frame every 50 ms from the pointer coming to rest.
    await c.size(WIDE.width, WIDE.height)
    await c.look('light')
    await away()
    const clip = await head()
    await pointAt()
    const t0 = Date.now()
    for (let i = 0; i < 16; i++) {
      await h.screenshot({ path: `${SHOTS}/size-arrive-${String(i).padStart(2, '0')}-${Date.now() - t0}ms.png`, clip })
      const spent = Date.now() - t0 - i * 50
      if (spent < 50) await wait(50 - spent)
    }
    await away()
    // Its siblings: the same bar on a Writing page and on a question, light and dark, its card up.
    for (const [name, note, type] of others) {
      if (!(await open(note.id, false, type))) continue
      for (const look of ['light', 'dark']) {
        await c.look(look)
        await away()
        if (!(await bar()).shown) { console.log(`${name} ${look}: no size in the bar`); continue }
        await pointAt()
        await cardUp()
        await wait(400)
        await h.screenshot({ path: `${SHOTS}/size-${type}-card-${look}.png` })
        await away()
        await cardGone()
      }
    }
  }
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
console.log(load())
done()
