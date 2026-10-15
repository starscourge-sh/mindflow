// Studying, end to end, in a fresh install and then the sandbox: cards
// written in a note (question :: answer), the card that keeps slipping
// (rewrite, split, set aside, the Struggling shelf), practice rounds that
// move nothing you do not grade, the review reminder, blurting a tag, and the
// Learn Vigil deck. Screenshots in Paper, GitHub Dark and Brutal.
//
//   npx electron-vite build --outDir out-study
//   QA_ENTRY=out-study/main/index.js SHOTS=<dir> node qa/study.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const dir = process.env.SHOTS ?? join(tmpdir(), 'study-shots')
mkdirSync(dir, { recursive: true })
process.env.QA_DATA = mkdtempSync(join(tmpdir(), 'vigil-study-'))
process.env.QA_ARGS = ''
const { sandbox } = await import('./sandbox-lib.mjs')

let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failed++ }

const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })) })

let c = await sandbox({ width: 1280, height: 860, seeded: false })
let { h, v, go, send } = c
const wait = (ms = 700) => h.waitForTimeout(ms)
const text = (selector) => h.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', selector)
const has = (selector) => h.evaluate((s) => !!document.querySelector(s), selector)
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const shot = (name) => h.screenshot({ path: join(dir, `${name}.png`) })
/** A look: Paper (light), GitHub Dark, or Paper in Brutal. */
const look = async (theme, brutal = false) => {
  await h.evaluate((on) => (on ? localStorage.setItem('style', 'brutal') : localStorage.removeItem('style')), brutal)
  await c.theme(theme)
  await c.size(1280, 860)
}
/** A gem with a question, graded as given, made due now. */
const gem = async (words, prompt, grades = []) => {
  const id = await v('nugget:from', words, {})
  await v('item:save', id, { title: prompt, prompt })
  for (const grade of grades) await v('review:grade', id, grade, 8000)
  if (grades.length) await v('blurt:sooner', [id])
  return id
}
/** Review open on its first card, the answer shown. */
const reviewTo = async (prompt) => {
  await go('home')
  await go('review')
  await h.waitForFunction((p) => [...document.querySelectorAll('h2[contenteditable]')].some((one) => one.textContent?.includes(p)), prompt, { timeout: 8000 })
  await blur()
}

