// Spelling on the three places qa/spell-right-click.mjs does not drive: a card's form in Review (Cards), a card
// being written on a board, and a day's page. In each, with a real pointer and real keys:
//   - the pill comes for a misspelt word the caret is put on, and a press on it puts the word right while the
//     writing stays open (the pill is drawn at the foot of the page: on a board and in a card's form the press
//     counted as a press away, and ended the writing before the word was put right);
//   - the first right-click on a misspelt word has its spelling rows, whole in the menu's first frame;
//   - "Learn spelling" says so with Undo, the word is no longer flagged, and ⌘Z takes the learning back;
//   - a Spanish word in a Spanish sentence is not flagged, the same word in an English sentence is;
//   - a right-click on a word spelt right never brings a spelling menu: a day's page opens its block menu, a
//     card's form and a board card being written in open nothing (the right-click there is the words' own).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=/some/folder node qa/spell-surfaces.mjs
//
// ONLY=form, ONLY=board or ONLY=day runs one place. A test run learns for the run only (main's spell-check.ts).
import { loadavg } from 'os'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const only = process.env.ONLY ?? ''
const part = (name) => !only || only === name
const load = () => `load ${loadavg()[0].toFixed(1)}`
const c = await sandbox({ width: 1280, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const LINES = ['Start here and rest a while.', 'I will recieve it by tomorow.', 'El gato duerme en la casa porque tiene mucho frío.', 'The cat duerme on the mat every single day.']

/** The middle of the `nth` place `word` is written under `sel`, brought into view first. */
const spot = (sel, word, nth = 0) => h.evaluate(([sel, word, nth]) => {
  let seen = 0
  for (const root of document.querySelectorAll(sel)) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walk.nextNode())) {
      for (let at = node.textContent.indexOf(word); at >= 0; at = node.textContent.indexOf(word, at + 1)) {
        if (seen++ !== nth) continue
        node.parentElement.scrollIntoView({ block: 'center' })
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + word.length)
        const box = range.getBoundingClientRect()
        return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
      }
    }
  }
  return null
}, [sel, word, nth])
const pillNow = () => h.evaluate(() => { const one = document.querySelector('[data-spell-hint]'); const box = one?.getBoundingClientRect(); return one ? { word: one.dataset.spellWord, text: one.textContent, x: Math.round(box.left + 12), y: Math.round(box.top + box.height / 2) } : null })
/** A pill on show hangs over the line below its word: the caret is taken off that word first, and the pill seen to go. */
const clearPill = async () => {
  if (!(await h.$('[data-spell-hint]'))) return
  await h.keyboard.press('ArrowUp')
  await h.waitForSelector('[data-spell-hint]', { state: 'detached', timeout: 3000 }).catch(() => {})
}
/** The caret put on a word with the pointer; the pill's words once it is there for that word (waited for up to `ms`). */
const pillOn = async (sel, word, nth = 0, ms = 3000) => {
  await clearPill()
  const at = await spot(sel, word, nth)
  if (!at) return 'no such word'
  await h.mouse.click(at.x, at.y)
  return h.waitForSelector(`[data-spell-hint][data-spell-word="${word}"]`, { timeout: ms }).then((one) => one.textContent(), () => null)
}
/** Frames through a change: one about every 50 ms for `ms`, named by when each was taken. */
const film = async (name, ms = 450) => {
  if (!shots) return h.waitForTimeout(ms)
  const from = Date.now()
  for (let n = 0; Date.now() - from < ms; n++) await h.screenshot({ path: `${shots}/${name}-${String(n).padStart(2, '0')}-${Date.now() - from}ms.png` }).catch(() => {})
}
/** A right-click on a word: what the menu listed the moment it was first on the page, what it lists a while later, and how long it took. */
const rightClick = async (sel, word, nth = 0, name = '') => {
  await clearPill()
  const at = await spot(sel, word, nth)
  if (!at) return { first: null, later: null, ms: null, missed: true }
  await h.evaluate(() => {
    const read = () => [...document.querySelectorAll('[role="menu"] .tiptap-slash-menu-group, [role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim())
    const seen = (window.__menu = { first: null, ms: null, asked: 0, read })
    addEventListener('contextmenu', () => (seen.asked = performance.now()), { capture: true, once: true })
    const watch = (seen.watch = new MutationObserver(() => {
      if (seen.first || !document.querySelector('[role="menu"]')) return
      seen.first = read()
      seen.ms = Math.round(performance.now() - seen.asked)
      watch.disconnect()
    }))
    watch.observe(document.body, { childList: true, subtree: true })
  })
  await h.mouse.click(at.x, at.y, { button: 'right' })
  if (name) await film(name, 600)
  else await wait(600)
  return h.evaluate(() => (window.__menu.watch.disconnect(), { first: window.__menu.first, later: document.querySelector('[role="menu"]') ? window.__menu.read() : null, ms: window.__menu.ms }))
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const shut = async () => { if (await h.$('[role="menu"]')) { await h.keyboard.press('Escape'); await wait(250) } }
const textOf = (sel) => h.evaluate((sel) => [...document.querySelectorAll(sel)].map((one) => one.innerText).join('\n'), sel)

/**
 * The same journey in one place. `on(line)` brings the writing that holds that line (0 to 3 of LINES) up for
 * writing and gives its selector; `open()` says whether the writing is still open; `right` says what a right-click
 * on a word spelt right should bring.
 */
async function drive(where, { on, open, right }) {
  /** The place's name as a file's: "a card's form" is a-card-s-form. */
  const file = where.replace(/[^a-z]+/gi, '-')
  // The pill, and the first right-click's rows, in light and in dark.
  for (const look of ['light', 'dark']) {
    await c.look(look)
    const sel = await on(1)
    const pill = await pillOn(sel, 'recieve')
    // Pictured once it has come in whole (it fades in over 180 ms).
    if (shots) { await wait(260); await h.screenshot({ path: `${shots}/${file}-pill-${look}.png` }) }
    check(`${where}, ${look}: the caret put on “recieve” brings the pill with “receive”`, /receive/.test(pill ?? ''), JSON.stringify(pill))
    const menu = await rightClick(sel, 'tomorow', 0, look === 'light' ? `${file}-menu-frames` : '')
    if (shots) await h.screenshot({ path: `${shots}/${file}-menu-${look}.png` })
    check(`${where}, ${look}: ${look === 'light' ? 'the first' : 'a'} right-click on “tomorow” has its spelling rows, whole in the menu's first frame, ending with “Learn spelling”`, menu.first?.[0] === 'Spelling' && menu.first?.[1] === 'tomorrow' && menu.first.includes('Learn spelling') && same(menu.first, menu.later), `first seen ${menu.ms} ms after the right-click [${load()}]; first ${JSON.stringify(menu.first?.slice(0, 6))}; later ${JSON.stringify(menu.later?.slice(0, 6))}`)
    await shut()
    check(`${where}, ${look}: Esc closes the menu and the writing stays open`, await open(), '')
  }
  await c.look('light')

  // "Learn spelling", its notice, and ⌘Z at once: no key pressed in between, so the notice's Undo is what ⌘Z takes.
  let sel = await on(1)
  await rightClick(sel, 'tomorow')
  await h.locator('[role="menu"] [data-learn-spelling]').first().click({ timeout: 3000 }).catch(() => {})
  await wait(350)
  const said = await h.evaluate(() => /Learnt “tomorow”/.test(document.body.innerText))
  if (shots) await h.screenshot({ path: `${shots}/${file}-learnt.png` })
  check(`${where}: “Learn spelling” says so, with the way back (“Learnt “tomorow”…”, Undo), and the writing stays open`, said && (await h.locator('button', { hasText: /Undo/ }).count()) > 0 && (await open()), `said: ${said}; open: ${await open()}`)
  await h.keyboard.press('Meta+z')
  await wait(500)
  sel = await on(1)
  const undone = await rightClick(sel, 'tomorow')
  check(`${where}: ⌘Z takes the learning back: “tomorow” is flagged again, its rows at the head of the menu`, undone.first?.[0] === 'Spelling' && undone.first?.[1] === 'tomorrow', JSON.stringify(undone.first?.slice(0, 4)))
  check(`${where}: and the words are as they were (⌘Z took back the learning, not the writing)`, (await textOf(sel)).includes('I will recieve it by tomorow'), JSON.stringify((await textOf(sel)).slice(0, 80)))
  // Learnt again, from the menu still open: no pill, no rows; then the notice's own Undo.
  await h.locator('[role="menu"] [data-learn-spelling]').first().click({ timeout: 3000 }).catch(() => {})
  await wait(350)
  sel = await on(1)
  check(`${where}: learnt, “tomorow” has no pill with the caret on it`, (await pillOn(sel, 'tomorow', 0, 1000)) === null)
  const learnt = await rightClick(sel, 'tomorow')
  check(`${where}: and no spelling rows on its right-click`, !learnt.missed && !(learnt.later ?? []).includes('Spelling'), JSON.stringify(learnt.later?.slice(0, 4)))
  await shut()
  await h.locator('button', { hasText: /Undo/ }).first().click({ timeout: 3000 }).catch(() => {})
  await wait(400)
  sel = await on(1)
  const unlearnt = await rightClick(sel, 'tomorow')
  check(`${where}: Undo on the notice: “tomorow” is flagged again`, unlearnt.first?.[0] === 'Spelling' && unlearnt.first?.[1] === 'tomorrow', JSON.stringify(unlearnt.first?.slice(0, 4)))
  await shut()

  // Another language.
  sel = await on(2)
  check(`${where}: a Spanish word in a Spanish sentence gets no pill (“duerme” in “El gato duerme en la casa…”)`, (await pillOn(sel, 'duerme', 0, 1500)) === null)
  const spanish = await rightClick(sel, 'duerme')
  check(`${where}: and no spelling rows on its right-click`, !spanish.missed && !(spanish.later ?? []).includes('Spelling'), JSON.stringify(spanish.later?.slice(0, 4)))
  await shut()
  sel = await on(3)
  const english = await rightClick(sel, 'duerme', sel.includes('data-board-card') ? 0 : 1)
  check(`${where}: the same word in an English sentence is misspelt (“The cat duerme on the mat…”): “Spelling” heads its menu`, english.first?.[0] === 'Spelling' && same(english.first, english.later), JSON.stringify(english.first?.slice(0, 4)))
  await shut()

  // A word spelt right: no spelling menu, and the right-click goes on to what the place has for it.
  sel = await on(0)
  const plain = await rightClick(sel, 'rest')
  if (shots) await h.screenshot({ path: `${shots}/${file}-plain-right-click.png` })
  check(`${where}: a right-click on a word spelt right has no spelling rows: ${right.says}`, !plain.missed && !(plain.later ?? []).includes('Spelling') && right.ok(plain.later), `the menu: ${JSON.stringify(plain.later?.slice(0, 5))}`)
  await shut()

  // The pill pressed with the pointer: the word is put right, and the writing is still open.
  sel = await on(1)
  await pillOn(sel, 'recieve')
  const pill = await pillNow()
  if (pill?.word === 'recieve') await h.mouse.click(pill.x, pill.y)
  await wait(400)
  const after = await textOf(await on(1, false))
  check(`${where}: a press on the pill puts the word right (“recieve” to “receive”), and the writing is still open`, pill?.word === 'recieve' && (await open()) && after.includes('I will receive it'), `the pill: ${JSON.stringify(pill?.text)}; still open: ${await open()}; ${JSON.stringify(after.slice(0, 60))}`)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // A card's form in Review: Cards, a card opened for writing, its answer.
  if (part('form')) {
    await v('cards:list', [{ term: 'A card to spell in', meaning: 'Its answer' }])
    const card = (await v('cards:all')).find((one) => one.prompt === 'A card to spell in')
    await c.go('review')
    await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
    await h.waitForSelector(`[data-card-row="${card?.id}"]`, { timeout: 15000 })
    const FORM = '[data-card-edit-answer] .tiptap'
    const openForm = async () => {
      if (await h.$(FORM)) return
      await h.evaluate((id) => document.querySelector(`[data-card-row="${id}"] [role="button"]`).click(), card.id)
      await h.waitForSelector(FORM, { timeout: 10000 })
    }
    await openForm()
    await h.evaluate(([sel, lines]) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }).run(), [FORM, LINES])
    await h.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, FORM, { timeout: 10000 }).catch(() => {})
    await wait(1200)
    await drive('a card\'s form', {
      on: async (_line, bring = true) => { if (bring) await openForm(); return FORM },
      open: () => h.evaluate((sel) => !!document.querySelector(sel), FORM),
      right: { says: 'nothing else is behind the answer, so no menu at all', ok: (rows) => !rows?.length }
    })
    await h.keyboard.press('Escape')
    await wait(400)
  }

  // A board: each card one line, written in place.
  if (part('board')) {
    const id = await v('article:new')
    await v('item:save', id, { title: 'A board to spell on', body: `## Todo\n\n${LINES.map((line) => `- [ ] ${line}`).join('\n')}\n\n## Done\n\n- [x] installed\n` })
    await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
    await c.send('view', 'articles')
    await wait(1000)
    await c.send('article', id)
    await h.waitForSelector('[data-open] [data-board] [data-board-card]', { timeout: 20000 })
    await wait(800)
    const CARD = '[data-board-card] .tiptap[contenteditable="true"]'
    const cardWith = (line) => h.evaluate((text) => { const all = [...document.querySelectorAll('[data-open] [data-board] [data-board-card]')]; const at = all.findIndex((one) => one.innerText.includes(text.slice(0, 12))); const box = all[at]?.getBoundingClientRect(); return box ? { x: Math.round(box.left + box.width - 14), y: Math.round(box.top + box.height / 2), writing: !!all[at].querySelector('.tiptap[contenteditable="true"]') } : null }, LINES[line])
    const bring = async (line) => {
      const at = await cardWith(line)
      if (!at || at.writing) return
      // A double-click on the card's words (another card being written is finished by the press, as anywhere).
      const words = await spot('[data-open] [data-board] [data-board-card]', ['Start', 'will', 'gato', 'cat'][line])
      if (!words) return
      await h.mouse.dblclick(words.x, words.y)
      await h.waitForSelector(CARD, { timeout: 5000 }).catch(() => {})
      await h.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, CARD, { timeout: 5000 }).catch(() => {})
      await wait(900)
    }
    await drive('a board card', {
      on: async (line, open = true) => { if (open) await bring(line); return open ? CARD : '[data-open] [data-board] [data-board-card]' },
      open: () => h.evaluate((sel) => !!document.querySelector(sel), CARD),
      // A card being written in keeps its right-click for its words (board-view.tsx): the card's own menu stays shut.
      right: { says: 'and the card\'s own menu stays shut while it is being written in', ok: (rows) => !rows?.length }
    })
    await h.keyboard.press('Escape')
    await wait(400)
  }

  // A day's page.
  if (part('day')) {
    await c.go('inbox')
    await h.locator('nav [data-side-row][aria-label="Journal"]').first().click()
    const DAY = '[data-day-write] .tiptap'
    await h.waitForSelector(DAY, { timeout: 20000 })
    await wait(800)
    await h.evaluate(([sel, lines]) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }).run(), [DAY, LINES])
    await h.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, DAY, { timeout: 10000 }).catch(() => {})
    await wait(1200)
    await drive('a day\'s page', {
      on: async () => DAY,
      open: () => h.evaluate((sel) => !!document.querySelector(`${sel}[contenteditable="true"]`), DAY),
      right: { says: 'the block menu opens without them', ok: (rows) => !!rows?.length }
    })
    // Writing mode (three words typed): a press on the pill is a press in the writing, and the mode stays.
    await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), DAY)
    await h.keyboard.type(' and so we wrote on untill', { delay: 30 })
    const mode = await h.evaluate(() => document.documentElement.hasAttribute('data-day-writing'))
    await h.waitForSelector('[data-spell-hint][data-spell-word="untill"]', { timeout: 4000 }).catch(() => {})
    // Pressed once it rests (the page moves under the line being written, and the pill with it).
    let pill = null
    for (let i = 0; i < 20 && !pill; i++) {
      const was = await pillNow()
      await wait(120)
      const now = await pillNow()
      if (was && now && now.word === 'untill' && was.x === now.x && was.y === now.y) pill = now
    }
    // Seen, not only in the page: writing mode fades all that is not the writing, and the pill went with it.
    const seen = await h.evaluate(() => { const one = document.querySelector('[data-spell-hint]'); return one ? Number(getComputedStyle(one).opacity) : 0 })
    if (shots) await h.screenshot({ path: `${shots}/a-day-s-page-writing-mode-pill.png` })
    if (pill) await h.mouse.click(pill.x, pill.y)
    await wait(400)
    const still = await h.evaluate(() => document.documentElement.hasAttribute('data-day-writing'))
    const written = (await textOf(DAY)).trim()
    check('a day\'s page, in writing mode: the pill is seen, a press on it puts the word right (“untill” to “until”) and writing mode stays', mode && !!pill && seen === 1 && still && /wrote on until$/.test(written), `writing mode before: ${mode}; the pill: ${JSON.stringify(pill?.text)}, opacity ${seen}; after: ${still}; ${JSON.stringify(written.slice(-40))}`)
    await h.keyboard.press('Escape')
  }

  const row = (await electron.evaluate(() => globalThis.mainStalls?.()))?.rows.find((one) => one.name === 'spell:check')
  check('main answered every spelling question itself (spell:check)', !!row && row.calls > 0, row ? `${row.calls} asks, worst ${row.worst} ms [${load()}]` : 'no spell:check row')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  done()
}
