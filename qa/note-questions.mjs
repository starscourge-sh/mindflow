// Study questions from a note (note-questions.tsx, main/note-questions.ts): drafted from the note's own
// headings, definitions, lists and bold words, shown in the keep / change / drop list the reader's "Five
// cards from a chapter" uses, docked where the note's Details open. Driven as a person would: the note's
// "…" menu, ⌘K, and words picked with the pointer then right-clicked. Nothing is made until kept; a kept
// one is a study card whose Review "Show in its note" finds the note and line; ⌘Z takes it back; Drop
// makes nothing; Esc closes; a note with nothing to ask about says so. Every answer is in the note.
// HALIGTREE_QA_CAPS=every (or macos26): the every-Mac drafts, said so. HALIGTREE_QA_CAPS=ai: a stand-in
// model phrases them (one of its answers made up: the check must drop it). On the example book or a copy
// of a real book (QA_ARGS empty):
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_CAPS=every node qa/note-questions.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_CAPS ??= 'every'
const level = process.env.HALIGTREE_QA_CAPS
const ai = level === 'ai'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const book = process.env.QA_ARGS.includes('--sandbox') ? 'example book' : 'book copy'

const text = (words, bold = false) => ({ type: 'text', text: words, ...(bold ? { marks: [{ type: 'bold' }] } : {}) })
const para = (...content) => ({ type: 'paragraph', content })
const NOTE = {
  type: 'doc',
  content: [
    para(text('Cells and energy, for Thursday')),
    { type: 'heading', attrs: { level: 2 }, content: [text('Spaced repetition')] },
    para(text('Reviewing just before you forget makes each memory last longer than the time before.')),
    para(text('Photosynthesis is the way plants turn light into sugar.')),
    para(text('The cell gets its energy from the '), text('mitochondria', true), text(' in every one of its parts.')),
    para(text('Kant asked three questions:')),
    { type: 'bulletList', content: ['What can I know?', 'What ought I to do?', 'What may I hope?'].map((one) => ({ type: 'listItem', content: [para(text(one))] })) },
  ],
}
const BARE = { type: 'doc', content: [para(text('Lovely walk today, the light was soft on the river.'))] }

const c = await sandbox({ width: 1300, height: 900, seeded: book === 'example book' })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const panel = () => h.evaluate(() => {
  const one = document.querySelector('[data-note-questions]')
  if (!one) return null
  const r = one.getBoundingClientRect()
  const editor = [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor && !one.editor.isDestroyed)?.getBoundingClientRect()
  return {
    state: one.getAttribute('data-note-questions'), by: one.getAttribute('data-questions-by'),
    title: one.querySelector('h3')?.textContent ?? '', note: one.querySelector('.chapter-cards-note')?.textContent ?? '',
    drafts: [...one.querySelectorAll('[data-chapter-card]')].map((card) => ({ state: card.getAttribute('data-chapter-card'), q: card.querySelector('.chapter-card-question')?.value, a: card.querySelector('.chapter-card-answer')?.value })),
    none: one.querySelector('[data-note-questions-none]')?.textContent ?? '',
    inDetails: !!one.closest('aside.mf-details'), beside: !!editor && Math.round(editor.right) <= Math.round(r.left) + 1,
  }
})
const flat = (words) => words.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const cards = async () => (await v('cards:all')).length
// Details out or put away by its button, from whichever it is now: its state is the book's own, kept between runs.
const setDetails = async (on) => {
  const button = '[data-note-head] button[aria-label="Details"]'
  const now = await h.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', button)
  if (now !== on) await h.click(button).catch((error) => console.log('Details button:', String(error).slice(0, 160)))
  await wait(400)
}