try {
  // Never a notification on the tester's screen: shown is stubbed, what it says is returned.
  await c.electron.evaluate(({ Notification }) => { Notification.prototype.show = function () { globalThis.__notified = (globalThis.__notified ?? 0) + 1; globalThis.__said = this.body } })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload()
  await wait(2000)

  // --- the review reminder, with nothing due: silent ------------------------------------
  const minuteAgo = new Date(Date.now() - 60000).toTimeString().slice(0, 5)
  await v('settings:set', { reviewReminder: minuteAgo, quietStart: '03:00', quietEnd: '03:01' })
  check('reminder: silent when nothing is due', (await v('review:reminder:now')) === null)
  // Off again until its own test, so the half-minute check cannot send it first.
  await v('settings:set', { reviewReminder: null })

  // --- cards written in a note ----------------------------------------------------------
  const note = await h.evaluate((body) => window.api.captures.create({ body }), doc('Trip to Peru', 'Capital of Peru :: Lima', 'std::vector is not a card'))
  let cards = (await v('items', 'card')).filter((one) => !one.archivedAt)
  check('a :: line becomes a card', cards.length === 1 && cards[0].prompt === 'Capital of Peru' && cards[0].lineOf === `capture:${note}`, JSON.stringify(cards.map((one) => [one.prompt, one.lineOf])))
  const cardId = cards[0]?.id
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [note, doc('Trip to Peru', 'Capital city of Peru :: Lima', 'Highest lake :: Titicaca')])
  cards = (await v('items', 'card')).filter((one) => !one.archivedAt)
  check('an edited line keeps its card, a new line adds one', cards.length === 2 && cards.some((one) => one.id === cardId && one.prompt === 'Capital city of Peru'), cards.map((one) => one.prompt).join(' | '))
  const full = await v('item', cardId)
  check('the card answers with the words after ::', full?.body === 'Lima', JSON.stringify(full?.body))
  const found = await h.evaluate(() => window.api.captures.search('Titicaca'))
  check('cards stay out of Gems and search', !(await v('items', 'nugget')).some((one) => one.id === cardId) && !found.some((one) => one.type === 'card'), found.map((one) => one.type).join(','))
  // The note open: a small card at the end of each card line, none on the code.
  await send('capture', note)
  await wait(1500)
  const marks = await h.evaluate(() => [...document.querySelectorAll('.mf-line-card')].map((one) => one.parentElement?.textContent ?? ''))
  check('a card mark at the end of each card line', marks.length === 2 && marks.every((one) => one.includes('::')), JSON.stringify(marks))
  for (const [theme, brutal, name] of [['paper', false, 'line-cards-paper'], ['github', false, 'line-cards-dark']]) {
    await look(theme, brutal)
    await send('capture', note)
    await wait(1500)
    await shot(name)
  }
  await look('paper')
  // In Review: where it is from, and R opens the note at that line.
  await reviewTo('Capital city of Peru')
  check('Review says which note a card is from', (await text('[data-line-from]')).includes('Trip to Peru'), await text('[data-line-from]'))
  await shot('line-card-review')
  await h.keyboard.press('r')
  await wait(1800)
  const landed = await h.evaluate(() => {
    const node = getSelection()?.anchorNode
    const block = node?.nodeType === 3 ? node.parentElement : node
    return (block?.closest?.('p, li') ?? block)?.textContent ?? ''
  })
  check('R opens the note at the card’s line', landed.includes('Capital city of Peru'), landed)
  // A line taken out takes its card with it.
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [note, doc('Trip to Peru', 'Highest lake :: Titicaca')])
  cards = (await v('items', 'card')).filter((one) => !one.archivedAt)
  check('a line taken out takes its card out of Review', cards.length === 1 && cards[0].prompt === 'Highest lake', cards.map((one) => one.prompt).join(' | '))
  // A day's page works the same.
  const today = await h.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  await v('notes:day:save', today, { body: doc('Longest river :: The Nile') })
  check('a day’s page makes cards too', (await v('items', 'card')).some((one) => one.lineOf === `day:${today}` && one.prompt === 'Longest river'))
  await v('notes:day:save', today, { body: doc('') })

  // --- the card that keeps slipping ------------------------------------------------------
  const lagrange = await gem('Five points where a small body sits still between two large ones. Webb is at L2. #astro', 'What are the Lagrange points?', [3, 1, 1, 1])
  check('three misses is not slipping yet', (await v('item', lagrange)).lapses === 3)
  await reviewTo('What are the Lagrange points?')
  await h.keyboard.press(' ')
  await wait(500)
  await h.keyboard.press('1')
  await wait(900)
  check('the fourth miss says This one keeps slipping', (await text('[data-slipping]')).includes('This one keeps slipping'), await text('[data-slipping] h2'))
  const ways = await text('[data-slipping]')
  check('it offers rewrite, split and pause', ['Rewrite it', 'Split it', 'Pause it'].every((one) => ways.includes(one)))
  for (const [theme, brutal, name] of [['paper', false, 'slipping-paper'], ['github', false, 'slipping-dark'], ['paper', true, 'slipping-brutal']]) {
    await look(theme, brutal)
    // A reload starts Review again: due now, and missed once more, the panel is back.
    await v('blurt:sooner', [lagrange])
    await reviewTo('What are the Lagrange points?')
    await h.keyboard.press(' ')
    await wait(400)
    await h.keyboard.press('1')
    await wait(1100)
    await shot(name)
  }
  await look('paper')
  await v('blurt:sooner', [lagrange])
  await reviewTo('What are the Lagrange points?')
  await h.keyboard.press(' ')
  await wait(400)
  await h.keyboard.press('1')
  await wait(900)
  // 3: set aside.
  await h.keyboard.press('3')
  for (let i = 0; i < 20 && (await v('item', lagrange)).suspended !== 1; i++) await wait(150)
  check('3 sets it aside', (await v('item', lagrange)).suspended === 1)
  await go('home')
  await go('review')
  await wait(1200)
  check('the Struggling shelf keeps it, paused', (await text('[data-struggling]')).includes('What are the Lagrange points?') && (await text('[data-struggling]')).includes('Paused'), await text('[data-struggling]'))
  await shot('struggling-shelf')
  // Brought back from the shelf.
  await h.evaluate(() => [...document.querySelectorAll('[data-struggling] button')].find((one) => one.textContent?.includes('Back in Review'))?.click())
  await wait(800)
  check('“Back in Review” puts it in Review again', (await v('item', lagrange)).suspended === 0)
  await v('item:save', lagrange, { suspended: true })

  // 2: split it.
  const tides = await gem('The Moon pulls the near side of the sea, and the far side is left behind, so two bulges. #astro', 'Why are there two tides a day, and which body causes them?', [3, 1, 1, 1])
  await reviewTo('Why are there two tides a day')
  await h.keyboard.press(' ')
  await wait(400)
  await h.keyboard.press('1')
  await wait(900)
  await h.keyboard.press('2')
  await wait(600)
  check('2 opens the split', await has('[data-split]'))
  await h.evaluate(() => {
    const [narrower, question] = document.querySelectorAll('[data-split] input')
    const answer = document.querySelector('[data-split] textarea')
    const set = (el, value) => { const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(narrower, 'Why are there two tides a day?')
    set(question, 'Which body mostly causes the tides?')
    set(answer, 'The Moon, about twice as strongly as the Sun.')
  })
  await shot('split')
  await h.focus('[data-split] textarea')
  await h.keyboard.press('Meta+Enter')
  await wait(900)
  const split = (await v('items', 'nugget')).find((one) => one.prompt === 'Which body mostly causes the tides?')
  check('the split makes a new card', !!split)
  check('and narrows this one', (await v('item', tides)).prompt === 'Why are there two tides a day?')
  check('the new card carries the tags', String((await v('item', split?.id))?.body ?? '').includes('#astro'))
  await v('item:save', tides, { suspended: true })

  // 1: rewrite it.
  const comet = await gem('Ice and dust, warmed by the Sun into a tail that points away from it. #astro', 'Comet tails?', [3, 1, 1, 1])
  await reviewTo('Comet tails?')
  await h.keyboard.press(' ')
  await wait(400)
  await h.keyboard.press('1')
  await wait(900)
  await h.keyboard.press('1')
  await wait(600)
  const editing = await h.evaluate(() => document.activeElement?.getAttribute('contenteditable') === 'true' && document.activeElement.textContent)
  check('1 puts the card back with its question ready to rewrite', editing === 'Comet tails?', String(editing))
  await h.keyboard.type('Which way does a comet’s tail point?')
  await h.keyboard.press('Enter')
  await wait(800)
  check('the rewritten question is kept', (await v('item', comet)).prompt === 'Which way does a comet’s tail point?')
  await v('item:save', comet, { suspended: true })

  // --- practice by focus ---------------------------------------------------------------
  for (const [words, prompt] of [['Mercury, the smallest planet #astro', 'Smallest planet?'], ['Olympus Mons, on Mars #astro', 'Tallest volcano?'], ['Ganymede, a moon of Jupiter #astro', 'Largest moon?']]) await gem(words, prompt)
  const known = await gem('Venus, its thick air traps heat #astro', 'Hottest planet?', [4])
  const buckets = await v('review:buckets')
  check('the rounds count their cards', buckets.new >= 3, JSON.stringify(buckets))
  const before = Object.fromEntries((await v('items', 'nugget')).map((one) => [one.id, one.dueAt]))
  await go('home')
  await go('review')
  await wait(1200)
  // The rounds sit folded under “Practise”, at the top of Review.
  await h.evaluate(() => document.querySelector('[data-practise]')?.click())
  await wait(600)
  check('five chips under Practise, and Starred', (await h.evaluate(() => [...document.querySelectorAll('[data-focus-chips] button')].filter((one) => !one.hasAttribute('data-learn-new')).length)) === 6)
  // The fifth is New; its label rolls in, so it is found by place.
  await h.evaluate(() => document.querySelectorAll('[data-focus-chips] button')[4]?.click())
  await wait(1200)
  check('a round says it is extra', (await h.evaluate(() => document.body.textContent?.includes('An extra round. Nothing moves unless you grade it.'))))
  await shot('practice-round')
  await blur()
  // Skip one: nothing moves.
  await h.keyboard.press('b')
  await wait(600)
  const afterSkip = Object.fromEntries((await v('items', 'nugget')).map((one) => [one.id, one.dueAt]))
  check('skipping in a round moves no due date', Object.keys(before).every((id) => before[id] === afterSkip[id]))
  // Grade one: only that one moves.
  await h.keyboard.press(' ')
  await wait(400)
  await h.keyboard.press('3')
  await wait(700)
  const afterGrade = Object.fromEntries((await v('items', 'nugget')).map((one) => [one.id, one.dueAt]))
  const moved = Object.keys(before).filter((id) => before[id] !== afterGrade[id])
  check('grading in a round moves only that card', moved.length === 1, `${moved.length} moved`)
  check('a known card is not in the New round', !moved.includes(known))
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => one.textContent?.includes('Back to today’s cards'))?.click())
  await wait(900)
  check('Back to today’s cards leaves the round', !(await h.evaluate(() => document.body.textContent?.includes('An extra round.'))))

  // --- the reminder, now that cards are due ------------------------------------------------
  const now = new Date()
  const quietFrom = new Date(now.getTime() - 3600000).toTimeString().slice(0, 5)
  const quietTo = new Date(now.getTime() + 3600000).toTimeString().slice(0, 5)
  await v('settings:set', { quietStart: quietFrom, quietEnd: quietTo, reviewReminder: new Date(Date.now() - 60000).toTimeString().slice(0, 5) })
  check('reminder: silent in quiet hours', (await v('review:reminder:now')) === null)
  await v('settings:set', { quietStart: '03:00', quietEnd: '03:01' })
  // The half-minute check may say it first: either way, what was said.
  const said = (await v('review:reminder:now')) ?? (await c.electron.evaluate(() => globalThis.__said ?? null))
  check('reminder: says how many and how long', /^\d+ cards?, about \d+ minutes?$/.test(said ?? ''), String(said))
  // One reminder, not two: Vigil's own card when it can be seen, the Mac's notification only when it cannot (the screen locked).
  // The card's window may still be loading its page: give it a moment to say where it is.
  await wait(1500)
  const told = await c.electron.evaluate(({ BrowserWindow }) => (globalThis.__notified ?? 0) + BrowserWindow.getAllWindows().filter((one) => one.webContents.getURL().includes('view=nudge')).length)
  check('reminder: it went out once, as a card or a notification', told === 1, `${told}`)
  check('reminder: once a day', (await v('review:reminder:now')) === null)
  await v('settings:set', { reviewReminder: null })
  check('reminder: off says nothing', (await v('review:reminder:now')) === null)
  await v('settings:set', { reviewReminder: '09:00' })
  await go('settings')
  await h.evaluate(() => localStorage.setItem('settings:section', 'Review'))
  await go('home')
  await go('settings')
  await wait(1200)
  await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].find((one) => one.textContent?.includes('Review reminder'))?.scrollIntoView({ block: 'center' }))
  await wait(500)
  check('Settings has Review reminder', await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].some((one) => one.textContent?.includes('Review reminder') && one.querySelector('input[type="time"]'))))
  await shot('reminder-setting')
  await v('settings:set', { reviewReminder: null })

  // --- blurting ------------------------------------------------------------------------
  const horizon = await gem('Event horizon: the boundary past which light cannot escape a black hole. #space', 'What is an event horizon?', [3])
  const radius = await gem('Schwarzschild radius: how small a mass must be squeezed to become a black hole. #space', 'What is a Schwarzschild radius?', [3])
  await gem('Hawking radiation: black holes slowly leak energy and evaporate. #space', 'What is Hawking radiation?', [3])
  // Due later, so coming up sooner shows.
  for (const id of [horizon, radius]) await v('review:bury', id)
  const radiusDue = (await v('item', radius)).dueAt
  await send('tag', 'space')
  await wait(1500)
  await h.evaluate(() => document.querySelector('[data-blurt-open]')?.click())
  await wait(800)
  check('a tag page opens a blurt', (await text('[data-blurt="writing"]')).includes('Write everything you remember about #space'))
  await h.focus('[data-blurt="writing"] textarea')
  await h.keyboard.type('The event horizon is where light cannot escape. Hawking radiation lets black holes leak and evaporate.', { delay: 4 })
  await shot('blurt-writing')
  await h.keyboard.press('Meta+Enter')
  await wait(1500)
  const lit = await h.evaluate(() => [...document.querySelectorAll('[data-missed]')].map((one) => one.textContent?.trim()))
  check('the gems left out are lit', lit.length === 1 && lit[0].includes('Schwarzschild'), JSON.stringify(lit))
  check('what was left out comes up sooner', (await v('item', radius)).dueAt < radiusDue, `${radiusDue} → ${(await v('item', radius)).dueAt}`)
  const page = await v('notes:day', today)
  check('the blurt is kept on today’s page', JSON.stringify(page.body).includes('Blurt on #space') && JSON.stringify(page.body).includes('Hawking radiation lets'))
  for (const [theme, brutal, name] of [['paper', false, 'blurt-paper'], ['github', false, 'blurt-dark'], ['paper', true, 'blurt-brutal']]) {
    await look(theme, brutal)
    await send('tag', 'space')
    await wait(1500)
    await h.evaluate(() => document.querySelector('[data-blurt-open]')?.click())
    await wait(600)
    await h.focus('[data-blurt="writing"] textarea')
    await h.keyboard.type('Event horizon, light cannot escape.', { delay: 2 })
    await h.keyboard.press('Meta+Enter')
    await wait(1500)
    await shot(name)
  }
  await look('paper')

  // --- star a card, type the answer, how it decides ---------------------------------------------
  const peru = await gem('Lima, on the Pacific coast', 'Capital of Peru?', [3])
  await v('blurt:sooner', [peru])
  // Only this one due: the rest of the morning's cards out of the way.
  for (const one of await v('review:queue')) if (one.id !== peru) await v('review:bury', one.id)
  await reviewTo('Capital of Peru?')
  await h.keyboard.press('s')
  await wait(600)
  check('S stars the card', !!(await v('item', peru)).starredAt)
  check('the Starred round counts it', (await v('review:buckets')).starred === 1)
  await h.focus('textarea')
  await h.keyboard.type('Lima on the coast')
  await h.keyboard.press('Meta+Enter')
  await wait(900)
  check('a typed answer says how close it was and suggests a grade', /suggests (Good|Easy|Hard)/.test(await text('[data-typed]')), await text('[data-typed]'))
  check('the suggested grade is marked', await has('[data-suggested]'))
  await h.evaluate(() => document.querySelector('[data-how] summary')?.click())
  await wait(900)
  check('How it decides says the target and this card’s days', (await text('[data-how]')).includes('Vigil aims for you to still know 90%') && (await text('[data-how]')).includes('Good brings it back'), (await text('[data-how]')).slice(0, 160))
  for (const [theme, brutal, name] of [['paper', false, 'typed-how-paper'], ['github', false, 'typed-how-dark'], ['paper', true, 'typed-how-brutal']]) {
    if (theme !== 'paper' || brutal) {
      await look(theme, brutal)
      await v('blurt:sooner', [peru])
      await reviewTo('Capital of Peru?')
      await h.focus('textarea')
      await h.keyboard.type('Lima on the coast')
      await h.keyboard.press('Meta+Enter')
      await wait(700)
      await h.evaluate(() => document.querySelector('[data-how] summary')?.click())
      await wait(900)
    }
    await shot(name)
  }
  await look('paper')
  await v('blurt:sooner', [peru])
  await reviewTo('Capital of Peru?')
  await h.focus('textarea')
  await h.keyboard.type('Lima')
  await h.keyboard.press('Meta+Enter')
  await wait(500)
  const glossesBefore = (await v('glosses', peru)).length
  await blur()
  await h.keyboard.press('3')
  await wait(900)
  check('what you typed is kept as a thought on the card', (await v('glosses', peru)).length === glossesBefore + 1)

  // --- learn mode ----------------------------------------------------------------------------
  const newOnes = await v('review:round', 'new')
  const answers = Object.fromEntries(newOnes.map((one) => [one.prompt, String(typeof one.body === 'string' ? one.body : '').replace(/#[\w-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)]))
  const newBefore = (await v('review:buckets')).new
  await go('home')
  await go('review')
  await wait(1200)
  await h.evaluate(() => document.querySelector('[data-learn-new]')?.click())
  await wait(1000)
  check('Learn the new opens learn mode', await has('[data-learn-mode]'))
  let shotLearn = false
  for (let i = 0; i < 60 && !(await has('[data-learn-done]')); i++) {
    const asked = (await text('[data-learn-mode] h2')).trim()
    if (await has('[data-choices]')) {
      if (!shotLearn) (await shot('learn-mode'), (shotLearn = true))
      // One miss on purpose, to see it come round again.
      const choices = await h.evaluate(() => [...document.querySelectorAll('[data-choices] button')].map((one) => one.textContent?.replace(/^\d/, '').trim()))
      const pick = i === 0 ? choices.findIndex((one) => one !== answers[asked]) : choices.findIndex((one) => one === answers[asked])
      await h.keyboard.press(String(pick + 1))
    } else {
      await h.focus('[data-learn-mode] input')
      await h.keyboard.type(answers[asked] ?? '')
      await h.keyboard.press('Enter')
    }
    await wait(250)
    await h.keyboard.press('Enter')
    await wait(250)
  }
  check('learn mode ends with each new card learnt', await has('[data-learn-done]'), await text('[data-learn-mode]'))
  check('the learnt cards join the schedule', (await v('review:buckets')).new === Math.max(0, newBefore - Math.min(8, newBefore)), `${newBefore} → ${(await v('review:buckets')).new}`)
  await h.keyboard.press('Escape')
  await wait(600)

  // --- practise a tag without counting -------------------------------------------------------
  const spaceDue = Object.fromEntries((await v('tag:cards', 'astro')).map((one) => [one.id, one.dueAt]))
  await send('tag', 'astro')
  await wait(1500)
  await h.evaluate(() => document.querySelector('[data-practise-open]')?.click())
  await wait(900)
  check('Practise opens on the tag’s cards', (await text('[data-practise]')).includes('Nothing here is counted or scheduled'))
  await blur()
  await h.keyboard.press(' ')
  await wait(500)
  check('Space shows the answer', await has('[data-practise-answer]'))
  await shot('practise-tag')
  await h.keyboard.press('j')
  await wait(500)
  check('J goes to the next card', (await text('[data-practise]')).includes('2 of'))
  const spaceAfter = Object.fromEntries((await v('tag:cards', 'astro')).map((one) => [one.id, one.dueAt]))
  check('practising moves no due date', Object.keys(spaceDue).every((id) => spaceDue[id] === spaceAfter[id]))
  await h.keyboard.press('Escape')
  await wait(500)

  // --- tag priority ---------------------------------------------------------------------------
  const planet = await gem('Mercury is closest to the Sun #moons', 'Closest planet?', [3])
  await gem('Io has volcanoes #moons', 'Moon with volcanoes?')
  await v('blurt:sooner', [planet])
  const inQueue = async () => (await v('review:queue')).map((one) => one.prompt)
  await send('tag', 'moons')
  await wait(1500)
  await h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((one) => one.textContent?.includes('Manage'))?.click())
  await wait(800)
  // The chips' words roll in, so they are found by place: Learning, Maintaining, Paused.
  await h.evaluate(() => document.querySelectorAll('[data-tag-priority] button')[2]?.click())
  await wait(800)
  await shot('tag-priority')
  let q = await inQueue()
  check('a paused tag’s cards stay out of Review', !q.includes('Closest planet?') && !q.includes('Moon with volcanoes?'), q.join(' | '))
  check('the tag says it is paused', (await v('tags')).find((one) => one.tag === 'moons')?.priority === 'paused')
  await h.evaluate(() => document.querySelectorAll('[data-tag-priority] button')[1]?.click())
  await wait(800)
  q = await inQueue()
  check('a maintained tag keeps its reviews and starts no new cards', q.includes('Closest planet?') && !q.includes('Moon with volcanoes?'), q.join(' | '))
  await v('tag:set', 'moons', { priority: null })
  q = await inQueue()
  check('Learning brings new cards again', q.includes('Moon with volcanoes?') || (await v('review:buckets')).new > 0)

  // --- paste a list, get cards ----------------------------------------------------------------
  const listNote = await h.evaluate((body) => window.api.captures.create({ body }), doc('Words'))
  await send('capture', listNote)
  await wait(1500)
  await h.evaluate(() => {
    const target = [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.textContent?.includes('Words'))
    target?.focus()
    const data = new DataTransfer()
    data.setData('text/plain', 'Ephemeral - lasting a very short time\nLaconic - using few words\nSanguine - hopeful in a bad time')
    target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await wait(1200)
  await shot('paste-list')
  const offered = await h.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((one) => one.textContent?.includes('Make 3 cards'))
    button?.click()
    return !!button
  })
  check('a pasted list offers Make 3 cards', offered)
  await wait(900)
  const made = (await v('items', 'nugget')).filter((one) => ['Ephemeral', 'Laconic', 'Sanguine'].includes(one.prompt))
  check('Make 3 cards makes three cards', made.length === 3, made.map((one) => one.prompt).join(' | '))

  // --- a card's own history -------------------------------------------------------------------
  const strength = await v('review:strength', peru)
  check('a card’s history replays how long it holds', strength.length >= 2 && strength.every((one) => one.days > 0), JSON.stringify(strength))
  await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  await send('nugget', peru)
  await wait(1500)
  await h.evaluate(() => document.querySelector('[data-strength]')?.scrollIntoView({ block: 'center' }))
  await wait(400)
  check('the gem shows its strength line', await has('[data-strength] polyline'))
  await shot('strength-line')

  // --- days in a row ----------------------------------------------------------------------------
  check('days in a row counts today', (await v('review:days')).run === 1, JSON.stringify(await v('review:days')))

  // --- fit the scheduler to you -----------------------------------------------------------------
  check('fitting waits for a thousand reviews', (await v('review:fit')) === null)
  for (let i = 0; i < 1000; i += 50) await h.evaluate(async ([id, n]) => { for (let k = 0; k < n; k++) await window.api.vigil('review:grade', id, 3, 4000) }, [peru, 50])
  const fit = await v('review:fit')
  check('Fit now fits and keeps it', !!fit && (await v('settings')).fsrsFirst?.length === 4, JSON.stringify(fit))
  await h.evaluate(() => localStorage.setItem('settings:section', 'Review'))
  await go('home')
  await go('settings')
  await wait(1200)
  await h.evaluate(() => document.querySelector('[data-fit]')?.scrollIntoView({ block: 'center' }))
  await wait(500)
  check('Settings says it is fitted', (await text('[data-fit]')).includes('Fitted'), await text('[data-fit]'))
  await shot('fit-setting')
  await v('settings:set', { fsrsFirst: null })

  // --- Learn Vigil: offered, never forced ----------------------------------------------------
  check('no Learn Vigil cards until asked', (await v('learn:count')) === 0)
  await go('powers')
  await wait(1200)
  check('What Vigil can do offers it', await has('[data-learn="offer"]'))
  await go('home')
  await wait(1200)
  check('Getting started offers it', await h.evaluate(() => !!document.querySelector('[aria-label="Getting started"] [data-learn="offer"]')))
  await shot('learn-offer')
  await h.evaluate(() => document.querySelector('[aria-label="Getting started"] [data-learn="offer"]')?.click())
  await wait(1200)
  const added = await v('learn:count')
  check('one click adds the deck', added >= 18 && added <= 30, `${added} cards`)
  check('tagged #learn-vigil', (await v('tags')).some((one) => one.tag === 'learn-vigil' && one.count === added))
  check('a second click adds nothing', (await v('learn:add')) === 0 && (await v('learn:count')) === added)
  check('Getting started then says where they are', await has('[data-learn="have"]'))
  const fresh = await v('review:buckets')
  check('the deck waits as new cards, a few a day', fresh.new >= added, JSON.stringify(fresh))

  // --- What Vigil can do lists each of these ---------------------------------------------------
  await go('powers')
  await wait(1500)
  const powers = await h.evaluate(() => [...document.querySelectorAll('[data-power]')].map((one) => one.getAttribute('data-power')))
  check('each feature is on What Vigil can do', ['linecards', 'slipping', 'practice', 'blurt', 'reviewreminder', 'learnvigil', 'learnmode', 'typed', 'practisetag', 'star', 'howitdecides', 'tagpriority', 'listcards', 'strength', 'fit', 'daysinarow'].every((id) => powers.includes(id)))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
} finally {
  await c.close()
}

// --- the sandbox: the examples are there ------------------------------------------------------
process.env.QA_DATA = mkdtempSync(join(tmpdir(), 'vigil-study-sb-'))
process.env.QA_ARGS = '--sandbox'
c = await sandbox({ width: 1280, height: 860 })
;({ h, v, go, send } = c)
try {
  await c.electron.evaluate(({ Notification }) => { Notification.prototype.show = function () {} })
  check('sandbox: the Learn Vigil deck is seeded', (await v('learn:count')) >= 18)
  const kepler = (await v('items', 'card')).filter((one) => !one.archivedAt)
  check('sandbox: Kepler’s laws are three cards', kepler.length === 3 && kepler.every((one) => /law$/.test(one.prompt)), kepler.map((one) => one.prompt).join(' | '))
  check('sandbox: a card on the Struggling shelf', (await v('review:slipping')).some((one) => one.title === 'Lagrange points'))
  await go('review')
  await h.waitForTimeout(1500)
  await h.screenshot({ path: join(dir, 'sandbox-review.png') })
  check('sandbox: Review offers the practice rounds', await h.evaluate(() => !!document.querySelector('[data-practise]')))
  check('sandbox: no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
} finally {
  await c.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
