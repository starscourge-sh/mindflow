// Review, walked as an Anki user walks it, on a copy of a real book: in from the sidebar, Decks, All cards, Stats,
// "Study now", the card turned by Space, a grade by key, ⌘Z, a long answer with the grades still in sight, and the
// words the pages say checked against what is so. Then, on a fresh book (QA_WALK=lines, QA_DATA an empty folder),
// a card written as a line in a note: its "Open it at the line" and, missed, "Reread where it came from", each a real
// way there with its key said, by press and by R.
//   QA_DATA=<a copy of a book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-walk.mjs [shots]
//   QA_WALK=lines QA_DATA=$(mktemp -d) QA_ENTRY=... HALIGTREE_QA_AWAY=1 node qa/review-walk.mjs [shots]
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const LINES = process.env.QA_WALK === 'lines'
// QA_WALK=swap: a note opened from Review (R), then Review asked for again from outside the page (home:open, as other
// windows and the Dock ask), at once and after a beat: Review alone on the page each time, the note's page never drawn with it.
const SWAP = process.env.QA_WALK === 'swap'
if (LINES || SWAP) process.env.QA_ARGS = ''
const { check, done } = checks()
const SHOTS = process.argv[2]
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1300, height: 860, seeded: !LINES && !SWAP })
const { h, go, v, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && !process.env.QA_HIDE && both(join(SHOTS, name))
const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await wait(150) } return false }
/** FRAMES=1 with a shots folder: a frame every 50ms through a change, `n` of them, kept for the eye. */
const frames = async (name, n = 12, clip) => {
  if (!SHOTS || !process.env.FRAMES || process.env.QA_HIDE) return
  for (let at = 0; at < n; at++) {
    const started = Date.now()
    await h.screenshot({ path: join(SHOTS, `${name}-${String(at).padStart(2, '0')}.png`), ...(clip ? { clip } : {}) })
    await wait(Math.max(0, 50 - (Date.now() - started)))
  }
}
const asked = () => h.evaluate(() => document.querySelector('[data-review-sheet] h2')?.textContent.trim() ?? '')
const shown = () => h.evaluate(() => !!document.querySelector('[data-grades]'))
const topSaid = () => h.evaluate(() => document.querySelector('[data-review-top]')?.textContent.replace(/\s+/g, ' ').trim() ?? '')

/** Everything on the page a click does something to, without the hand (a wrapper that only stops a press is left out). */
const noHand = (scope) => h.evaluate((scope) => {
  const root = document.querySelector(scope)?.closest('section') ?? document.querySelector(scope)
  const out = []
  for (const el of root?.querySelectorAll('*') ?? []) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'))
    const props = key && el[key]
    if (!props?.onClick || /stopPropagation\(\)\s*$/.test(String(props.onClick).replace(/[\s};)]+$/, ')'))) continue
    // A tip's trigger closes its tip on a press (nothing of its own), and a row of chips passes a press in a gap to the chip lit beside it (glide.tsx): neither is a control.
    if (el.matches('[data-slot$="trigger"]:not(button, [role="button"]), [data-hover-quiet]')) continue
    const box = el.getBoundingClientRect()
    if (box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight) continue
    const cursor = getComputedStyle(el).cursor
    if (cursor !== 'pointer' && cursor !== 'text') out.push(`${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')} "${(el.textContent ?? '').trim().slice(0, 30)}" ${cursor}`)
  }
  return out
}, scope)

/** Every dot a deck's counts show that ends its line, or starts one, with nothing on its other side. */
const danglingDots = () => h.evaluate(() => {
  const out = []
  for (const line of document.querySelectorAll('[data-deck-counts]')) {
    const clip = ([...line.querySelectorAll('*')].find((one) => getComputedStyle(one).overflow === 'hidden') ?? line).getBoundingClientRect()
    const glyphs = []
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    for (let node; (node = walker.nextNode());) {
      for (let i = 0; i < node.data.length; i++) {
        if (/\s/.test(node.data[i])) continue
        const range = document.createRange()
        range.setStart(node, i); range.setEnd(node, i + 1)
        const box = range.getBoundingClientRect()
        if (box.width && box.right > clip.left + 0.5 && box.left < clip.right - 0.5) glyphs.push({ ch: node.data[i], left: box.left, right: box.right, top: Math.round(box.top) })
      }
    }
    const deck = line.closest('[data-deck]')?.getAttribute('data-deck')
    for (const g of glyphs.filter((one) => one.ch === '·')) {
      const row = glyphs.filter((one) => one !== g && Math.abs(one.top - g.top) < 4)
      if (!row.some((one) => one.left >= g.right - 0.5)) out.push(`${deck}: "·" ends a line`)
      if (!row.some((one) => one.right <= g.left + 0.5)) out.push(`${deck}: "·" starts a line`)
    }
  }
  return out
})