try {
  await v('settings:set', { hintRate: 0 })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), NOTE)
  await send('capture', id)
  await h.waitForFunction(() => /Photosynthesis/.test([...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor && !one.editor.isDestroyed)?.textContent ?? ''), null, { timeout: 15000 })
  await wait(600)
  const before = await cards()

  // 1. The note's "…" menu.
  await h.click('[data-note-head] button[aria-label="More"]')
  await wait(400)
  const row = h.locator('[role="menuitem"][data-make-questions]')
  check(`${book}, ${level}: the note's “…” has “Make study questions”`, (await row.count()) === 1)
  const frames = []
  if ((await row.count()) === 1) {
    await row.click()
    for (let i = 0; i < 12; i++) { frames.push((await panel())?.state ?? null); if (shots && i < 8) await h.screenshot({ path: join(shots, `questions-frame-${level}-${i}.png`) }); await wait(50) }
  } else await h.keyboard.press('Escape')
  await waitFor(async () => /\d/.test((await panel())?.state ?? ''))
  const first = await panel()
  console.log(JSON.stringify(first))
  check(`${book}, ${level}: three to five drafts, in the list docked where the note's Details open, beside the note`, !!first && first.drafts.length >= 3 && first.drafts.length <= 5 && first.inDetails && first.beside, JSON.stringify(first))
  check(`${book}, ${level}: it says where they came from and that nothing is made until kept`,
    !!first && (ai ? /^(Phrased|\d+ of \d+ phrased) by Apple Intelligence, (all )?from your words/.test(first.note) && first.by === 'ai' :/From your headings and definitions/.test(first.note) && first.by === 'note' && !/Apple Intelligence/.test(first.note)) && /Nothing is made until you keep it/.test(first.note), first?.note)
  check(`${book}, ${level}: nothing was made by drafting`, !!first?.drafts.length && (await cards()) === before)
  const words = flat(await h.evaluate(() => [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor && !one.editor.isDestroyed)?.innerText ?? ''))
  const inNote = (answer) => answer.split('; ').every((part) => ` ${words} `.includes(` ${flat(part.replace(/…$/, ''))} `))
  check(`${book}, ${level}: every draft's answer is in the note's own words`, !!first && first.drafts.every((one) => inNote(one.a ?? '')), JSON.stringify(first?.drafts.map((one) => one.a)))
  if (ai) check(`${book}, ai: the model's made-up answer was dropped by the check, the note's own draft kept`, !!first && first.drafts.every((one) => !/never gave/.test(one.a ?? '')) && first.drafts.some((one) => /stand-in/.test(one.q ?? '')), JSON.stringify(first?.drafts))
  check(`${book}, ${level}: the list showed at once, then the drafts (frames)`, frames.length > 0 && frames.some((one) => one !== null), JSON.stringify(frames))
  if (shots) for (const look of ['light', 'dark']) { await c.look(look); await wait(350); await h.screenshot({ path: join(shots, `questions-${level}-${look}.png`) }) }
  await c.look('light')
  // The hand on everything that clicks, the text cursor in the fields: every control in the list, as computed.
  const hands = await h.evaluate(() => [...document.querySelectorAll('[data-note-questions] button, [data-note-questions] textarea')].map((one) => ({ what: one.tagName === 'TEXTAREA' ? `field ${one.getAttribute('aria-label')}` : `${one.getAttribute('aria-label') ?? one.textContent?.trim().slice(0, 24)}${one.disabled ? ' (disabled)' : ''}`, cursor: getComputedStyle(one).cursor, field: one.tagName === 'TEXTAREA', disabled: !!one.disabled })))
  check(`${book}, ${level}: every button in the list shows the hand, every field the text cursor`, hands.length > 0 && hands.every((one) => (one.field ? one.cursor === 'text' || one.cursor === 'auto' : one.disabled || one.cursor === 'pointer')), JSON.stringify(hands))
  // Paper and Satin: the shape style (Paper squares every corner) and Review's finish (its own surfaces only).
  if (shots) {
    // The look first: switching it puts the book's own style back, so the style and finish are worn after it.
    for (const [style, finish] of [['paper', 'satin'], ['paper', 'paper'], ['soft', 'paper']]) {
      for (const look of ['light', 'dark']) {
        await c.look(look)
        await h.evaluate(([style, finish]) => { if (style === 'soft') delete document.documentElement.dataset.style; else document.documentElement.dataset.style = style; document.documentElement.dataset.reviewFinish = finish }, [style, finish])
        await wait(350)
        await h.screenshot({ path: join(shots, `questions-${level}-style-${style}-finish-${finish}-${look}.png`) })
      }
    }
    await h.evaluate(() => { delete document.documentElement.dataset.style; document.documentElement.dataset.reviewFinish = 'satin' })
    await c.look('light')
  }
  check(`${book}, ${level}: in Paper the list's cards are square`, await h.evaluate(async () => {
    document.documentElement.dataset.style = 'paper'
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const square = [...document.querySelectorAll('[data-note-questions] .chapter-card')].every((one) => getComputedStyle(one).borderTopLeftRadius === '0px')
    delete document.documentElement.dataset.style
    return square
  }))
  // Beside the list of notes: the note's text keeps the width it has with Details out (the questions take the Details' room).
  const textWidth = () => h.evaluate(() => Math.round([...document.querySelectorAll('.tiptap.ProseMirror')][0]?.getBoundingClientRect().width ?? 0))
  const withQuestions = await textWidth()
  await h.locator('[data-note-questions] h3').click().catch(() => {})
  await h.keyboard.press('Escape')
  await wait(400)
  const alone = await textWidth()
  await setDetails(true)
  await wait(500)
  const withDetails = await textWidth()
  await setDetails(false)
  await wait(400)
  console.log(`note text width beside the list: alone ${alone}px, with Details ${withDetails}px, with the questions ${withQuestions}px`)
  check(`${book}, ${level}: with the questions out the note's text is as wide as with Details out (within 2px)`, withQuestions > 0 && Math.abs(withQuestions - withDetails) <= 2, `alone ${alone}, Details ${withDetails}, questions ${withQuestions}`)
  // The narrowest window (560 by 400): asked for there, the list opens in sight (under the note), fits, and nothing scrolls sideways.
  await c.size(560, 400)
  await wait(600)
  await h.click('[data-note-head] button[aria-label="More"]').catch(() => {})
  await wait(400)
  if ((await row.count()) === 1) await row.click()
  else await h.keyboard.press('Escape')
  await wait(500)
  const narrow = await h.evaluate(() => ({ inner: innerWidth, high: innerHeight, wide: document.documentElement.scrollWidth, list: document.querySelector('[data-note-questions]')?.getBoundingClientRect().toJSON() }))
  check(`${book}, ${level}: at 560 by 400 the list opens in sight, fits, nothing scrolls sideways`, !!narrow.list && narrow.wide <= narrow.inner && narrow.list.right <= narrow.inner && narrow.list.top < narrow.high - 40 && narrow.list.bottom > 40, JSON.stringify(narrow))
  if (shots) for (const look of ['light', 'dark']) { await c.look(look); await wait(350); await h.screenshot({ path: join(shots, `questions-560-${level}-${look}.png`) }) }
  await c.look('light')
  // Details there too: under the whole note in a window this narrow, and asked for by its button, it comes into sight.
  await h.locator('[data-note-questions] h3').click().catch(() => {})
  await h.keyboard.press('Escape')
  await wait(300)
  await setDetails(false)
  await h.evaluate(() => document.querySelector('.note-pane')?.scrollTo({ top: 0 }))
  await setDetails(true)
  await wait(600)
  const details = await h.evaluate(() => ({ high: innerHeight, aside: document.querySelector('aside.mf-details')?.getBoundingClientRect().toJSON() }))
  check(`${book}, ${level}: at 560 by 400 Details, asked for by its button, comes into sight under the note`, !!details.aside && details.aside.top < details.high - 40 && details.aside.bottom > 40, JSON.stringify(details))
  if (shots) for (const look of ['light', 'dark']) { await c.look(look); await wait(350); await h.screenshot({ path: join(shots, `details-560-${level}-${look}.png`) }) }
  await c.look('light')
  await setDetails(false)
  await wait(300)
  await c.size(1300, 900)
  await wait(600)
  // The list again, for keeping and dropping.
  await h.click('[data-note-head] button[aria-label="More"]').catch(() => {})
  await wait(400)
  if ((await row.count()) === 1) await row.click()
  else await h.keyboard.press('Escape')
  await waitFor(async () => /\d/.test((await panel())?.state ?? ''))

  // 2. Change the first, keep it: one card, with its question as changed, from this note and line.
  const KEEP_LINES = ['Keep made one study card, with the question as changed', 'the card says where it came from: this note, at its line', '⌘Z takes the kept card back, and its draft is open to keep again', 'Drop makes nothing and offers it back', 'Esc puts the list away']
  if (!first?.drafts.length) for (const line of KEEP_LINES) check(`${book}, ${level}: ${line}`, false, 'no list')
  else {
  const field = h.locator('[data-note-questions] .chapter-card-question').first()
  await field.fill('What turns light into sugar in a plant?')
  await h.locator('[data-note-questions] [data-chapter-card-keep]').first().click()
  await waitFor(async () => (await cards()) === before + 1)
  const all = await v('cards:all')
  const found = all.find((one) => one.prompt === 'What turns light into sugar in a plant?')
  // The card as Review reads it (its passage is not in the cards list), and the note Review's "Show in its note" opens.
  const kept = found ? { ...found, ...(await v('item', found.id)) } : null
  const source = kept ? await v('review:source', kept.id) : null
  check(`${book}, ${level}: Keep made one study card, with the question as changed`, !!kept && all.length === before + 1, JSON.stringify(kept ?? null).slice(0, 300))
  check(`${book}, ${level}: the card says where it came from: this note, at its line`, source?.id === id && !!kept?.passage && words.includes(flat(kept.passage).slice(0, 30)), JSON.stringify({ source: source?.id, passage: kept?.passage }))
  // ⌘Z takes it back (focus on the button just pressed, not in a field).
  await h.keyboard.press('Meta+z')
  await waitFor(async () => (await cards()) === before)
  const undone = await panel()
  check(`${book}, ${level}: ⌘Z takes the kept card back, and its draft is open to keep again`, (await cards()) === before && undone?.drafts[0]?.state === 'open', JSON.stringify(undone?.drafts[0]))
  // Drop makes nothing, and can be brought back.
  await h.locator('[data-note-questions] [data-chapter-card-drop]').nth(1).click()
  await wait(200)
  check(`${book}, ${level}: Drop makes nothing and offers it back`, (await cards()) === before && (await h.locator('[data-note-questions] [data-chapter-card="dropped"]').count()) === 1)
  // Esc puts the list away.
  await h.locator('[data-note-questions] h3').click()
  await h.keyboard.press('Escape')
  await wait(300)
  check(`${book}, ${level}: Esc puts the list away`, (await h.locator('[data-note-questions]').count()) === 0)
  }

  // 3. ⌘K, from the note (not typing in it: there ⌘K adds a link).
  await h.evaluate(() => document.activeElement?.blur())
  // ⌘K is held back while a dialog is over the page (home.tsx, ui.tsx HELD): say which, if one is.
  const holding = await h.evaluate(() => [...document.querySelectorAll('[role="dialog"]:not([data-beside])')].map((one) => `${one.getAttribute('aria-label') ?? ''}|${(one.textContent ?? '').slice(0, 60)}`))
  if (holding.length) console.log('dialogs over the page:', JSON.stringify(holding))
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('Make study questions', { delay: 15 })
  // The palette (search.tsx) ranks by the words once its search has settled; until then it shows the note's first
  // few actions. Its action rows name themselves in [data-action-label]; the lit one, which Enter runs, is [data-search-at].
  const offered = await waitFor(() => h.evaluate(() => [...document.querySelectorAll('[data-search-at] [data-action-label]')].some((one) => one.textContent === 'Make study questions')), 8000)
  if (!offered) console.log('palette rows:', JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('[data-action-label]')].slice(0, 8).map((one) => `${one.closest('[data-search-at]') ? '*' : ''}${one.textContent}`))))
  check(`${book}, ${level}: ⌘K offers “Make study questions” for the open note`, offered)
  await h.keyboard.press(offered ? 'Enter' : 'Escape')
  await waitFor(async () => /\d/.test((await panel())?.state ?? ''))
  check(`${book}, ${level}: and opens the same list`, ((await panel())?.drafts.length ?? 0) >= 3)
  await h.locator('[data-note-questions] h3').click().catch(() => {})
  await h.keyboard.press('Escape')
  await wait(300)

  // 4. A picked phrase: the pointer double-clicks a word, then right-clicks it.
  const at = await h.evaluate(() => {
    const walker = document.createTreeWalker([...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor && !one.editor.isDestroyed), NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const n = node.textContent.indexOf('mitochondria')
      if (n < 0) continue
      const range = document.createRange()
      // In sight first: the window may be scrolled from an earlier step.
      node.parentElement?.scrollIntoView({ block: 'center' })
      range.setStart(node, n + 2)
      range.setEnd(node, n + 3)
      const r = range.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    return null
  })
  if (at) {
    await h.mouse.dblclick(at.x, at.y)
    await wait(300)
    await h.mouse.click(at.x, at.y, { button: 'right' })
    await wait(500)
  }
  const ask = h.locator('[role="menuitem"]', { hasText: 'Make a question' })
  check(`${book}, ${level}: picked words have “Make a question” on their right-click`, (await ask.count()) >= 1)
  if ((await ask.count()) >= 1) {
    await ask.first().click()
    await waitFor(async () => /\d/.test((await panel())?.state ?? ''))
    const one = await panel()
    check(`${book}, ${level}: one draft from the picked word: its sentence with a gap where it stood`, one?.drafts.length === 1 && /_____/.test(one.drafts[0].q ?? '') && one.drafts[0].a === 'mitochondria' && /A question from these words/.test(one.title), JSON.stringify(one))
    check(`${book}, ${level}: still nothing made`, (await cards()) === before)
    await h.locator('[data-note-questions] h3').click().catch(() => {})
    await h.keyboard.press('Escape')
  } else {
    await h.keyboard.press('Escape')
    check(`${book}, ${level}: one draft from the picked word: its sentence with a gap where it stood`, false, 'not offered')
    check(`${book}, ${level}: still nothing made`, false, 'not offered')
  }

  // 5. The offer line, for a note with enough in it (150 words or more, three drafts or more) and no card yet.
  const filler = 'we walked along the quiet canal at dusk and talked about the week, the weather and what to cook for supper later on.'
  const long = { type: 'doc', content: [para(text('Glyph study, second week')), { type: 'heading', attrs: { level: 2 }, content: [text('Tidal glyphs')] }, para(text('Reading them takes patience because each mark changes meaning with the tide around it.')),
    para(text('A glyph is a small carved sign that stands for one sound.')), para(text('A tideline is the mark the highest water leaves on a stone.')), para(text('The keeper is the person who copies each glyph into the ledger.')),
    ...Array.from({ length: 7 }, () => para(text(filler)))] }
  const longId = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), long)
  await send('capture', longId)
  await h.waitForFunction(() => /Tidal glyphs/.test([...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor && !one.editor.isDestroyed)?.textContent ?? ''), null, { timeout: 15000 })
  const offerShown = await waitFor(() => h.evaluate(() => !!document.querySelector('[data-note-offer="questions"]')), 12000)
  const offerWords = await h.evaluate(() => document.querySelector('[data-note-offer]')?.textContent ?? '')
  check(`${book}, ${level}: a long note with no cards is offered “Make study questions from this?” under it`, offerShown && /Make study questions from this\?/.test(offerWords), offerWords)
  if (offerShown) {
    if (shots) await h.screenshot({ path: join(shots, `questions-offer-${level}.png`) })
    await h.click('[data-note-offer="questions"] [data-offer-action="questions"]')
    await waitFor(async () => /\d/.test((await panel())?.state ?? ''))
    const fromOffer = await panel()
    check(`${book}, ${level}: “Make them” opens the same list, and the offer goes for good`, (fromOffer?.drafts.length ?? 0) >= 3 && !(await h.evaluate(() => !!document.querySelector('[data-note-offer="questions"]'))), JSON.stringify(fromOffer?.drafts.map((one) => one.q)))
    await h.locator('[data-note-questions] h3').click().catch(() => {})
    await h.keyboard.press('Escape')
  } else check(`${book}, ${level}: “Make them” opens the same list, and the offer goes for good`, false, 'not offered')

  // 6. The unhappy path: a note with nothing to ask about says so.
  const bare = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), BARE)
  await send('capture', bare)
  await h.waitForFunction(() => /Lovely walk/.test([...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor && !one.editor.isDestroyed)?.textContent ?? ''), null, { timeout: 15000 })
  await wait(500)
  await h.click('[data-note-head] button[aria-label="More"]')
  await wait(400)
  if ((await row.count()) === 1) await row.click()
  else await h.keyboard.press('Escape')
  await waitFor(async () => ((await panel())?.state ?? 'reading') !== 'reading')
  const none = await panel()
  check(`${book}, ${level}: a note with nothing to ask about says “Not enough here to ask about yet.” and why`, none?.state === '0' && /Not enough here to ask about yet\./.test(none.none) && /heading/.test(none.none), JSON.stringify(none))
  if (shots) await h.screenshot({ path: join(shots, `questions-none-${level}.png`) })
} catch (error) {
  check(`${book}, ${level}: ran without throwing`, false, String(error?.stack ?? error))
} finally {
  // What the page itself complained of, if anything: a dev-only fault shows here first.
  if (c.errors?.length) console.log('page errors:', JSON.stringify(c.errors.slice(0, 6)).slice(0, 2400))
  await c.close?.()
}
done()
