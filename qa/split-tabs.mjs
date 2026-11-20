// Splits with tabs, Obsidian's model (brief-split-tabs.md): every journey driven to its result. Each pane has its own
// row of tabs; a split stays until you end it; ⌘-click a new tab, ⌥-click the pane to the right; a tab reorders, moves
// to another pane's row, or makes a new pane at an edge; the last tab of a pane takes the pane; launch reopens it all;
// words typed then a tab left at once are kept. Frames to QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-tabs.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
// Chromium's stand-in microphone, for the voice note left running in a hidden tab.
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
const shots = `${process.env.QA_SHOTS ?? process.env.QA_DATA}/split-tabs`
mkdirSync(shots, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go } = c
const wait = (ms = 500) => h.waitForTimeout(ms)
const shot = (name) => h.screenshot({ path: `${shots}/${name}.png` })
const state = () => h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => ({
  key: el.getAttribute('data-pane'),
  front: el.hasAttribute('data-pane-front') || document.querySelectorAll('[data-split-area] [data-pane]').length === 1,
  page: el.querySelector('[data-page]')?.getAttribute('data-page') ?? null,
  pages: el.querySelectorAll('[data-page]').length,
  tabs: [...el.querySelectorAll('[data-tab]')].map((one) => one.getAttribute('data-drag-title')),
  on: el.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') ?? null
})))
const row = (name) => h.locator('[data-side-row][aria-label="' + name + '"]').first()
const sideRow = (name) => h.locator(`aside [data-side-row]`, { hasText: name }).first()
const tab = (pane, title) => h.locator(`[data-pane="${pane}"] [data-tab][data-drag-title="${title}"]`).first()
const box = (loc) => loc.boundingBox()
const closeFront = () => h.evaluate(() => { if (window.dispatchEvent(new Event('haligtree:close-front', { cancelable: true }))) window.__closedWindow = true })
const cues = () => h.evaluate(() => { const all = window.haligtreeCued.slice(); window.haligtreeCued.length = 0; return all })
const drag = async (from, to, steps = 12, each) => {
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await h.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await each?.(i)
    await wait(40)
  }
}
const mid = async (loc) => { const b = await box(loc); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
// Back to one tab on the Day page, by the keys a person would use: a reload per journey took the renderer down under load.
const clean = async () => {
  await h.keyboard.press('Escape')
  for (let i = 0; i < 80; i++) {
    const now = await state()
    if (now.length === 1 && now[0].tabs.length === 1) break
    await h.keyboard.press('Control+w')
    await wait(100)
  }
  await go('day')
  await h.evaluate(() => void (window.haligtreeCued.length = 0))
  await wait(300)
}
const seedAndLoad = async (value) => { await h.evaluate((one) => localStorage.setItem('split', JSON.stringify(one)), value); await h.reload(); await wait(1800) }

try {
  await v('settings:set', { hintRate: 0 })
  await c.theme('light')
  await clean()
  const articles = await v('items', 'article')
  const [a, b] = articles.filter((one) => one.title && one.title.length > 6)

  // --- one pane, one tab
  let s = await state()
  check('one pane, one tab: its row is there', s.length === 1 && s[0].tabs.length === 1 && (await h.locator('[data-tabs]').count()) === 1, JSON.stringify(s))
  check('the old name line and "Side by side" are gone', (await h.locator('[data-pane-head]').count()) === 0 && (await h.locator('[data-side-heading="split"], [data-pair-row="live"], [data-pair-row="kept"]').count()) === 0)
  await shot('one-pane-one-tab-light')

  // --- ⌘T and +: nothing jumps
  const before = { card: await box(h.locator('[data-pane-card]').first()), plus: await box(h.locator('[data-tab-add]').first()), back: await box(h.getByRole('button', { name: 'Back' }).first()) }
  await h.locator('[data-tab-add]').first().click(); await wait()
  s = await state()
  check('+ opens a new tab, on the Day page, open', s[0].tabs.length === 2 && s[0].page === 'day', JSON.stringify(s))
  const after = { card: await box(h.locator('[data-pane-card]').first()), plus: await box(h.locator('[data-tab-add]').first()), back: await box(h.getByRole('button', { name: 'Back' }).first()) }
  check('a second tab moves nothing: page, +, Back to the pixel', ['card', 'plus', 'back'].every((one) => Math.abs(before[one].x - after[one].x) < 1 && Math.abs(before[one].y - after[one].y) < 1), JSON.stringify({ before, after }))
  await h.keyboard.press('Control+w'); await wait()
  check('⌃W closes it', (await state())[0].tabs.length === 1)

  // --- a split stays until you end it
  await go('inbox')
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(800)
  s = await state()
  check('⌘\\ splits: two panes, each with its own row, the new one in front', s.length === 2 && s[1].front && (await h.locator('[data-tabs]').count()) === 2, JSON.stringify(s))
  await row('Calendar').click(); await wait(900)
  s = await state()
  check('a sidebar click stays in the split, in the front pane', s.length === 2 && s[1].page === 'calendar' && s[0].page === 'inbox', JSON.stringify(s))
  await h.keyboard.press('Meta+['); await wait(700)
  check('its Back returns from it', (await state())[1].page === 'inbox')
  await h.keyboard.press('Meta+]'); await wait(700)

  // --- ⌘ and ⌥ on a sidebar place
  await cues()
  await row('Review').click({ modifiers: ['Meta'] }); await wait(800)
  s = await state()
  check('⌘-click a place: a new tab in the front pane, open', s[1].tabs.length === 2 && s[1].page === 'review' && s[0].tabs.length === 1, JSON.stringify(s))
  const heard = await cues()
  check('one sound for it', heard.length === 1, heard.join())
  await row('Review').click({ modifiers: ['Meta'] }); await wait(500)
  check('⌘-click what is open: never twice', (await state())[1].tabs.length === 2)
  await row('Calendar').click(); await wait(700)
  s = await state()
  check('a plain click on what another tab shows goes to that tab, never twice', s[1].tabs.length === 2 && s[1].on === 'Calendar', JSON.stringify(s))
  await h.locator(`[data-pane="${s[0].key}"] [data-tab]`).first().click(); await wait(400)
  check('a tab of the other pane takes the keys', (await state())[0].front)
  await row('Tasks').click({ modifiers: ['Alt'] }); await wait(900)
  s = await state()
  check('⌥-click: a new tab in the pane to the right, in front', s.length === 2 && s[1].tabs.length === 3 && s[1].front, JSON.stringify(s))
  await h.keyboard.press('Control+l'); await wait(300)
  await row('Goals').click({ modifiers: ['Alt'] }).catch(() => {}); await wait(900)
  s = await state()
  check('⌥-click with no pane to the right: a new pane', s.length === 3 || s[1].tabs.length === 4, JSON.stringify(s.map((one) => one.tabs)))
  await shot('two-panes-with-tabs-light')
  await c.look('dark'); await wait(300); await shot('two-panes-with-tabs-dark'); await c.look('light'); await wait(300)

  // --- Back and Forward: one pair over each pane, on that pane's open tab, never moving
  await clean()
  await go('goals')
  const arrowsAt = (at) => h.locator('[data-tab-arrows]').nth(at).boundingBox()
  const arrowsOne = await arrowsAt(0)
  await h.keyboard.press('Escape')
  // The window's top is one row since ask 49 (21a30e264): the tabs are the title bar, so there is no header above them.
  check('no title bar above the tabs: the tab row is the window\'s top', await h.evaluate(() => !document.querySelector('header[data-drag-strip]')))
  // Sources sits in Library, folded to start (70f7229cb, 8 Nov): its heading opened first, as a person would.
  for (const fold of await h.locator('[data-side-section-handle="library"][aria-expanded="false"]').all()) (await fold.click(), await wait(400))
  await row('Sources').click(); await wait(800)
  await row('Goals').click({ modifiers: ['Alt'] }); await wait(900)
  await row('Tasks').click(); await wait(800)
  const arrowsTwo = await arrowsAt(0)
  check('the arrows do not shift between one pane and two', Math.abs(arrowsOne.x - arrowsTwo.x) < 1 && Math.abs(arrowsOne.y - arrowsTwo.y) < 1, JSON.stringify([arrowsOne, arrowsTwo]))
  check('the sidebar hidden, they stay clear of the traffic lights', await (async () => {
    await h.keyboard.press('Meta+b'); await wait(500)
    const hidden = await arrowsAt(0)
    await h.screenshot({ path: `${shots}/arrows-sidebar-hidden-light.png` })
    await h.keyboard.press('Meta+b'); await wait(500)
    // The window's top is one row since 21a30e264: the arrows sit in it, clear of the traffic lights to their left.
    return hidden.y >= 40 || hidden.x >= 80
  })())
  const pagesNow = async () => (await state()).map((one) => one.page)
  const pagesWas = await pagesNow()
  check('the split has what to go back to', pagesWas[0] === 'sources' && pagesWas[1] === 'today', JSON.stringify(pagesWas))
  const backOf = (at) => h.locator('[data-pane]').nth(at).getByRole('button', { name: 'Back', exact: true })
  await backOf(1).click(); await wait(800)
  let nowPages = await pagesNow()
  check('the right pane\'s ← changes only that pane', nowPages[0] === 'sources' && nowPages[1] === 'goals', JSON.stringify(nowPages))
  check('with nothing behind it, its ← is disabled, and looks it', await backOf(1).isDisabled() && (await backOf(1).evaluate((el) => Number(getComputedStyle(el).opacity))) < 0.6)
  await backOf(0).click(); await wait(800)
  nowPages = await pagesNow()
  check('the left pane\'s ← changes only that pane, and it takes the keys', nowPages[0] === 'goals' && nowPages[1] === 'goals' && (await state())[0].front, JSON.stringify(nowPages))
  await h.keyboard.press('Meta+]'); await wait(800)
  nowPages = await pagesNow()
  check('⌘] follows focus: the left pane', nowPages[0] === 'sources' && nowPages[1] === 'goals', JSON.stringify(nowPages))
  await h.keyboard.press('Control+l'); await wait(300)
  await h.keyboard.press('Meta+]'); await wait(800)
  nowPages = await pagesNow()
  check('⌘] after ⌃L: the right pane', nowPages[0] === 'sources' && nowPages[1] === 'today', JSON.stringify(nowPages))
  await h.keyboard.press('Meta+['); await wait(800)
  check('⌘[ follows focus too', (await pagesNow())[1] === 'goals')
  await h.mouse.move(5, 400); await wait(200)
  await shot('arrows-beside-goals-sources-light')
  await c.look('dark'); await wait(300); await shot('arrows-beside-goals-sources-dark'); await c.look('light'); await wait(300)

  // --- only the tab on show is drawn
  check('only the tab on show is drawn', (await state()).every((one) => one.pages === 1))

  // --- keys
  await clean()
  await go('calendar')
  await row('Goals').click({ modifiers: ['Meta'] }).catch(() => {}); await wait(600)
  await row('Tasks').click({ modifiers: ['Meta'] }); await wait(600)
  s = await state()
  const count = s[0].tabs.length
  const was = s[0].on
  await h.keyboard.press('Control+Tab'); await wait(400)
  const next = (await state())[0].on
  check('⌃Tab: the next tab, round to the first', next === s[0].tabs[(s[0].tabs.indexOf(was) + 1) % count], `${was} to ${next}`)
  await h.keyboard.press('Control+Shift+Tab'); await wait(400)
  check('⌃⇧Tab: the one before', (await state())[0].on === was)

  // --- right-click menu
  const front = (await state())[0].key
  await tab(front, 'Calendar').click({ button: 'right' })
  await h.locator('[role="menu"] [role="menuitem"]').first().waitFor({ timeout: 8000 }); await wait(300)
  const lines = await h.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  check('a place\'s menu: Close, Close others, Close to the right, Move to a new split', ['Close', 'Close others', 'Close to the right', 'Move to a new split'].every((one) => lines.some((line) => line.startsWith(one))), lines.join(' | '))
  // A tab's own "Pin tab" (small at the left of its row, ea1a09176) belongs here; Favorites and a link do not, a place having neither.
  check('a place has no Favorites or link lines', !lines.some((line) => /favou?rites|copy link/i.test(line)), lines.join(' | '))
  await h.screenshot({ path: `${shots}/tab-menu-place.png` })
  await h.getByRole('menuitem', { name: /^Move to a new split/ }).click(); await wait(800)
  s = await state()
  check('Move to a new split: a pane of its own, its old row one fewer', s.length === 2 && s[1].on === 'Calendar' && s[0].tabs.length === count - 1, JSON.stringify(s))

  // --- moving by drag
  const [left, right] = s
  await row('Sources').click({ modifiers: ['Meta'] }).catch(() => {}); await wait(600)
  s = await state()
  const frames = []
  const fromTab = await mid(tab(right.key, s[1].tabs[0]))
  const toRow = await mid(h.locator(`[data-tab-row="${left.key}"]`))
  await drag(fromTab, toRow, 8, async (i) => { const p = `${shots}/drag-${String(i).padStart(2, '0')}.png`; frames.push(p); await h.screenshot({ path: p }) })
  check('carried over another row, a gap opens there', (await h.locator(`[data-tab-row="${left.key}"] [data-tab-gap]`).count()) === 1)
  await h.keyboard.press('Escape'); await wait(200); await h.mouse.up(); await wait(400)
  const held = await state()
  check('Esc cancels: nothing moved', held[0].tabs.length === s[0].tabs.length && held[1].tabs.length === s[1].tabs.length && (await h.locator('[data-tab-gap]').count()) === 0, JSON.stringify(held.map((one) => one.tabs)))
  const moving = s[1].tabs[0]
  await drag(await mid(tab(right.key, moving)), await mid(h.locator(`[data-tab-row="${left.key}"]`)), 8)
  await h.mouse.up(); await wait(600)
  s = await state()
  check('dropped on another row: it moves there, open', s[0].tabs.includes(moving) && !s[1]?.tabs.includes(moving) && s[0].on === moving, JSON.stringify(s.map((one) => one.tabs)))
  // reorder along the row
  const order = s[0].tabs
  const firstTab = await mid(tab(s[0].key, order[0]))
  const lastTab = await box(tab(s[0].key, order[order.length - 1]))
  await drag(firstTab, { x: lastTab.x + lastTab.width - 4, y: firstTab.y }, 8)
  await h.mouse.up(); await wait(500)
  let now = await state()
  check('dragged along its row: it lands at the far end', now[0].tabs[now[0].tabs.length - 1] === order[0] && now[0].tabs.length === order.length, now[0].tabs.join())
  // Last tab of a pane moved: the pane closes, with Undo.
  for (const name of now[1]?.tabs.slice(1) ?? []) { await tab(now[1].key, name).click(); await wait(200); await h.keyboard.press('Control+w'); await wait(300) }
  now = await state()
  const lastOne = now[1].tabs[0]
  await drag(await mid(tab(now[1].key, lastOne)), await mid(h.locator(`[data-tab-row="${now[0].key}"]`)), 8)
  await h.mouse.up(); await wait(600)
  s = await state()
  check('a pane\'s only tab moved: the pane closes, its neighbour takes the room', s.length === 1 && s[0].tabs.includes(lastOne), JSON.stringify(s.map((one) => one.tabs)))
  const toastNow = () => h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
  check('said with Undo', /Undo/.test(await toastNow()), await toastNow())
  await h.locator('[role=status][aria-live] button', { hasText: /undo/i }).first().click(); await wait(600)
  check('Undo brings the pane back', (await state()).length === 2)
  // To an edge: a new pane.
  now = await state()
  const area = await box(h.locator('[data-split-area]'))
  const lone = now[0].tabs.find((one) => one !== now[0].on) ?? now[0].tabs[0]
  await drag(await mid(tab(now[0].key, lone)), { x: area.x + area.width - 40, y: area.y + area.height / 2 }, 10)
  check('off the rows, at the window\'s right edge, the right half is outlined "Open on the right"', (await h.locator('[data-split-half="right"]').count()) === 1 && /Open on the right/.test(await h.locator('[data-split-half]').innerText()))
  await shot('tab-over-edge-light')
  await h.mouse.up(); await wait(700)
  s = await state()
  check('dropped at the right edge: a new pane there, with that tab', s.length === now.length + 1 && s[s.length - 1].tabs[0] === lone, JSON.stringify(s.map((one) => one.tabs)))

  // --- closes
  await clean()
  await go('calendar')
  await row('Tasks').click({ modifiers: ['Meta'] }); await wait(500)
  s = await state()
  await tab(s[0].key, 'Tasks').hover(); await wait(100)
  await h.locator(`[data-tab][data-tab-on] [data-tab-close]`).first().click(); await wait(500)
  check('✕ closes the tab', (await state())[0].tabs.length === 1 && (await state())[0].on === 'Calendar')
  await h.keyboard.press('Meta+Shift+t'); await wait(600)
  s = await state()
  check('⇧⌘T brings it back where it was, open', s[0].tabs.length === 2 && s[0].on === 'Tasks' && s[0].tabs[1] === 'Tasks', s[0].tabs.join())
  const t = await mid(tab(s[0].key, 'Tasks'))
  await h.mouse.click(t.x, t.y, { button: 'middle' }); await wait(500)
  check('a middle click closes it', (await state())[0].tabs.length === 1)
  await closeFront(); await wait(1500)
  s = await state()
  check('⌘W on the last tab: it goes to the landing page, never blank', s.length === 1 && s[0].tabs.length === 1 && s[0].page === 'day', JSON.stringify(s))
  await closeFront(); await wait(300)
  check('⌘W with only that left: the window, as always', await h.evaluate(() => !!window.__closedWindow))

  // --- a note in two panes, words kept
  await clean()
  await c.send('article', a.id); await wait(1500)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(1200)
  s = await state()
  check('the same note may be open in two panes', s.length === 2 && s[0].on === s[1].on && s[0].on !== null && (await h.locator('[data-pane] .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)').count()) === 2, JSON.stringify(s))
  const words = `typed-${Date.now()}`
  const ed = h.locator(`[data-pane="${s[1].key}"] .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)`).first()
  await ed.click(); await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.type(` ${words}`); await wait(1500)
  check('typed in one, the other follows', ((await h.locator(`[data-pane="${s[0].key}"] .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)`).first().innerText()).includes(words)))
  await h.keyboard.press('Control+h'); await wait(300)
  await h.keyboard.press('Control+w'); await wait(800)
  check('a note kept open in the other', (await state()).length === 1)

  const typed = async (leave, tag) => {
    await clean()
    await c.send('article', b.id); await wait(1500)
    await row('Calendar').click({ modifiers: ['Meta'] }); await wait(500)
    await h.keyboard.press('Control+Tab'); await wait(900)
    const editor = h.locator('[data-pane] .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)').first()
    // The page in front may still be arriving: keys go to the note only once its editor holds them.
    await editor.click(); await editor.evaluate((one) => one.focus()); await h.keyboard.press('Meta+ArrowDown')
    const mark = `${tag}-${Date.now()}`
    await h.keyboard.type(` ${mark}`)
    // What shows over or in the page as the key goes, and where the keys are: said beside a failure, so it names what held the key.
    const showing = await h.evaluate(() => [...document.querySelectorAll('[cmdk-root], [role=menu], [role=listbox], [role=dialog], [role=alertdialog], .tiptap-suggestion-popup, [data-radix-popper-content-wrapper]')]
      .filter((one) => one.checkVisibility() && one.getBoundingClientRect().width > 0)
      .map((one) => `${one.tagName.toLowerCase()}[role=${one.getAttribute('role')}]${one.className && typeof one.className === 'string' ? '.' + one.className.split(' ').slice(0, 3).join('.') : ''} "${(one.textContent ?? '').trim().slice(0, 40)}"`)
      .concat(`keys in: ${document.activeElement?.tagName.toLowerCase()}.${String(document.activeElement?.className ?? '').split(' ').slice(0, 2).join('.')}`))
    const tabsBefore = (await state()).map((one) => one.tabs.length).join()
    await leave()
    await wait(1000)
    const body = await v('item', b.id).catch(() => null)
    typedSaw = `${tag}: tabs ${tabsBefore} then ${(await state()).map((one) => one.tabs.length).join()}; showing ${JSON.stringify(showing)}`
    return JSON.stringify(body ?? await v('items', 'article')).includes(mark)
  }
  let typedSaw = ''
  check('words typed, a tab switched at once: kept', await typed(() => h.keyboard.press('Control+Tab'), 'switch'))
  check('words typed, the tab closed at once (⌃W): kept', await typed(() => h.keyboard.press('Control+w'), 'close'), typedSaw)
  check('words typed, ⌘W at once: kept', await typed(() => closeFront(), 'cmdw'))
  check('words typed, its pane gone at once: kept', await typed(async () => {
    await h.keyboard.press('Meta+Backslash'); await h.keyboard.press('Control+w'); await h.keyboard.press('Control+w')
  }, 'pane'))

  // --- a voice note left running: its bar stays up and says so; kept, it is never lost
  await clean()
  const spoken = await v('article:new')
  await v('item:save', spoken, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }] } })
  await c.send('article', spoken); await wait(1500)
  await row('Calendar').click({ modifiers: ['Meta'] }); await wait(500)
  await h.keyboard.press('Control+Tab'); await wait(900)
  await h.locator('[data-pane] .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)').first().click()
  await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.press('Enter')
  await h.keyboard.type('/record', { delay: 60 }); await wait(2000)
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
  check('a voice note starts in the note', (await h.locator('[data-voice-recorder]').count()) === 1)
  await wait(1200)
  await h.locator('[data-pane] [data-tab]:not([data-tab-on]) [role="tab"]').first().click(); await wait(900)
  check('its tab left: the recorder stays up, still running', (await h.locator('[data-voice-recorder]').count()) === 1)
  await shot('voice-note-hidden-tab-light')
  const capturesBefore = (await h.evaluate(() => window.api.captures.list())).length
  await h.locator('[data-voice-recorder] button[aria-label="Stop and keep"]').click(); await wait(2500)
  const capturesAfter = (await h.evaluate(() => window.api.captures.list())).length
  const said = await h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent))
  check('stopped with its note gone: kept as a new capture, and said', capturesAfter === capturesBefore + 1 && /new capture/.test(said.join()), `${capturesBefore} to ${capturesAfter} ${said.join(' | ').slice(0, 120)}`)

  // --- Back, Forward and scroll per tab
  await clean()
  await go('sources')
  await wait(1500)
  const scrollBox = () => h.evaluate(() => {
    const all = [...document.querySelectorAll('[data-pane-card] *')].filter((el) => el.scrollHeight > el.clientHeight + 100 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))
    const el = all[0]
    if (el) el.scrollTop = 400
    return el ? el.scrollTop : -1
  })
  const read = () => h.evaluate(() => {
    const all = [...document.querySelectorAll('[data-pane-card] *')].filter((el) => el.scrollHeight > el.clientHeight + 100 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))
    return all[0]?.scrollTop ?? -1
  })
  const set = await scrollBox(); await wait(300)
  await row('Calendar').click({ modifiers: ['Meta'] }); await wait(700)
  await h.keyboard.press('Control+Tab'); await wait(1200)
  const got = await read()
  check('a tab keeps its scroll', set > 100 && Math.abs(got - set) < 8, `${set} then ${got}`)
  s = await state()
  await row('Tasks').click(); await wait(700)
  await h.keyboard.press('Control+Tab'); await wait(400)
  await row('Goals').click().catch(() => {}); await wait(500)
  await h.keyboard.press('Control+Tab'); await wait(500)
  await h.keyboard.press('Meta+['); await wait(800)
  s = await state()
  check('each tab has its own Back', s[0].on === 'Sources', JSON.stringify(s))

  // --- launch
  await clean()
  await go('calendar')
  await row('Tasks').click({ modifiers: ['Meta'] }); await wait(500)
  await row('Review').click({ modifiers: ['Alt'] }); await wait(800)
  await row('Goals').click({ modifiers: ['Meta'] }).catch(() => {}); await wait(500)
  const open = await state()
  await h.reload(); await wait(1800)
  const reopened = await state()
  check('launch reopens every pane, tab and open tab', JSON.stringify(open.map((one) => [one.tabs, one.on])) === JSON.stringify(reopened.map((one) => [one.tabs, one.on])), JSON.stringify(reopened.map((one) => [one.tabs, one.on])))
  await h.evaluate(() => {
    localStorage.setItem('split', JSON.stringify({ panes: [{ key: 'old1', trail: { views: [{ id: 'calendar' }], at: 0 } }, { key: 'old2', trail: { views: [{ id: 'inbox' }, { id: 'goals' }], at: 1 } }], front: 'old2', sizes: [0.5, 0.5] }))
    localStorage.setItem('split-kept', '[{"id":"x"}]')
  })
  await h.reload(); await wait(1800)
  s = await state()
  check('old split values load as one tab each', s.length === 2 && s[0].tabs.length === 1 && s[1].tabs.length === 1 && s[1].page === 'goals', JSON.stringify(s))
  check('old kept splits are dropped', await h.evaluate(() => localStorage.getItem('split-kept') === null))
  await h.evaluate(() => { localStorage.removeItem('split'); localStorage.setItem('pane-one', JSON.stringify({ panes: [{ key: 'one', trail: { views: [{ id: 'calendar' }], at: 0 } }], front: 'one', sizes: [1] })) })
  await h.reload(); await wait(1800)
  s = await state()
  check('an old one-pane value loads as one tab', s.length === 1 && s[0].page === 'calendar', JSON.stringify(s))

  // --- a pinned split: the deliberate way to keep an arrangement, each pane reopening as one tab
  await clean()
  await go('calendar')
  await row('Tasks').click({ modifiers: ['Alt'] }); await wait(800)
  await row('Review').click({ modifiers: ['Meta'] }); await wait(600)
  await h.locator('[data-tab-on]').first().click({ button: 'right' })
  await h.locator('[role="menu"] [role="menuitem"]').first().waitFor({ timeout: 8000 }); await wait(300)
  const pinLines = await h.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  check('a tab\'s menu while split can pin the split', pinLines.some((line) => line.startsWith('Add this split to Favorites')), pinLines.join(' | '))
  await h.getByRole('menuitem', { name: /^Add this split to Favorites/ }).click(); await wait(600)
  check('it is one row in Favorites', (await h.locator('[data-pair-row="pinned"]').count()) === 1)
  await h.locator('[data-tab-on]').last().locator('[data-tab-close]').click(); await wait(300)
  await h.locator('[data-tab-on]').last().locator('[data-tab-close]').click(); await wait(600)
  check('its tabs closed, the split has ended', (await state()).length === 1)
  await h.locator('[data-pair-row="pinned"] [data-pair-pane="0"]').click(); await wait(1000)
  s = await state()
  check('its row lays it out again, each pane one tab', s.length === 2 && s.every((one) => one.tabs.length === 1) && s[0].page === 'calendar', JSON.stringify(s))
  await h.locator('[data-pair-row="pinned"]').click({ button: 'right', position: { x: 10, y: 10 } }); await wait(300)
  await h.getByRole('menuitem', { name: /^Remove this split from Favorites/ }).click(); await wait(500)
  check('unpinned, its row goes, the split stays', (await h.locator('[data-pair-row="pinned"]').count()) === 0 && (await state()).length === 2)

  // --- a list row dropped on a row of tabs
  await clean()
  await go('articles'); await wait(800)
  await h.evaluate(() => document.activeElement?.blur?.())
  await row('Calendar').click({ modifiers: ['Alt'] }); await wait(800)
  s = await state()
  const listed = h.locator(`[data-pane="${s[0].key}"] [data-row][data-id]`).first()
  if (await listed.count()) {
    const aim = await mid(h.locator(`[data-tab-row="${s[1].key}"]`))
    await drag(await mid(listed), aim, 12)
    await shot('row-over-tab-row-light')
    // What the window has at the drop point just before letting go: said beside a failure, so the cause is read, not guessed.
    const atDrop = await h.evaluate(({ x, y, pane }) => {
      const r = (one) => one && (({ left, top, right, bottom }) => [left, top, right, bottom].map(Math.round))(one.getBoundingClientRect())
      return {
        aim: [Math.round(x), Math.round(y)],
        row: r(document.querySelector(`[data-tab-row="${pane}"]`)),
        bar: r(document.querySelector(`[data-tabs="${pane}"]`)),
        hit: document.elementsFromPoint(x, y).slice(0, 6).map((one) => `${one.tagName.toLowerCase()}${[...one.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'role').map((a) => `[${a.name}]`).join('')}`),
        gap: document.querySelector('[data-tab-gap]')?.getAttribute('data-tab-gap') ?? null,
        carrying: document.documentElement.hasAttribute('data-split-drag'),
        card: r(document.querySelector('[data-split-card]'))
      }
    }, { ...aim, pane: s[1].key })
    await h.mouse.up(); await wait(900)
    const landed = await state()
    check('a list row dropped on a row of tabs: a new tab there, open', landed[1].tabs.length === 2 && landed[1].page === 'articles', JSON.stringify({ landed, atDrop }))
  } else check('a list row to drag', false)

  // --- at scale
  await clean()
  await v('settings:set', { hintRate: 0 })
  const long = 'يوميات طويلة جدا عن الكتب التي قرأتها هذا العام 📚 and a very long title that keeps going'
  const arabic = await v('article:new')
  await v('item:save', arabic, { title: long })
  for (const n of [1, 3, 8, 20, 50]) {
    const tabs = Array.from({ length: n }, (_, at) => ({ key: `t${at}`, trail: { views: [at === 0 ? { id: 'articles', focus: arabic } : { id: at % 2 ? 'calendar' : 'goals', tab: String(at) }], at: 0 } }))
    await seedAndLoad({ panes: [{ key: 'p', tabs, active: tabs[Math.floor(tabs.length / 2)].key }], front: 'p', sizes: [1] })
    const m = await h.evaluate(() => {
      const row = document.querySelector('[data-tab-row]')
      const all = [...row.querySelectorAll('[data-tab]')].map((one) => one.getBoundingClientRect())
      const on = row.querySelector('[data-tab-on]').getBoundingClientRect()
      const rect = row.getBoundingClientRect()
      const least = [...row.querySelectorAll('[data-tab]')].map((one) => parseFloat(one.style.minWidth) || 40)
      return { least, scrolls: row.scrollWidth > row.clientWidth + 1, widths: all.map((one) => Math.round(one.width)), onIn: on.left >= rect.left - 1 && on.right <= rect.right + 1, sideways: document.documentElement.scrollWidth > innerWidth, plus: !!document.querySelector('[data-tab-add]') && document.querySelector('[data-tab-add]').getBoundingClientRect().right <= innerWidth }
    })
    // Since c9c9d025c (10 Nov) a tab is never narrower than its name, up to about ten letters (54px + 7 a letter, at most
    // 124): with room they share it evenly, past that each keeps its name's width and the row scrolls. Goals (89) and
    // Calendar (110) side by side are then rightly unequal; what counts is that none is cut below its name's room.
    const least = Math.min(...m.widths), most = Math.max(...m.widths.filter((_, at) => at !== Math.floor(n / 2)), least)
    const fits = m.widths.every((width, at) => width + 1 >= m.least[at])
    check(`${n} tabs: they share evenly down to each name's room, the open one in view, + still there, no sideways scroll`, m.onIn && !m.sideways && m.plus && (m.scrolls ? fits : most - least <= 14) && least >= 44, JSON.stringify({ least, most, onIn: m.onIn, scrolls: m.scrolls, fits }))
    await shot(`tabs-${n}-light`)
    await c.look('dark'); await wait(200); await shot(`tabs-${n}-dark`); await c.look('light'); await wait(100)
  }
  await h.locator('[data-tab-all]').click(); await wait(300)
  check('the chevron lists every tab', (await h.locator('[role="menu"] [role="menuitem"]').count()) === 50, String(await h.locator('[role="menu"] [role="menuitem"]').count()))
  await shot('tabs-50-menu-light')
  await h.keyboard.press('Escape')

  // --- too narrow for two
  await clean()
  await go('calendar')
  await row('Tasks').click({ modifiers: ['Alt'] }); await wait(800)
  await c.size(620, 700); await wait(500)
  const shown = await h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].filter((el) => el.offsetWidth > 0).length)
  const everyTab = await h.locator('[data-pane]:visible [data-tab]').count()
  check('too narrow for two: one on show, its row carrying every pane\'s tabs', shown === 1 && everyTab === 2, `${shown} shown, ${everyTab} tabs`)
  await shot('narrow-window-light')
  s = await h.evaluate(() => [...document.querySelectorAll('[data-pane]:not(.hidden)')].map((el) => el.getAttribute('data-pane')))
  const pageShown = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]:not(.hidden)')].map((el) => el.querySelector('[data-page]')?.getAttribute('data-page')))
  const was2 = await pageShown()
  const notFront = await h.evaluate(() => { const rows = [...document.querySelectorAll('[data-pane]:not(.hidden) [data-tab-row]')]; return rows.findIndex((row) => row.dataset.tabRow !== row.closest('[data-pane]').getAttribute('data-pane')) })
  await h.locator('[data-pane]:not(.hidden) [data-tab-row]').nth(notFront).locator('[role="tab"]').first().click(); await wait(600)
  const now2 = await pageShown()
  check('choosing the other pane\'s tab brings that pane forward', now2.length === 1 && now2[0] !== was2[0], `${was2} to ${now2}`)
  await c.size(390, 844); await wait(500)
  await shot('phone-width-light')
  const phone = await h.evaluate(() => ({ sideways: document.documentElement.scrollWidth > innerWidth, plus: document.querySelector('[data-pane]:not(.hidden) [data-tab-add]').getBoundingClientRect().right <= innerWidth }))
  check('at phone width nothing is cut off', !phone.sideways && phone.plus, JSON.stringify(phone))
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()
