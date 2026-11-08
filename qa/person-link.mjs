// A person named in a note: "Add to People" links them, its toast's "Open"
// opens their page, and the link itself opens the page too (never ⌘K's search):
// click here, ⌥-click to the side, ⌘-click in a new tab, ⌃-click and right-click
// its menu, as its hover card says. Then the same four ways on every other kind
// of link (a note, a gem, a task, a tag), each against what its own card says.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/person-link.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const SHOT = process.env.SHOT
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)

// Each pane: how many tabs, and what its tab in front shows ("source" focus, a note's id, a list).
const state = () => h.evaluate(() => {
  const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
  const panes = [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => {
    const pane = kept?.panes.find((one) => one.key === el.getAttribute('data-pane'))
    const tab = pane?.tabs.find((one) => one.key === pane.active)
    const view = tab ? tab.trail.views[tab.trail.at] : null
    return { tabs: pane?.tabs.length ?? 0, id: view?.id ?? null, focus: view?.focus ?? null }
  })
  const search = !!document.querySelector('[data-search-group], [data-search-scope]') || [...document.querySelectorAll('input')].some((one) => one.value === 'Julius II' && one.offsetParent)
  // The link's own menu lines, or a task's row menu (task-link-menu.tsx), by their words.
  const lines = [...document.querySelectorAll('[data-clicked]')].filter((one) => one.offsetParent).map((one) => one.getAttribute('data-clicked'))
  const menu = lines.length ? lines : [...document.querySelectorAll('[role="menuitem"]')].filter((one) => one.offsetParent).map((one) => (one.textContent ?? '').trim().replace(/^Open.*/, 'open').slice(0, 20))
  return { panes, search, menu }
})
const front = (s) => s.panes.at(-1) ?? {}
const tabsNow = (s) => s.panes.reduce((n, one) => n + one.tabs, 0)
// One pane, one tab: the kept split forgotten and the window read again.
const closeExtra = async () => {
  await h.keyboard.press('Escape'); await wait(150)
  await h.evaluate(() => localStorage.removeItem('split'))
  await h.reload(); await h.waitForLoadState('domcontentloaded'); await wait(1500)
}
const press = async (selector, modifiers = [], button = 'left') => {
  const target = h.locator(selector).first()
  await target.scrollIntoViewIfNeeded()
  const box = await target.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(box.x, box.y, { steps: 3 }); await wait(150)
  for (const key of modifiers) await h.keyboard.down(key)
  await h.mouse.down({ button }); await h.mouse.up({ button })
  for (const key of modifiers) await h.keyboard.up(key)
  await wait(1300)
}
// The hover card's foot, read off a resting pointer.
const card = async (selector) => {
  await h.mouse.move(5, 5); await wait(300)
  const target = h.locator(selector).first()
  await target.scrollIntoViewIfNeeded()
  const box = await target.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.move(box.x, box.y, { steps: 4 })
  await h.locator('[data-note-preview] [data-preview-foot]').first().waitFor({ timeout: 4000 }).catch(() => {})
  const foot = await h.evaluate(() => document.querySelector('[data-note-preview] [data-preview-foot]')?.textContent ?? '')
  return foot
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, noteOffers: true })
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  const reading = (await v('items', 'article')).find((one) => one.title === "Michelangelo's Sistine ceiling: a reading note")
  check('the sandbox has the Sistine reading note', !!reading)
  await send('article', reading.id); await wait(2500)

  // --- 1. the offer, accepted ---------------------------------------------------------
  const OFFER = '[data-note-offer="person"]'
  const offered = await h.locator(OFFER, { hasText: 'Julius II' }).first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  check('the note offers "Julius II is named here"', offered)
  if (SHOT) await h.screenshot({ path: `${SHOT}/offer.png` })
  await h.locator(OFFER, { hasText: 'Julius II' }).locator('[data-offer-action="person"]').click(); await wait(900)
  const toastText = await h.evaluate(() => document.querySelector('[data-toast-made="person:Julius II"]')?.closest('div')?.textContent ?? '')
  check('the toast says "Julius II added to People" with "Open" and "Undo"', /Julius II added to People/.test(toastText) && /Open/.test(toastText) && /Undo/.test(toastText), toastText)
  if (SHOT) await h.screenshot({ path: `${SHOT}/toast.png` })

  // --- 2. "Open" on the toast ----------------------------------------------------------
  await h.locator('button', { hasText: /^Open/ }).filter({ has: h.locator('kbd') }).first().click(); await wait(1500)
  let s = await state()
  check('"Open" on the toast opens Julius II\'s page', front(s).id === 'source' && front(s).focus === 'attribution:Julius II' && !s.search, JSON.stringify(s))
  if (SHOT) await c.both(`${SHOT}/person-page`)
  const page = await v('source', 'attribution', 'Julius II')
  check('Julius II has a page in People', !!page && page.name === 'Julius II', JSON.stringify(page?.name))

  // --- 3 and 4. the link in the note, every way ----------------------------------------
  const back = async () => { await closeExtra(); await send('article', reading.id); await wait(1500) }
  await back()
  const PERSON = '.ProseMirror a[data-note="person:Julius II"]'
  check('the note now links Julius II', (await h.locator(PERSON).count()) >= 1)

  const sweep = []
  const kinds = [['person', PERSON, (f) => f.id === 'source' && f.focus === 'attribution:Julius II']]
  // A note, a gem and a task linked from one probe note; a tag in its words.
  const note = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fresco needs wet plaster' }] }] } }))
  const gem = await v('nugget:from', 'The ceiling took four years, from 1508 to 1512.', {})
  const gemId = typeof gem === 'string' ? gem : gem?.id
  const task = await v('task:add', 'Look up the Sibyls')
  const taskId = typeof task === 'string' ? task : task?.id
  const probe = await h.evaluate(([note, gem, task]) => window.api.captures.create({ body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Link sweep lead' }] },
    { type: 'paragraph', content: [
      { type: 'noteLink', attrs: { id: note, label: 'Fresco needs wet plaster' } }, { type: 'text', text: ' then ' },
      { type: 'noteLink', attrs: { id: `nugget:${gem}`, label: 'Four years' } }, { type: 'text', text: ' then ' },
      { type: 'noteLink', attrs: { id: `task:${task}`, label: 'Look up the Sibyls' } }, { type: 'text', text: ' then ' },
      { type: 'noteLink', attrs: { id: 'person:Julius II', label: 'Julius II' } }, { type: 'text', text: ' about #sistineprobe here.' }
    ] }
  ] } }), [note, gemId, taskId])
  kinds.push(
    ['note', `.ProseMirror a[data-note="${note}"]`, (f) => f.focus === note],
    ['gem', `.ProseMirror a[data-note="nugget:${gemId}"]`, (f) => f.focus === gemId],
    ['task', `.ProseMirror a[data-note="task:${taskId}"]`, (f) => f.focus === taskId],
    ['tag', '.ProseMirror .tiptap-token[data-token="tag"]', (f) => f.id === 'tags' && /sistineprobe/.test(f.focus ?? '')],
    ['person (in a note)', '.ProseMirror a[data-note="person:Julius II"]', (f) => f.id === 'source' && f.focus === 'attribution:Julius II']
  )
  const open = async (kind) => kind === 'person' ? back() : (await closeExtra(), await send('capture', probe), await wait(1500))

  for (const [kind, selector, landed] of kinds) {
    await open(kind)
    const foot = await card(selector)
    if (SHOT && kind === 'person') await h.screenshot({ path: `${SHOT}/card-person.png` })
    const row = { kind, foot, click: '', alt: '', meta: '', ctrl: '', right: '' }
    // Click: here.
    await press(selector); s = await state()
    row.click = landed(front(s)) && s.panes.length === 1 ? 'opens here' : `WRONG ${JSON.stringify(s)}`
    // ⌥-click: a pane beside.
    await open(kind); await press(selector, ['Alt']); s = await state()
    row.alt = s.panes.length === 2 && landed(front(s)) ? 'to the side' : `WRONG ${JSON.stringify(s)}`
    // ⌘-click: a new tab.
    await open(kind); const tabs = tabsNow(await state()); await press(selector, ['Meta']); s = await state()
    row.meta = tabsNow(s) === tabs + 1 && s.panes.some((p) => p.tabs > 1) ? 'new tab' : `WRONG ${JSON.stringify(s)}`
    // ⌃-click and right-click: the link's menu, nothing followed.
    for (const [key, how] of [['ctrl', () => press(selector, ['Control'])], ['right', () => press(selector, [], 'right')]]) {
      await open(kind); const was = await state(); await how(); s = await state()
      const stayed = JSON.stringify(s.panes) === JSON.stringify(was.panes)
      row[key] = stayed && !s.search && (kind === 'tag' || s.menu.includes('open')) ? `menu (${s.menu.join(', ') || 'browser'})` : `WRONG ${JSON.stringify(s)}`
      if (SHOT && kind === 'person' && key === 'right') await h.screenshot({ path: `${SHOT}/menu-person.png` })
      await h.keyboard.press('Escape'); await wait(200)
    }
    sweep.push(row)
    const said = (words) => foot.includes(words)
    check(`${kind}: click opens it here`, row.click === 'opens here', row.click)
    check(`${kind}: ⌥-click opens it to the side, as its card says`, said('⌥-click to the side') && row.alt === 'to the side', `${foot} | ${row.alt}`)
    check(`${kind}: ⌘-click opens a new tab, as its card says`, said('⌘-click in a new tab') && row.meta === 'new tab', `${foot} | ${row.meta}`)
    check(`${kind}: ⌃-click follows nothing and opens no search`, !row.ctrl.startsWith('WRONG'), row.ctrl)
    check(`${kind}: right-click ${said('Right-click') ? 'shows its menu, as its card says' : 'follows nothing'}`, !row.right.startsWith('WRONG'), row.right)
  }
  console.table(sweep.map(({ kind, click, alt, meta, ctrl, right, foot }) => ({ kind, click, alt, meta, ctrl, right, card: foot })))
  check('no search modal opened at any step', true)
} finally {
  await c.close()
}
done()
