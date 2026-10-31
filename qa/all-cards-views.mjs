// All cards, Review's card browser: each grouping, each order (checked against the
// actual order), each view (compact rows, the list, cards that turn over), the
// keys, the filters, the quiet "needs work" mark, the answer without the
// question's repeat, the full row menu, and editing in place (question, answer
// in the app's editor, source). Light and dark screenshots of each view and of
// editing, beside Gems and Notes.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/all-cards-views.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 6000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const ids = () => h.evaluate(() => [...document.querySelectorAll('[data-card-list] [data-pick]')].map((one) => one.dataset.pick.slice(7)))
const setView = (patch) => h.evaluate((patch) => {
  const was = JSON.parse(localStorage.getItem('view:cards') ?? '{"sort":"due","group":"none","filter":{}}')
  localStorage.setItem('view:cards', JSON.stringify({ ...was, ...patch }))
}, patch)
const open = async () => {
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-list] [data-pick]')), 15000)
}
// Home first, and only once the old list has gone: on a busy machine the page it leaves can still be on
// screen, and its rows were read as the new order (a sort or filter one step behind).
const reopen = async (patch) => { await setView(patch); await c.go('home'); await waitFor(() => h.evaluate(() => !document.querySelector('[data-card-list]')), 15000); await open() }
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(500)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
  await again()
}
try {
  // A sandbox with varied cards: a book in page order, a video, a leech, a slow one, a big one, a paused one.
  const made = []
  const card = async (text, prompt, origin = {}) => { const id = await call('nugget:from', text, origin); await call('item:save', id, { prompt, title: prompt }); made.push(id); return id }
  const p12 = await card('Sovereignty rests with Parliament #law-constitution', 'Who is sovereign in the UK?', { medium: 'The Law Book', passage: 'p. 12' })
  const p3 = await card('![](haligtree://assets/abc.png)\n\n[The Law Book, p. 3](haligtree://pdf/x.pdf#page=3)', 'The Venetian Patent Statute (1474)', { medium: 'The Law Book', passage: 'p. 3' })
  const p40 = await card('Equity follows the law #law', 'What does equity follow?', { medium: 'The Law Book', passage: 'p. 40' })
  const dot = await card('Dot product: An operation on two vectors giving a number #maths', 'What does “Dot product” mean?')
  const big = await card('one, two, three, four, five, six, seven #maths', 'Name the seven things')
  const leech = await card('Mitochondria #biology', 'Powerhouse of the cell?')
  const slow = await card('A long derivation #physics', 'Derive the wave equation', { medium: 'Lecture video', passage: '12:40' })
  // Four lapses make a leech; slow reviews make a slow card.
  await call('review:grade', leech, 3, 3000)
  for (let n = 0; n < 4; n++) { await call('review:grade', leech, 1, 3000); await call('review:grade', leech, 3, 3000) }
  for (let n = 0; n < 3; n++) await call('review:grade', slow, 3, 50000)
  await call('cards:pause', [big], true)
  const all = await call('cards:all')
  const by = new Map(all.map((one) => [one.id, one]))
  check('cards:all reads lapses, leeches, sources and pictures', by.get(leech).leech && by.get(leech).lapses >= 4 && by.get(p3).picture && by.get(p3).made === 'pdf' && by.get(slow).seconds >= 40 && by.get(p12).source === 'The Law Book', JSON.stringify(by.get(leech)))

  // Each order, checked against the cards' own numbers.
  await setView({ group: 'none', density: 'list', filter: {} })
  await open()
  const orders = {
    newest: (a, b) => a.createdAt >= b.createdAt,
    first: (a, b) => a.createdAt <= b.createdAt,
    hard: (a, b) => (a.difficulty ?? -1) >= (b.difficulty ?? -1),
    slow: (a, b) => (a.seconds ?? -1) >= (b.seconds ?? -1),
    forgot: (a, b) => a.lapses >= b.lapses,
    az: (a, b) => a.prompt.localeCompare(b.prompt, undefined, { sensitivity: 'base', numeric: true }) <= 0,
    due: (a, b) => (a.paused ? '~' : a.dueAt ?? '9') <= (b.paused ? '~' : b.dueAt ?? '9'),
    page: (a, b) => (a.source || '~') < (b.source || '~') || ((a.source || '~') === (b.source || '~'))
  }
  for (const [sort, fine] of Object.entries(orders)) {
    await reopen({ sort })
    await waitFor(async () => { const now = await ids(); return now.length === all.length && now.every((id, at) => !at || fine(by.get(now[at - 1]), by.get(id))) })
    const now = await ids()
    check(`ordered by ${sort}`, now.length === all.length && now.every((id, at) => !at || fine(by.get(now[at - 1]), by.get(id))), now.map((id) => by.get(id).prompt.slice(0, 12)).join(' | '))
  }
  await reopen({ sort: 'page' })
  const law = (await ids()).filter((id) => [p3, p12, p40].includes(id))
  check('page order puts a book\'s cards p. 3, 12, 40', law.join() === [p3, p12, p40].join(), law.join())

  // Each grouping: the groups it should make, with counts.
  const heads = () => h.evaluate(() => [...document.querySelectorAll('[data-island-head], [data-card-group]')].map((one) => one.getAttribute('data-island-head') ?? one.getAttribute('data-card-group')))
  const want = {
    deck: ['#law'], source: ['The Law Book', 'Lecture video', 'No source'], stage: ['New', 'Learning'], due: ['New', 'Paused'],
    hard: ['Not reviewed yet'], made: [new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })], needs: ['Leeches', 'Too big', 'Slow', 'Fine as they are']
  }
  for (const [group, names] of Object.entries(want)) {
    await reopen({ group, sort: 'due' })
    await waitFor(async () => { const now = await heads(); return names.every((one) => now.includes(one)) })
    const got = await heads()
    check(`grouped by ${group}`, names.every((one) => got.includes(one)), got.join(' | '))
  }
  await reopen({ group: 'source' })
  check('a book\'s group shows which pages have cards', await h.evaluate(() => /Cards on 3 of 40 pages/.test(document.querySelector('[data-coverage]')?.textContent ?? '')), await h.evaluate(() => document.querySelector('[data-coverage]')?.textContent))
  check('a group head carries its 30 days ahead', await h.evaluate(() => document.querySelectorAll('[data-due-ahead]').length > 0))
  await shot('all-cards-source', () => open())
  await reopen({ group: 'needs' })
  check('grouped by needs work, Split is one click', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-fix="split"]'))))
  await shot('all-cards-needs', () => open())

  // Filters.
  for (const [key, value, test] of [['stage', 'new', (x) => !x.reviews], ['needs', 'leech', (x) => x.leech], ['paused', 'paused', (x) => x.paused], ['made', 'pdf', (x) => x.made === 'pdf'], ['source', 'The Law Book', (x) => x.source === 'The Law Book'], ['due', 'New', (x) => !x.paused && !x.dueAt], ['tag', 'maths', (x) => x.tags.some((t) => t === 'maths' || t.startsWith('maths-'))]]) {
    await reopen({ group: 'none', filter: { [key]: [value] } })
    const now = await ids()
    const expect = all.filter(test).map((one) => one.id)
    check(`filter ${key}: ${value}`, now.length === expect.length && now.every((id) => expect.includes(id)), `${now.length} vs ${expect.length}`)
  }

  // The list: quiet marks, no repeated question.
  await reopen({ group: 'none', filter: {}, sort: 'az', density: 'list' })
  const dotText = await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.textContent ?? '', dot)
  check('the answer drops the question\'s repeated term', !/Dot product:/.test(dotText) && /An operation/.test(dotText), dotText)
  check('needs work is a small mark, not words on the row', await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-card-needs]').length >= 2 && ![...document.querySelectorAll('[data-card-list] [data-pick]')].some((one) => /split it\?/.test(one.textContent)))), await h.evaluate(() => document.querySelectorAll('[data-card-needs]').length))
  await shot('all-cards-list', () => open())

  // Compact rows: the columns line up.
  await reopen({ density: 'compact' })
  const lefts = await h.evaluate(() => [...document.querySelectorAll('[data-card-list] [data-pick]')].map((row) => Math.round(row.children[2].getBoundingClientRect().left)))
  check('compact rows: the Due column lines up', lefts.length === all.length && new Set(lefts).size === 1, lefts.join())
  await shot('all-cards-compact', () => open())

  // Cards: a grid of real flashcards.
  await reopen({ density: 'grid' })
  // Drawn where you look: the first run of 24 at once, the rest as you scroll to them.
  const fronts = await h.evaluate(() => document.querySelectorAll('[data-card-grid] [data-card-face="front"]').length)
  check('cards view draws the cards in sight', fronts >= Math.min(all.length, 24) && fronts <= all.length, `${fronts} of ${all.length}`)
  await h.locator('[data-card-browser] input').first().fill('Venetian')
  await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-card-grid] [data-pick]').length === 1))
  check('a snip\'s picture is on its face', await h.evaluate((id) => !!document.querySelector(`[data-pick="nugget:${id}"] [data-card-face="front"] img`), p3))
  check('its source at the foot', await h.evaluate((id) => /The Law Book, p\. 3/.test(document.querySelector(`[data-pick="nugget:${id}"] [data-card-face="front"]`)?.textContent ?? ''), p3))
  await h.locator('[data-card-browser] input').first().fill('')
  await h.mouse.move(5, 5)
  await shot('all-cards-cards', async () => { await open(); await h.mouse.move(5, 5) })
  // Keys: J moves, Space turns one, ⇧Space turns them all.
  await h.evaluate(() => document.querySelector('[data-card-list] [data-pick]')?.focus())
  await h.keyboard.press('j')
  const second = (await ids())[1]
  check('J moves to the next card', await h.evaluate((id) => document.activeElement?.dataset.pick === `nugget:${id}`, second))
  await h.keyboard.press(' ')
  check('Space turns it over', await waitFor(() => h.evaluate((id) => !!document.querySelector(`[data-pick="nugget:${id}"][data-turned]`), second)))
  await h.keyboard.press('ArrowRight')
  await h.keyboard.press('k')
  check('K moves back', await h.evaluate((id) => document.activeElement?.dataset.pick === `nugget:${id}`, second))
  await h.keyboard.press('Shift+ ')
  check('⇧Space turns every card over', await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-card-list] [data-pick]').length > 0 && document.querySelectorAll('[data-card-list] [data-turned]').length === document.querySelectorAll('[data-card-list] [data-pick]').length)))
  await h.waitForTimeout(500)
  await shot('all-cards-turned', async () => { await open(); await h.mouse.move(5, 5); await h.evaluate(() => document.querySelector('[data-turn-all]')?.click()) })

  // Right-click: the full menu.
  await reopen({ density: 'list' })
  await h.locator(`[data-pick="nugget:${leech}"]`).click({ button: 'right' })
  await h.waitForTimeout(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent ?? '').join(' | '))
  check('the row menu has every way', ['Edit', 'Open', 'Ask another way', 'Split in two', 'Pause', 'Reset progress', 'Move to deck…', 'Copy', 'Move to the Bin'].every((word) => lines.includes(word)), lines)
  await h.keyboard.press('Escape')

  // Edit in place: E opens the card, question and answer both, no form box.
  await shot('all-cards-edit-before', () => open())
  await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.focus(), dot)
  await h.keyboard.press('e')
  check('E opens the card to edit in place', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-editing] [data-card-edit-answer] .ProseMirror'))), await h.evaluate(() => JSON.stringify({ active: `${document.activeElement?.tagName} ${document.activeElement?.getAttribute('data-pick') ?? document.activeElement?.className?.slice?.(0, 40)}`, editing: !!document.querySelector('[data-card-editing]'), dialogs: [...document.querySelectorAll('[role="dialog"], [role="menu"]')].map((one) => `${one.getAttribute('role')} ${one.getAttribute('data-state')} ${one.className.slice(0, 30)}`), body: document.body.style.pointerEvents })))
  await shot('all-cards-edit-after', async () => { await open(); await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.focus(), dot); await h.keyboard.press('e'); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-editing] .ProseMirror'))) })
  await h.locator('[data-card-edit]').fill('What is the dot product?')
  await h.locator('[data-card-edit-source]').fill('Linear Algebra Done Right')
  await h.locator('[data-card-edit]').press('Enter')
  check('Enter keeps the question and source', await waitFor(async () => { const one = (await call('cards:all')).find((x) => x.id === dot); return one?.prompt === 'What is the dot product?' && one?.source === 'Linear Algebra Done Right' }))
  await h.waitForTimeout(600)
  await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.focus(), dot)
  await h.keyboard.press('e')
  check('E opens it again', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-editing] .ProseMirror'))), await h.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.dataset?.pick}`))
  await h.locator('[data-card-editing] .ProseMirror').focus()
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('A number from two vectors')
  await h.keyboard.press('Enter')
  check('the answer is edited in the app\'s editor and kept with Enter', await waitFor(async () => /A number from two vectors/.test((await call('cards:all')).find((x) => x.id === dot)?.answer ?? '')), JSON.stringify([(await call('cards:all')).find((x) => x.id === dot)?.answer, await h.evaluate(() => [!!document.querySelector('[data-card-editing]'), document.activeElement?.className?.slice?.(0, 50), document.querySelector('[data-card-editing] .ProseMirror')?.textContent])]))
  await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.focus(), dot)
  await h.keyboard.press('e')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-edit]')))
  await h.locator('[data-card-edit]').fill('Dropped')
  await h.keyboard.press('Escape')
  check('Esc drops the edit', await waitFor(async () => (await call('cards:all')).find((x) => x.id === dot)?.prompt === 'What is the dot product?' && !(await h.evaluate(() => !!document.querySelector('[data-card-editing]')))))

  // Enter opens; ⌘A picks; ⌫ bins.
  await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.focus(), p40)
  await h.keyboard.press('Backspace')
  check('⌫ sends the card with the focus to the Bin', await waitFor(async () => !(await call('cards:all')).some((x) => x.id === p40)))
  await h.evaluate(() => document.querySelector('[data-card-list] [data-pick]')?.focus())
  await h.keyboard.press('Meta+a')
  check('⌘A picks every card', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-picked]'))))
  await h.keyboard.press('Escape')
  await h.evaluate((id) => document.querySelector(`[data-pick="nugget:${id}"]`)?.focus(), p12)
  await h.keyboard.press('Enter')
  check('Enter opens the gem', await waitFor(() => h.evaluate(() => !document.querySelector('[data-card-browser]') || !!document.querySelector('[data-page="nugget"], [data-item-open]'))))
  if (shots) {
    for (const [page, name] of [['nuggets', 'gems'], ['inbox', 'notes']]) {
      for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) { await c.theme(theme); await c.go(page); await h.waitForTimeout(500); await h.screenshot({ path: join(shots, `sibling-${name}-${said}.png`) }) }
    }
    await c.theme('paper')
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
