// The sidebar follows the open tab of the pane in front: exactly one light, moving at once on a click, ⌃H and ⌃L, a tab
// switch and a drag. A note in a folder shows as one lit row under its folder, wherever it was opened from. Frames to QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-follows-tab.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const shots = `${process.env.QA_SHOTS ?? process.env.QA_DATA}/sidebar-follows`
mkdirSync(shots, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v, go, send } = c
const wait = (ms = 500) => h.waitForTimeout(ms)
const lit = () => h.evaluate(() => [...document.querySelectorAll('aside [data-side-row][aria-current]:not([inert] *)')].map((el) => ({
  current: el.getAttribute('aria-current'),
  kind: el.hasAttribute('data-side-note') ? 'note' : el.hasAttribute('data-side-folder') ? 'folder' : el.hasAttribute('data-side-recent-row') ? 'recent' : el.hasAttribute('data-drag-open') ? 'pin' : el.hasAttribute('data-side-tag') ? 'tag' : 'place',
  text: (el.getAttribute('aria-label') || el.innerText || '').trim().split('\n')[0].slice(0, 50)
})))
const one = async (name, want) => {
  const all = await lit()
  check(`${name}: one light${want ? `, on ${want.kind ?? ''} ${want.text ?? ''}` : ''}`, all.length === 1 && all[0].current === 'page' && (!want?.kind || all[0].kind === want.kind) && (!want?.text || all[0].text.startsWith(want.text)), JSON.stringify(all))
}
const row = (name) => h.locator('[data-side-row][aria-label="' + name + '"]').first()
const clean = async () => {
  await h.keyboard.press('Escape')
  for (let i = 0; i < 40; i++) {
    const now = await h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => el.querySelectorAll('[data-tab]').length))
    if (now.length === 1 && now[0] === 1) break
    await h.keyboard.press('Control+w')
    await wait(100)
  }
  await go('day')
  await wait(300)
}
try {
  await v('settings:set', { hintRate: 0 })
  await c.theme('light')
  await clean()
  const articles = await v('items', 'article')
  const gems = await v('items', 'nugget')
  // Folders, one tree for the whole book (since 18 Nov): where each page and gem lives, by Folders' own record.
  const kept = await h.evaluate(() => window.api.haligtree('folders:of', 'nuggets'))
  const tree = await h.evaluate(() => window.api.haligtree('folders'))
  const inFolder = articles.find((one) => kept[one.id] && tree.some((f) => f.id === kept[one.id] && !f.archived))
  const folder = tree.find((one) => one.id === kept[inFolder.id])
  const loose = articles.find((one) => !kept[one.id])
  const gem = gems.find((one) => kept[one.id])

  // Places
  for (const [id, label] of [['calendar', 'Calendar'], ['today', 'Tasks'], ['review', 'Review'], ['inbox', 'Inbox']]) {
    await go(id); await one(`place ${label}`, { kind: 'place', text: label })
  }
  await go('upcoming'); await one('a task list', { kind: 'place', text: 'Tasks' })
  await go('day'); await one('the Day page', { kind: 'place', text: 'Journal' })
  await go('weekpage'); await one('the Week page', { text: 'Week' })
  await h.screenshot({ path: `${shots}/week.png` })

  // A note in a folder, from a link (send), no folder in the step
  await send('article', inFolder.id); await wait(1200)
  await one('a note in a folder, opened by name', { kind: 'note', text: inFolder.title.slice(0, 10) })
  const noteRow = h.locator(`[data-side-note="${inFolder.id}"]`)
  const under = await h.evaluate(([note, folder]) => {
    const n = document.querySelector(`[data-side-note="${note}"]`).getBoundingClientRect()
    const f = document.querySelector(`[data-side-folder="${folder}"]`).getBoundingClientRect()
    return n.top > f.top && n.left > f.left - 1
  }, [inFolder.id, folder.id])
  check('its row sits under its folder, stepped in', under && (await noteRow.count()) === 1)
  check('its row is in view', await noteRow.evaluate((el) => { const b = el.getBoundingClientRect(); const a = el.closest('aside').getBoundingClientRect(); return b.top >= a.top && b.bottom <= a.bottom }))
  await h.screenshot({ path: `${shots}/note-row-light.png` })
  await c.look('dark'); await wait(300); await h.screenshot({ path: `${shots}/note-row-dark.png` }); await c.look('light'); await wait(200)
  // Folded by hand: the Folders section's heading holds the light.
  await h.locator('[data-side-section-handle="folders"]').click(); await wait(500)
  await one('its section folded by hand: Folders takes the light', { kind: 'place', text: 'Folders' })
  check('it stays folded', (await h.locator('[data-side-section-handle="folders"]').getAttribute('aria-expanded')) === 'false')
  await go('calendar')
  await send('article', inFolder.id); await wait(1200)
  await one('focus coming back to something in it unfolds it', { kind: 'note' })

  // The row leaves when focus does
  await go('calendar')
  check('the note row leaves when focus does', (await h.locator('[data-side-note]').count()) === 0)
  await one('Calendar again', { text: 'Calendar' })

  // A folder page
  await h.locator(`[data-side-folder="${folder.id}"]`).click(); await wait(900)
  await one('a folder page lights the folder', { kind: 'folder', text: folder.name.slice(0, 8) })
  // A note in it from the list
  const listed = h.locator(`[data-pane] [data-row][data-id="${inFolder.id}"]`).first()
  if (await listed.count()) { await listed.click(); await wait(1000); await one('a note opened in its folder', { kind: 'note' }) }

  // A gem in a folder
  if (gem) { await send('nugget', gem.id); await wait(1200); await one('a gem in a folder', { kind: 'note' }) }

  // A note in no folder, opened in Writing: Writing keeps the light, never its row in Recent (the user, 20 Nov).
  await send('article', loose.id); await wait(1200)
  await one('a page in no folder, opened in Writing: Writing', { kind: 'place', text: 'Writing' })
  await h.screenshot({ path: `${shots}/writing-row-light.png` })
  await c.look('dark'); await wait(300); await h.screenshot({ path: `${shots}/writing-row-dark.png` }); await c.look('light'); await wait(200)
  // Opened from its row under Recent: that row.
  await h.locator(`aside [data-side-recent-row="${loose.id}"]`).click(); await wait(1000)
  await one('opened from Recent: its row in Recent', { kind: 'recent', text: loose.title.slice(0, 10) })
  await h.screenshot({ path: `${shots}/recent-row-light.png` })
  // Pinned while open in Writing: still Writing; opened from its pin: the pin.
  await go('calendar')
  await send('article', loose.id); await wait(1200)
  await h.evaluate((id) => window.api.haligtree('pin', 'nuggets', id, true), loose.id).catch(() => {})
  await wait(800)
  await one('pinned, opened in Writing: still Writing', { kind: 'place', text: 'Writing' })
  await h.locator(`aside [data-drag-open="article:${loose.id}"]`).first().click(); await wait(1000)
  await one('opened from Pinned: its row in Pinned', { kind: 'pin', text: loose.title.slice(0, 10) })
  const pinCurrent = await h.evaluate(() => document.querySelector('aside [data-drag-open][aria-current]')?.getAttribute('aria-current'))
  check('a pinned row marks aria-current="page"', pinCurrent === 'page', String(pinCurrent))
  const glide = await h.evaluate(() => { const row = document.querySelector('aside [data-drag-open][aria-current="page"]'); return !!row })
  check('the sliding light finds it', glide)
  await h.evaluate((id) => window.api.haligtree('pin', 'nuggets', id, false), loose.id).catch(() => {})
  await wait(600)

  // A task, a tag, a source, the PDF reader
  const tasks = await v('tasks')
  if (tasks[0]) { await send('task', tasks[0].id); await wait(1000); await one('a task lights Tasks', { kind: 'place', text: 'Tasks' }) }

  // Focus moves between panes and tabs at once
  await clean()
  await go('calendar')
  await row('Tasks').click({ modifiers: ['Alt'] }); await wait(900)
  await one('the new pane in front', { text: 'Tasks' })
  await h.keyboard.press('Control+h'); await wait(120)
  await one('⌃H: the left pane\'s tab', { text: 'Calendar' })
  await h.keyboard.press('Control+l'); await wait(120)
  await one('⌃L: the right pane\'s tab', { text: 'Tasks' })
  await row('Review').click({ modifiers: ['Meta'] }); await wait(700)
  await one('⌘-click: its new tab', { text: 'Review' })
  await h.keyboard.press('Control+Tab'); await wait(150)
  await one('⌃Tab: the tab now open', { text: 'Tasks' })
  const left = await h.locator('[data-pane]').first().locator('[data-tab]').first()
  await left.click(); await wait(150)
  await one('a click on the other pane\'s tab', { text: 'Calendar' })
  const panes = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((el) => el.getAttribute('data-pane')))
  const from = await h.locator(`[data-pane="${panes[1]}"] [data-tab]`).first().boundingBox()
  const to = await h.locator(`[data-tab-row="${panes[0]}"]`).boundingBox()
  await h.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await h.mouse.down()
  for (let i = 1; i <= 8; i++) { await h.mouse.move(from.x + ((to.x + to.width / 2 - from.x) * i) / 8, from.y + from.height / 2); await wait(30) }
  await h.mouse.up(); await wait(200)
  const moved = await h.locator('[data-pane]').first().locator('[data-tab-on]').getAttribute('data-drag-title')
  await one('a tab dragged across', { text: moved })

  // Every way in: plain stays in the tab, ⌘ a new tab, ⌥ to the side; one light after each, on what opened.
  const shape = () => h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => el.querySelectorAll('[data-tab]').length))
  await v('pin', 'captures', (await h.evaluate(() => window.api.captures.list()))[0].id, true).catch(() => {})
  const fromInbox = async () => { await clean(); await go('calendar'); await wait(300) }
  const cell = async (name, way, press, want) => {
    await fromInbox()
    const target = await way()
    if (!target) return check(`${name}: can be reached`, false)
    await press(target)
    await wait(1300)
    const got = await shape()
    const ok = JSON.stringify(got) === JSON.stringify(want)
    const all = await lit()
    check(`${name}: ${JSON.stringify(want)}, one light`, ok && all.length === 1, `${JSON.stringify(got)} ${JSON.stringify(all)}`)
  }
  const plain = (t) => t.click()
  const meta = (t) => t.click({ modifiers: ['Meta'] })
  const alt = (t) => t.click({ modifiers: ['Alt'] })
  const ways = {
    'sidebar place': async () => row('Review'),
    'pin': async () => h.locator('aside [data-drag-open]').first(),
    'folder': async () => h.locator(`[data-side-folder="${folder.id}"]`),
    'recent': async () => { await send('article', loose.id); await wait(800); await go('calendar'); await wait(400); return h.locator('[data-side-recent-row]').first() }
  }
  for (const [name, way] of Object.entries(ways)) {
    await cell(`${name}, plain`, way, plain, [1])
    await cell(`${name}, ⌘`, way, meta, [2])
    await cell(`${name}, ⌥`, way, alt, [1, 1])
  }
  // A tag in the sidebar.
  const tagWay = async () => { const fold = h.locator('[data-tags-fold]'); if ((await fold.getAttribute('aria-expanded').catch(() => null)) === 'false') { await fold.click(); await wait(300) } return h.locator('[data-side-tag]').first() }
  if (await h.locator('[data-tags-fold]').count()) {
    await cell('tag, plain', tagWay, plain, [1])
    await cell('tag, ⌘', tagWay, meta, [2])
  }
  // A link in a note: plain, ⌘, ⌥.
  const reading = articles.find((one) => one.title === "Michelangelo's Sistine ceiling: a reading note")
  const linkWay = async () => { await send('article', reading.id); await wait(1500); return h.locator('[data-pane] .ProseMirror a.tiptap-note-link[data-note]').first() }
  const fromNote = async (name, press, want) => {
    await clean()
    const link = await linkWay()
    await link.evaluate((el) => el.scrollIntoView({ block: 'center' })); await wait(300)
    const r = await link.evaluate((el) => { const b = el.getClientRects()[0]; return { x: b.left + 6, y: b.top + b.height / 2 } })
    await h.mouse.move(r.x, r.y)
    if (press) await h.keyboard.down(press)
    await h.mouse.down(); await h.mouse.up()
    if (press) await h.keyboard.up(press)
    await wait(1400)
    await h.keyboard.press('Escape').catch(() => {})
    const got = await shape()
    check(`link in a note, ${name}: ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got))
  }
  await fromNote('plain', null, [1])
  await fromNote('⌘', 'Meta', [2])
  await fromNote('⌥', 'Alt', [1, 1])
  // ⌘K: ↵, ⌘↵, ⌥↵.
  const search = async (name, key, want) => {
    await fromInbox()
    await h.keyboard.press('Meta+k'); await wait(600)
    await h.keyboard.type(loose.title.slice(0, 14)); await wait(1200)
    await h.keyboard.press(key); await wait(1400)
    const got = await shape()
    check(`⌘K, ${name}: ${JSON.stringify(want)}, one light`, JSON.stringify(got) === JSON.stringify(want) && (await lit()).length === 1, JSON.stringify(got))
  }
  await search('↵', 'Enter', [1])
  await search('⌘↵', 'Meta+Enter', [2])
  await search('⌥↵', 'Alt+Enter', [1, 1])
  // A list row: plain, ⌥; ⌘ picks, as in Finder.
  const rowWay = async () => { await go('articles'); await wait(900); return h.locator('[data-pane] [data-row][data-id]').first() }
  await cell('list row, plain', rowWay, plain, [1])
  await cell('list row, ⌥', rowWay, alt, [1, 1])
  await cell('list row, ⌘ picks it, as in Finder, and opens nothing', rowWay, meta, [1])
  // From outside the window (quick capture, the tray, a notification), the PDF reader, the web reader: in the tab on show.
  for (const [name, go1] of [
    ['sent from another window', () => send('article', inFolder.id)],
    ['the PDF reader', () => h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src: 'haligtree://none.pdf', name: 'A book' } })))],
    ['the web reader', () => h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href: 'https://example.invalid/a' } })))]
  ]) {
    await fromInbox(); await go1(); await wait(900)
    const got = await shape()
    check(`${name}: in the tab on show`, JSON.stringify(got) === '[1]' && (await lit()).length <= 1, JSON.stringify(got) + JSON.stringify(await lit()))
  }

  // Library's heading pressed while on Gems (a page inside it): it folds, as its sound says, and stays folded once you
  // leave; Gems reached another way (sent, as ⌘K and a link do) opens it again to show where you are.
  {
    const head = 'aside [data-side-heading="library"] button[aria-expanded]'
    const open = () => h.evaluate((s) => document.querySelector(s)?.getAttribute('aria-expanded'), head)
    const gemsShows = () => h.evaluate(() => { const row = document.querySelector('aside nav button[aria-label="Gems"]'); const r = row?.getBoundingClientRect(); return !!row && !row.closest('[inert]') && !!r && r.height > 4 })
    if ((await open()) !== 'true') { await h.click(head); await wait(500) }
    await h.click('aside nav button[aria-label="Gems"]'); await wait(900)
    await h.click(head); await wait(700)
    check("on Gems, Library's heading pressed: it folds", (await open()) === 'false' && !(await gemsShows()), `expanded ${await open()}, Gems row shows ${await gemsShows()}`)
    await h.click('aside nav button[aria-label="Inbox"]'); await wait(900)
    check('then the Inbox: Library stays folded', (await open()) === 'false' && !(await gemsShows()), `expanded ${await open()}`)
    await send('view', 'nuggets'); await wait(900)
    check('Gems sent from elsewhere: Library opens to show where you are', (await open()) === 'true' && (await gemsShows()), `expanded ${await open()}, Gems row shows ${await gemsShows()}`)
  }

  // Narrow: the section's icon only
  await send('article', inFolder.id); await wait(1000)
  await c.size(700, 700); await wait(500)
  await one('narrow sidebar: the section\'s icon only', { kind: 'place', text: 'Writing' })
  await h.screenshot({ path: `${shots}/narrow-light.png` })
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()