try {
  // No celebration over the walk: a fresh book's first note brings "Your first capture", whose card takes the first Esc
  // for itself on purpose (celebrate.tsx), and on a screen that draws no frame it never leaves of its own accord.
  await v('settings:set', { sounds: false, hintRate: 0, celebrate: false })
  if (SWAP) {
    await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
    await h.reload(); await wait(2000)
    const note = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rivers of the world' }] }] } }))
    await h.evaluate((id) => window.api.captures.save(id, { body: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Rivers of the world' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Which river runs through Cairo? :: The Nile' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Which river runs through Vienna? :: The Danube' }] }
    ] } }), note)
    await waitFor(async () => (await v('items', 'card')).filter((one) => one.lineOf === `capture:${note}`).length === 2)
    // What the page holds: each of the page's two places, shown or not, and the page in it, with the note's words seen or not.
    const places = () => h.evaluate(() => {
      const note = [...document.querySelectorAll('.ProseMirror')].filter((one) => /Which river runs through Cairo\? :: The Nile/.test(one.textContent) && one.checkVisibility({ visibilityProperty: true }) && one.getBoundingClientRect().width > 0).length
      const review = !!document.querySelector('[data-review-sheet] h2')?.checkVisibility({ visibilityProperty: true })
      const held = [...document.querySelectorAll('[data-page-held], [data-page-held] ~ div, div:has(> [data-page])')].length
      const each = [...document.querySelectorAll('[data-page]')].filter((one) => one.closest('main, body')).map((one) => { const place = one.parentElement?.parentElement; return `${one.getAttribute('data-page')}:${place ? getComputedStyle(place).display : '?'}:${getComputedStyle(one).visibility}` })
      return { review, noteShown: note, each, held }
    })
    for (const [n, beat] of [[1, 0], [2, 120], [3, 900]]) {
      await go('review', ':today')
      await waitFor(async () => /Which river/.test(await asked()))
      await wait(500)
      await h.evaluate(() => document.activeElement?.blur())
      await h.keyboard.press('r')
      await waitFor(() => h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].some((one) => /Which river runs through Cairo/.test(one.textContent))), 5000)
      if (beat) await wait(beat)
      // Asked for from outside the page, as another window or the Dock asks: the window's own home:open.
      await c.send('view', 'review', ':today')
      await frames(`frames-swap-${n}`, 12)
      const settled = await waitFor(async () => { const now = await places(); return now.review && !now.noteShown }, 4000)
      if (n === 1) await shot('swap-1')
      check(`R opens the note, then Review asked for from outside ${beat ? `${beat}ms later` : 'at once'}: Review alone on the page, the note's page never drawn with it`, settled, JSON.stringify(await places()))
    }
  } else if (!LINES) {
    await go('home')
    const side = h.locator('aside').locator('button, [role="button"], a, [data-row]', { hasText: /^Review/ }).first()
    if (await side.count()) await side.click()
    else await go('review')
    check('the sidebar\'s "Review" opens Review on its decks', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-review-page="decks"]'))))
    await wait(1500)
    await shot('review-decks')
    let miss = await noHand('[data-review-page]')
    check('Decks: the hand over everything a click does something to', miss.length === 0, miss.join(' | '))
    const dots = await danglingDots()
    check(`Decks: no deck's counts leave a dot hanging at the end of a line (${await h.evaluate(() => document.querySelectorAll('[data-deck-counts]').length)} decks)`, dots.length === 0, dots.join(' | '))
    // Decks opens on the decks, as Anki's does: the first row of decks whole on the first screen.
    const firstRow = await h.evaluate(() => { const one = document.querySelector('[data-deck-grid] [data-deck], [data-deck-list] [data-deck]')?.getBoundingClientRect(); return one ? { top: Math.round(one.top), bottom: Math.round(one.bottom), height: innerHeight } : null })
    check(`Decks: the first row of decks is whole on the first screen (${firstRow ? `${firstRow.top} to ${firstRow.bottom} in a window ${firstRow.height} tall` : 'no deck'})`, !!firstRow && firstRow.bottom <= firstRow.height, JSON.stringify(firstRow))
    const page = await h.evaluate(() => document.querySelector('[data-review-page]')?.textContent ?? '')
    check('Decks: no line reads the mind ("just before you would forget")', !/just before you|just as you would forget|before you would forget/.test(page), (page.match(/[^.]*(?:just before you|would forget)[^.]*\./) ?? [''])[0])
    await h.locator('[data-review-tabs] button', { hasText: 'All cards' }).click(); await wait(1200)
    await shot('review-cards')
    miss = await noHand('[data-review-page]')
    check('All cards: the hand over everything a click does something to', miss.length === 0, miss.join(' | '))
    await h.locator('[data-review-tabs] button', { hasText: 'Stats' }).click(); await wait(1200)
    await shot('review-stats')

    // ── Study now ──
    await h.locator('[data-study-now]').click()
    check('"Study now": a card', await waitFor(async () => !!(await asked())))
    await wait(900)
    await shot('review-front')
    const top = await topSaid()
    console.log(`  over the card: "${top}"`)
    const fresh = (await v('review:buckets').catch(() => null))?.new
    const learn = await h.evaluate(() => document.querySelector('[data-learn-new]')?.textContent.trim() ?? '')
    if (learn) check(`"Learn …" never says there are eight when more are waiting (${fresh ?? '?'} not studied yet): "${learn}"`, /^Learn (the next 8 cards|\d not studied yet)$/.test(learn) && !(fresh > 8 && /^Learn 8 /.test(learn)), learn)
    // The line over the card stays one line at this width: "Learn …" and "Practise" side by side, the card where it was.
    const line = await h.evaluate(() => { const one = document.querySelector('[data-learn-new]')?.getBoundingClientRect(); const two = document.querySelector('[data-review-top] [data-practise]')?.getBoundingClientRect(); return one && two ? { learn: Math.round(one.top), practise: Math.round(two.top) } : null })
    if (learn) check('the line over the card stays one line: "Learn …" and "Practise" side by side', !!line && Math.abs(line.learn - line.practise) <= 2, JSON.stringify(line))
    const first = await asked()
    miss = await noHand('[data-review-sheet]')
    check('the card: the hand over everything a click does something to', miss.length === 0, miss.join(' | '))
    await h.evaluate(() => document.activeElement?.blur())
    await h.keyboard.press('Space')
    await frames('frames-turn', 10)
    check('Space turns it: the grades', await waitFor(shown))
    await wait(700)
    await shot('review-back')
    // The page scrolled down through the long answer and back: the grades held at the foot, the words passing under them.
    if (process.env.FRAMES && SHOTS) {
      for (const [n, by] of [[0, 160], [1, 160], [2, 400], [3, -720]]) {
        await h.mouse.move(700, 500)
        await h.mouse.wheel(0, by)
        await frames(`frames-scroll-${n}`, 4)
      }
    }
    // A long answer (this book's first card runs to several paragraphs): the grades are in sight without a scroll.
    const grades = await h.evaluate(() => { const box = document.querySelector('[data-grades]')?.getBoundingClientRect(); const page = document.querySelector('[data-review-sheet]')?.getBoundingClientRect(); return box && { top: Math.round(box.top), bottom: Math.round(box.bottom), height: innerHeight, long: Math.round(page?.height ?? 0) } })
    check(`the grades are in sight under a long answer, as Anki's answer bar is (grades ${grades?.top} to ${grades?.bottom}, window ${grades?.height}, the card's sheet ${grades?.long}px tall)`, grades && grades.bottom <= grades.height && grades.top >= 0, JSON.stringify(grades))
    miss = await noHand('[data-review-sheet]')
    check('the answer side: the hand over everything a click does something to', miss.length === 0, miss.join(' | '))
    console.log(`  grades: ${JSON.stringify(await h.$$eval('[data-grades] button', (all) => all.map((one) => one.textContent.replace(/\s+/g, ' ').trim())))}`)
    // Pressed with the pointer, from where it sits at the foot.
    const press = h.locator('[data-grades] button').last()
    await press.click()
    check('a grade pressed where it sits: the next card', await waitFor(async () => (await asked()) !== first))
    await wait(400)
    await h.keyboard.press('Meta+z')
    check('⌘Z: the card graded is back, on its question', await waitFor(async () => (await asked()) === first && !(await shown())))
    await wait(400)
    await h.evaluate(() => document.activeElement?.blur())
    await h.keyboard.press('Space')
    await waitFor(shown)
    await h.keyboard.press('3')
    check('3: the next card', await waitFor(async () => (await asked()) !== first))
    // Space and ↵ on the answer side grade Good, as Anki has them; ⌘Z takes each back.
    for (const key of ['Space', 'Enter']) {
      await wait(300)
      await h.evaluate(() => document.activeElement?.blur())
      const q = await asked()
      await h.keyboard.press('Space')
      await waitFor(shown)
      await wait(200)
      await h.keyboard.press(key)
      const moved = await waitFor(async () => (await asked()) !== q, 4000)
      const undo = await h.evaluate(() => document.querySelector('[data-undo-grade]')?.textContent.trim() ?? '')
      check(`${key === 'Space' ? 'Space' : '↵'} on the answer grades Good, as in Anki: the next card comes, its Undo naming Good ("${undo}")`, moved && /Got it|Good/.test(undo), undo || 'no grade')
      if (moved) { await h.keyboard.press('Meta+z'); await waitFor(async () => (await asked()) === q) }
    }
    // E rewrites the question in place; Esc leaves it as it was, as Esc does in every field.
    await wait(400)
    const before = await asked()
    await h.evaluate(() => document.activeElement?.blur())
    // Where the keys go as E is pressed: each focus and loss of it, and whether the key was taken (for the line below).
    await h.evaluate(() => {
      window.__keys = []
      document.addEventListener('focusin', (event) => window.__keys.push(`in ${event.target.tagName}`), true)
      document.addEventListener('focusout', (event) => window.__keys.push(`out ${event.target.tagName}${event.relatedTarget ? ` to ${event.relatedTarget.tagName}` : ''}`), true)
      addEventListener('keydown', (event) => window.__keys.push(`key ${event.key} taken ${event.defaultPrevented}`), { once: true })
    })
    // One trace of where the keys are as E is pressed: which window the Mac has in front, whether this page has the
    // keys, and the key as the window's first listener (capture) hears it.
    const trace = { windows: await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((one) => `${one.webContents.getURL().split('?')[1]?.slice(0, 24) ?? one.webContents.getURL().slice(-24)}${one.isFocused() ? ' (focused)' : ''}${one.isVisible() ? '' : ' (hidden)'}`)), page: await h.evaluate(() => ({ hasFocus: document.hasFocus(), active: document.activeElement?.tagName })) }
    await h.evaluate(() => addEventListener('keydown', (event) => window.__keys.push(`capture ${event.key}`), { capture: true, once: true }))
    await h.keyboard.press('e')
    const editing = await waitFor(() => h.evaluate(() => document.activeElement?.tagName === 'H2' && getSelection()?.toString().length > 0), 4000)
    console.log(`  E trace: ${JSON.stringify({ ...trace, heard: await h.evaluate(() => window.__keys) })}`)
    check('E: the question takes the keys, its words picked', editing, await h.evaluate(() => JSON.stringify({ active: `${document.activeElement?.tagName}${document.activeElement?.getAttribute('data-typed-lines') !== null ? '[typed-lines]' : ''}`, picked: getSelection()?.toString().slice(0, 40), h2: document.querySelector('[data-review-sheet] h2')?.getAttribute('contenteditable'), seen: window.__keys })))
    // Into the question by a press as well ("click it to edit", the card's own words say), all of it picked: the same field.
    if (!editing) {
      await h.evaluate(() => document.activeElement?.blur())
      await h.locator('[data-review-sheet] h2').click()
      await h.keyboard.press('Meta+a')
    }
    check('the question has the keys before anything is typed (else the letters would be Review\'s keys)', await h.evaluate(() => document.activeElement?.tagName === 'H2'))
    await h.keyboard.type('Something else entirely')
    await wait(200)
    await h.keyboard.press('Escape')
    await wait(500)
    const after = await h.evaluate(() => ({ text: document.querySelector('[data-review-sheet] h2')?.textContent.trim() ?? '', focused: document.activeElement?.tagName ?? '' }))
    check('Esc: the question reads as it was, nothing typed kept, the keys back with Review', after.text === before && after.focused !== 'H2', JSON.stringify({ before, ...after }))
    const kept = await h.evaluate((before) => window.api.haligtree('cards:all').then((all) => all.some((one) => one.prompt === 'Something else entirely') ? 'saved' : all.some((one) => one.prompt === before) ? 'as it was' : 'not found'), before)
    check('Esc: the card itself still asks what it asked', kept === 'as it was', kept)
    await shot('review-graded')
  } else {
    // ── A card written as a line in a note, on a fresh book ──
    await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
    await h.reload(); await wait(2000)
    const note = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rivers of the world' }] }] } }))
    await h.evaluate((id) => window.api.captures.save(id, { body: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Rivers of the world' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Which river runs through Cairo? :: The Nile' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Which river runs through Vienna? :: The Danube' }] }
    ] } }), note)
    check('the note\'s two lines are cards', await waitFor(async () => (await v('items', 'card')).filter((one) => one.lineOf === `capture:${note}`).length === 2))
    await go('review', ':today')
    check('Review asks a card written in the note', await waitFor(async () => /Which river/.test(await asked())))
    // QA_HIDE=1: the main window hidden for the rest of the walk, as a locked screen leaves it (no frame drawn).
    if (process.env.QA_HIDE) await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.hide())
    await wait(600)
    const way = await h.evaluate(() => { const one = document.querySelector('[data-line-from] [data-line-open]'); const key = one?.querySelector('kbd'); return one && { tag: one.tagName, cursor: getComputedStyle(one).cursor, key: key?.textContent.trim() ?? '', words: one.textContent.trim() } })
    check('"Open it at the line" is a way there, its key said (R), with the hand', way?.tag === 'BUTTON' && way.cursor === 'pointer' && way.key === 'R', JSON.stringify(way))
    await shot('review-line-card')
    if (way) {
      await h.locator('[data-line-open]').click({ force: !!process.env.QA_HIDE })
      check('pressed, it opens the note the line is in', await waitFor(() => h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].some((one) => /Which river runs through Cairo/.test(one.textContent)))))
      await wait(800)
      // Back to the review, as a person comes back: Back (⌘[), then the review alone on the page, nothing of the note's page drawn with it.
      const alone = () => h.evaluate(() => {
        const note = [...document.querySelectorAll('.ProseMirror')].filter((one) => /Which river runs through Cairo\? :: The Nile/.test(one.textContent) && one.checkVisibility({ visibilityProperty: true }) && one.getBoundingClientRect().width > 0)
        const places = [...document.querySelectorAll('[data-page-held]')].map((one) => `${getComputedStyle(one).display}/${one.children.length}`)
        return { review: !!document.querySelector('[data-review-sheet] h2')?.checkVisibility({ visibilityProperty: true }), noteShown: note.length, places }
      })
      await h.keyboard.press('Meta+[')
      const back = await waitFor(async () => { const now = await alone(); return now.review && !now.noteShown }, 6000)
      await shot('review-back-from-note')
      check('Back from the note: the review alone on the page, the note\'s page gone (never drawn over it)', back, JSON.stringify(await alone()))
      if (!back) await go('review', ':today')
      await waitFor(async () => /Which river/.test(await asked()))
    }
    // Missed: "Reread where it came from", a way to the note there and then, by press or by R.
    await h.evaluate(() => document.activeElement?.blur())
    await h.keyboard.press('Space')
    await waitFor(shown)
    await h.keyboard.press('1')
    await frames('frames-missed', 14, { x: 260, y: 140, width: 1040, height: 260 })
    const reread = await waitFor(() => h.evaluate(() => /Missed that one/.test(document.querySelector('[data-review-page], main, body')?.textContent ?? '')))
    const line = await h.evaluate(() => { const one = document.querySelector('[data-missed-reread]'); const p = [...document.querySelectorAll('p')].find((each) => /Missed that one/.test(each.textContent)); return { said: p?.textContent.replace(/\s+/g, ' ').trim() ?? '', tag: one?.tagName ?? '', key: one?.querySelector('kbd')?.textContent.trim() ?? '', cursor: one ? getComputedStyle(one).cursor : '' } })
    check('missed, the line offers the note again, never a sentence ending on a colon', reread && !/:\s*$/.test(line.said), JSON.stringify(line))
    check('"Reread where it came from" is a way there, with the hand', line.tag === 'BUTTON' && line.cursor === 'pointer', JSON.stringify(line))
    // R opens the line of a card written in a note first: over such a card, R is promised on that line only, never on two.
    const rs = await h.evaluate(() => [...document.querySelectorAll('[data-missed-reread] kbd, [data-line-open] kbd')].filter((one) => one.textContent.trim() === 'R').length)
    check(`one R promised at a time (${rs} lines say R)`, rs <= 1, String(rs))
    await shot('review-missed')
    if (line.tag === 'BUTTON') {
      await h.locator('[data-missed-reread]').click({ force: !!process.env.QA_HIDE })
      check('pressed, the note it came from opens beside the review', await waitFor(() => h.evaluate(() => /Which river runs through/.test(document.querySelector('[data-review-source], [data-source-panel]')?.textContent ?? document.body.textContent) && !document.querySelector('[data-grades]') && !!document.querySelector('[data-missed-reread]') === false)))
      await shot('review-missed-source')
      // Where the Esc goes: the element with the keys, and every listener that stops or claims it, with its place in
      // the page and the code it runs (read back out of the built file, below).
      await h.evaluate(() => {
        window.__esc = []
        const name = (node) => node === window ? 'window' : node === document ? 'document' : node instanceof Element ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${[...node.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 3).map((a) => `[${a.name}]`).join('')} in ${node.closest('[data-page]')?.getAttribute('data-page') ?? 'no page'}` : String(node)
        window.__escName = name
        for (const what of ['stopPropagation', 'stopImmediatePropagation', 'preventDefault']) {
          const was = Event.prototype[what]
          Event.prototype[what] = function (...args) {
            if (this.type === 'keydown' && this.key === 'Escape') window.__esc.push({ what, at: name(this.currentTarget), phase: this.eventPhase, stack: (new Error().stack ?? '').split('\n').slice(2, 5).map((one) => one.trim()) })
            return was.apply(this, args)
          }
        }
        addEventListener('keydown', (event) => event.key === 'Escape' && window.__esc.push({ what: 'reached window (bubble)', taken: event.defaultPrevented }), { once: true })
        window.__escActive = `${name(document.activeElement)}; page ${document.visibilityState}; source up: ${!!document.querySelector('button') && [...document.querySelectorAll('button')].some((one) => /Back to the review/.test(one.textContent))}`
      })
      await h.keyboard.press('Escape')
      const esc = await h.evaluate(() => ({ active: window.__escActive, path: window.__esc }))
      // Each stack frame read back out of the built code: the 220 letters around where it ran.
      const { readFileSync } = await import('node:fs')
      const around = (frame) => { const at = /(file:\/\/[^\s)]+?):(\d+):(\d+)/.exec(frame); if (!at) return ''; try { const line = readFileSync(new URL(at[1]), 'utf8').split('\n')[Number(at[2]) - 1] ?? ''; const col = Number(at[3]); return line.slice(Math.max(0, col - 120), col + 100) } catch { return '' } }
      console.log(`  Esc trace: active ${esc.active}`)
      for (const one of esc.path) console.log(`  Esc trace: ${one.what} at ${one.at ?? ''} phase ${one.phase ?? ''}${one.taken !== undefined ? ` taken ${one.taken}` : ''}${one.stack ? `\n      ${one.stack.join('\n      ')}\n      code: ${around(one.stack[0])}` : ''}`)
      check('Esc: back on the card', await waitFor(async () => /Which river/.test(await asked())))
    }
  }
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end (${error.message.split('\n')[0]})`, false)
} finally {
  await c.close()
  done()
}
