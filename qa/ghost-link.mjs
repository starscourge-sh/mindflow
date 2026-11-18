// A note opened is the note shown, and a link to a note only in the Obsidian vault brings it in (the user, 13 Nov: "i
// clicked on a note that (was grayed out) does not exist in haligtree but exists in my obsidian vault, it then open this
// screen yet the tab claims im on the note"). Their link, "QUOTE - Reed - Nothing Truly Painful Yet Nothing Truly
// Satisfying", held their gem's own id with no "nugget:" in front (as 484 of the 920 links with an id in their book do):
// it was drawn grey, as a link to nothing, and opened the Inbox ("Show dealt with too" on, in Graph view) on an Inbox
// note that is not there, while the tab named the gem. With the Inbox in Graph view:
//  0. such a link is drawn solid and opens its gem, the page showing it under its tab; a step left on the Inbox with
//     the gem's id never names the gem on its tab;
//  1. a link to nothing clicked in a page opens its new note, and the Inbox shows that note under its tab, its
//     "Show dealt with too" left as it was; 2. a capture opened from ⌘K shows too; 3. Back returns to the graph.
// With a stand-in vault (made beside the data folder: a note of the link's name with a picture), Obsidian's list of
// vaults pointed at it (never the real one):
//  4. the click brings the note in, its words and its picture, and the notice says so; 5. Undo takes it back, back on
//     the page the link is in, the link greyed again;
//  6. a link to a name in neither the book nor the vault: the empty note, its first line saying it is new, and once
//     left empty it goes, from Recent in the sidebar too; 7. two notes of the name: asked at the link, by path;
//  8. a link naming its folder: that one, unasked; 10. ⌘-click: brought in, in a new tab; 11. right-click, Enter on
//     "Open": brought in; 12. a link in the reader: brought in; 13. ⌥-click: brought in, to the side; 14. a link on a
//     board's card: brought in; 9. the vault moved away: the new note says it could not be read there. And no notice
//     of words changed elsewhere anywhere on the way (one writer points a waiting link: the book).
//   QA_DATA=<empty folder> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/ghost-link.mjs
//   SHOTS=<folder> saves frames of each click, and the pages in light and dark.
import { mkdirSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
// The stand-in vault and Obsidian's list naming it, beside the data folder.
const vault = `${process.env.QA_DATA}.vault`
rmSync(vault, { recursive: true, force: true })
mkdirSync(join(vault, '.obsidian'), { recursive: true })
mkdirSync(join(vault, 'Notes'), { recursive: true })
mkdirSync(join(vault, 'attachments'), { recursive: true })
writeFileSync(join(vault, 'attachments', 'vault-picture.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(join(vault, 'Notes', 'Vault page.md'), '---\ntags:\n  - kept\n---\n# Vault page\n\nWords kept in Obsidian, never brought in before.\n\n![[vault-picture.png]]\n')
// Two notes of one name, in two folders.
mkdirSync(join(vault, 'Archive'), { recursive: true })
writeFileSync(join(vault, 'Notes', 'Twice page.md'), 'The first of two.\n')
writeFileSync(join(vault, 'Notes', 'Menu page.md'), 'Opened from its menu.\n')
writeFileSync(join(vault, 'Notes', 'Reader page.md'), 'Followed from the reader.\n')
writeFileSync(join(vault, 'Notes', 'Side page.md'), 'Opened to the side.\n')
mkdirSync(join(vault, 'Boards'), { recursive: true })
writeFileSync(join(vault, 'Boards', 'Card page.md'), 'Followed from a board card.\n')
writeFileSync(join(vault, 'Archive', 'Twice page.md'), 'The second of two.\n')
writeFileSync(`${vault}.json`, JSON.stringify({ vaults: { a: { path: vault, ts: 1, open: true } } }))
process.env.HALIGTREE_OBSIDIAN_CONFIG = `${vault}.json`

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, v, send, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (...content) => ({ type: 'paragraph', content })
const t = (text) => ({ type: 'text', text })
const ghost = (label) => ({ type: 'noteLink', attrs: { id: '', label } })
const NOTE = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
// What the page shows: the graph, the open note's words, and the front tab's name.
const shown = () => h.evaluate((sel) => {
  const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 40 && getComputedStyle(el).visibility !== 'hidden' }
  const notes = [...document.querySelectorAll(sel)].filter(seen)
  return {
    graph: seen(document.querySelector('[data-inbox-graph]')),
    note: notes.map((one) => one.textContent.replace(/\s+/g, ' ').trim().slice(0, 120)).join(' | '),
    tab: document.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') ?? null,
    page: document.querySelector('[data-page]')?.getAttribute('data-page') ?? null,
    said: document.querySelector('[data-made-by-link]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    // Where any note pane is, drawn or not, for a failure to say why.
    panes: [...document.querySelectorAll('.note-pane')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ${getComputedStyle(one).visibility}` }).join(' ; '),
    picture: notes.some((one) => [...one.querySelectorAll('img')].some((img) => img.src.startsWith('haligtree://assets/'))),
    dealt: document.querySelector('[data-sorted-too] [role=switch]')?.getAttribute('aria-checked') ?? null
  }
}, NOTE)
const until = async (test, ms = 6000) => {
  const end = Date.now() + ms
  let last = await shown()
  while (Date.now() < end && !test(last)) { await wait(150); last = await shown() }
  return last
}
const film = async (name, n = 12) => { if (shots) for (let i = 0; i < n; i++) { await h.screenshot({ path: `${shots}/${name}-f${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const graphOn = async () => {
  await send('view', 'inbox'); await wait(900)
  if (!(await h.$('[data-inbox-graph]'))) await h.click('[data-kind-chips] button:has-text("Graph")')
  await h.waitForSelector('[data-inbox-graph]', { timeout: 8000 })
}
const link = (label) => h.locator(`.note-pane a.tiptap-note-link:has-text("${label}")`).first()
const toast = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).join(' | '))
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0, autoArchive: 0, inboxDays: 3650 })
  for (const words of ['A thought to keep #work', 'Call the bank about the card', 'An idea for the garden #work'])
    await h.evaluate((text) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), words)
  // The user's gem, and the page the links are in: a page in Writing, as their "Vocabulary Reference" is.
  const QUOTE = '“You can be stuck in a life where nothing is truly painful yet nothing is truly satisfying either.”'
  const gem = await v('nugget:from', QUOTE, {})
  const page = await v('article:new')
  await v('item:save', page, { title: 'Reading list', body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [t('Reading list')] },
    p(t('A quote: '), { type: 'noteLink', attrs: { id: gem, label: 'QUOTE - Reed - Nothing Truly Painful Yet Nothing Truly Satisfying' } }, t('.')),
    p(t('From the vault: '), ghost('Vault page'), t(' and nowhere: '), ghost('Nowhere page'), t('.')),
    p(t('Two of a name: '), ghost('Twice page'), t(', one by its path: '), ghost('Archive/Twice page'), t(', and the vault gone: '), ghost('Gone page'), t('.')),
    p(t('By its menu: '), ghost('Menu page'), t(', from the reader: '), ghost('Reader page'), t(', to the side: '), ghost('Side page'), t('.'))
  ] } })
  // A page kept as a board, a card on it linking to a note only in the vault (qa/board-links.mjs makes its board so).
  const board = await v('article:new')
  await v('item:save', board, { title: 'Card board', body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('To read')] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(t('Read '), ghost('Card page'), t(' next'))] }] }
  ] } })
  await v('notes:fields:set', 'nuggets', board, 'kanban-plugin', 'board')
  await h.reload(); await wait(1500)
  await h.evaluate(() => { window.__clashes = []; window.addEventListener('haligtree:toast', (event) => /changed elsewhere/.test(event.detail?.text ?? '') && window.__clashes.push(event.detail.text)) })
  await graphOn()

  // 0. The user's case: a link holding the gem's own id, no kind in front.
  let s
  await send('article', page); await wait(1200)
  const quote = link('QUOTE - Reed')
  await quote.waitFor({ timeout: 8000 })
  await wait(600)
  const solid = !(await quote.evaluate((one) => one.classList.contains('is-unresolved')))
  check('0. a link holding a gem\'s own id is drawn solid: its note is in the book', solid)
  await quote.click()
  await film('gem-click')
  s = await until((one) => /stuck in a life/.test(one.note))
  check('0. clicked, the page shows the gem, under its tab', /stuck in a life/.test(s.note) && /stuck in a life/.test(s.tab ?? '') && s.page !== 'inbox', JSON.stringify(s))
  if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(400); await h.screenshot({ path: `${shots}/gem-${name}.png` }) }
  await look('light')
  // The step such a link left in the user's tab: the Inbox, on the gem's id. Its tab names only what the page shows.
  await send('capture', gem); await wait(1500)
  s = await shown()
  check('0. a step to the Inbox on a gem\'s id: the tab never names the gem the page does not show', s.page === 'inbox' && !/stuck in a li/.test(s.tab ?? ''), JSON.stringify(s))
  await graphOn()

  // 1. A greyed link clicked in a page, the Inbox in Graph view.
  await send('article', page); await wait(1200)
  await link('Nowhere page').waitFor({ timeout: 8000 })
  const greyed = await link('Nowhere page').evaluate((one) => one.classList.contains('is-unresolved'))
  check('the link is greyed: no note of that name', greyed)
  await link('Nowhere page').click()
  await film('ghost-click')
  s = await until((one) => /Nowhere page/.test(one.note))
  check('1. clicked in Graph view, the Inbox shows the new note, not the graph', /Nowhere page/.test(s.note) && !/Reading list/.test(s.note), JSON.stringify(s))
  check('1. and "Show dealt with too" is left off, as it was', s.dealt === 'false', `switch ${s.dealt}`)
  check('1. its tab names the note the page shows', s.tab === 'Nowhere page' && /Nowhere page/.test(s.note), `tab ${JSON.stringify(s.tab)}, page ${JSON.stringify(s.note.slice(0, 40))}`)
  check('6. nothing named this anywhere: its first line says it is new', s.said === 'A new note: nothing named this in your book or your vault yet.', JSON.stringify(s.said))
  if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(400); await h.screenshot({ path: `${shots}/ghost-${name}.png` }) }
  await look('light')
  // Left with nothing but its name, the new note is not kept: gone from Recent in the sidebar too, also when the page
  // gone back to is one Recent holds in its place (the page with the link).
  const recentRows = () => h.evaluate(() => [...document.querySelectorAll('[data-side-recent-row]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  const listedBefore = await recentRows()
  await send('article', page)
  const end = Date.now() + 8000
  let recent = await recentRows()
  while (Date.now() < end && recent.includes('Nowhere page')) { await wait(150); recent = await recentRows() }
  check('1. left empty, the new note goes, from Recent in the sidebar too', listedBefore.includes('Nowhere page') && !recent.includes('Nowhere page') && recent.includes('Reading list'), `before ${JSON.stringify(listedBefore)}, after ${JSON.stringify(recent)}`)
  // As it goes, its link on the page open now is let go in the book and in the page alike: the same change, no clash.
  await wait(1500)
  const clash = await toast()
  check('1. and the page with its link says nothing of words changed elsewhere', !/changed elsewhere/.test(clash), JSON.stringify(clash))

  // 3. Back: the graph again, no note open. Started from the graph with nothing open: the Inbox is left and come back
  // to, so Back has a step of its own to return to (sent to the Inbox it was already on, the new note stayed open).
  await send('view', 'home'); await wait(700)
  await graphOn()
  s = await shown()
  const backTo = s.graph && !s.note
  // 2. ⌘K, typed and Enter: a capture opened by its name in Graph view shows.
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('Call the bank', { delay: 15 }); await wait(700)
  await h.keyboard.press('Enter')
  s = await until((one) => /Call the bank/.test(one.note))
  check('2. ⌘K in Graph view: the capture opened shows, under its tab', /Call the bank/.test(s.note) && /Call the bank/.test(s.tab ?? ''), JSON.stringify(s))
  await h.keyboard.press('Meta+BracketLeft')
  s = await until((one) => one.graph && !one.note)
  check('3. Back returns to the graph, no note open', backTo && s.graph && !s.note, JSON.stringify(s))
  await film('back')

  // 4. A link to a note only in the vault: brought in, with its words and its picture, and said.
  await send('article', page); await wait(1200)
  await link('Vault page').waitFor({ timeout: 8000 })
  await link('Vault page').click()
  await film('vault-click')
  s = await until((one) => /Words kept in Obsidian/.test(one.note), 9000)
  const notice = await toast()
  check('4. brought in from the vault: its words', /Words kept in Obsidian/.test(s.note), JSON.stringify(s))
  check('4. and nothing said of words changed elsewhere', !/changed elsewhere/.test(notice), JSON.stringify(notice))
  check('4. and its picture', s.picture, JSON.stringify(s))
  check('4. the notice says so, with Undo', /Brought in from your Obsidian vault/.test(notice) && /Undo/.test(notice), JSON.stringify(notice))
  const brought = await h.evaluate(async () => (await window.api.haligtree('items', 'article')).filter((one) => one.title === 'Vault page').length)
  check('4. one note of that name now in the book', brought === 1, `${brought}`)
  // 5. Undo, pressed while the notice is up (it goes after a few seconds): back on the page the link is in, the note
  // gone, the link greyed again. The brought note's own pictures are qa/ghost-link-book.mjs's, on the user's book.
  await h.locator('[role=status] button', { hasText: 'Undo' }).first().click({ timeout: 4000 })
  s = await until((one) => /Reading list/.test(one.note), 6000)
  await wait(900)
  const after = await h.evaluate(async () => (await window.api.haligtree('items', 'article')).filter((one) => one.title === 'Vault page').length)
  const regreyed = await link('Vault page').evaluate((one) => one.classList.contains('is-unresolved')).catch(() => false)
  check('5. Undo: back on the page with the link, the note gone, the link greyed again', /Reading list/.test(s.note) && after === 0 && regreyed, `${JSON.stringify(s.note.slice(0, 40))}, ${after} left, greyed ${regreyed}`)
  const folders = await v('groups', 'article')
  check('5. and the folder bringing it in made ("Notes") is gone with it', !folders.some((one) => one.name === 'Notes'), JSON.stringify(folders.map((one) => `${one.name} ${one.members?.length ?? 0}`)))

  // 7. Two notes of the link's name: asked at the link, by path, in the app's own menu; the one chosen comes in.
  await link('Twice page').click()
  const rows = h.locator('[role=menuitem]')
  await rows.first().waitFor({ timeout: 8000 }).catch(() => {})
  const offered = await rows.allTextContents()
  if (shots) { for (const name of ['light', 'dark']) { await look(name); await h.screenshot({ path: `${shots}/twice-menu-${name}.png` }) } await look('light') }
  check('7. two of that name: the menu offers both, by path, and an empty note instead', offered.some((one) => /Notes\/Twice page\.md/.test(one)) && offered.some((one) => /Archive\/Twice page\.md/.test(one)) && offered.some((one) => /new empty note/.test(one)), JSON.stringify(offered))
  await rows.filter({ hasText: 'Notes/Twice page.md' }).first().click().catch(() => {})
  s = await until((one) => /first of two/.test(one.note), 9000)
  check('7. the one chosen is brought in', /first of two/.test(s.note), JSON.stringify(s.note.slice(0, 80)))
  // 8. A link with a folder in its name: that one, unasked.
  await send('article', page); await wait(1200)
  await link('Archive/Twice page').click()
  s = await until((one) => /second of two/.test(one.note), 9000)
  check('8. a link naming its folder brings that one in, unasked', /second of two/.test(s.note), JSON.stringify(s.note.slice(0, 80)))
  await send('article', page); await wait(1200)
  await link('Archive/Twice page').waitFor({ timeout: 8000 })
  const folderLive = !(await link('Archive/Twice page').evaluate((one) => one.classList.contains('is-unresolved')))
  check('8. and back on the page that link is live: drawn as a link to its note', folderLive, folderLive ? 'solid' : 'still grey')
  // 10. ⌘-click: brought in and opened in a new tab, as ⌘-click opens a note already here.
  await send('article', page); await wait(1200)
  const tabs = () => h.evaluate(() => document.querySelectorAll('[data-tab]').length)
  const tabsBefore = await tabs()
  await link('Vault page').click({ modifiers: ['Meta'] })
  s = await until((one) => /Words kept in Obsidian/.test(one.note), 9000)
  const tabsAfter = await tabs()
  check('10. ⌘-click: brought in, in a new tab of its own', /Words kept in Obsidian/.test(s.note) && s.tab === 'Vault page' && tabsAfter === tabsBefore + 1, `${tabsBefore} tabs, then ${tabsAfter}; ${JSON.stringify(s).slice(0, 200)}`)
  if (shots) { for (const name of ['light', 'dark']) { await look(name); await wait(400); await h.screenshot({ path: `${shots}/brought-${name}.png` }) } await look('light') }
  // 11. Right-click, then Enter: its menu's first line is "Open", which brings it in as the click does.
  await send('article', page); await wait(1200)
  await link('Menu page').click({ button: 'right' })
  await h.locator('button[data-clicked]').first().waitFor({ timeout: 6000 })
  const lines = await h.locator('button[data-clicked]').evaluateAll((all) => all.map((one) => one.getAttribute('data-clicked')))
  if (shots) await h.screenshot({ path: `${shots}/ghost-menu.png` })
  await h.keyboard.press('Enter')
  s = await until((one) => /Opened from its menu/.test(one.note), 9000)
  check('11. right-click a link to a note only in the vault: "Open" first, a new tab and the side after it', lines[0] === 'open' && lines.includes('tab') && lines.includes('aside'), JSON.stringify(lines))
  check('11. and Enter on it brings the note in', /Opened from its menu/.test(s.note) && s.tab === 'Menu page', JSON.stringify(s).slice(0, 200))
  // 12. A link in the reader ("Read through" from the page): the same click brings the note in.
  await send('article', page); await wait(1200)
  // The page in front's own button (the tab behind has one too, out of sight).
  await h.locator('button[aria-label="Read through"]:visible').first().click()
  const inReader = h.locator('.mf-read a.tiptap-note-link:has-text("Reader page")').first()
  await inReader.waitFor({ timeout: 8000 })
  await inReader.click()
  const endRead = Date.now() + 9000
  let read = []
  while (Date.now() < endRead && !read.length) { await wait(200); read = (await v('items', 'article')).filter((one) => one.title === 'Reader page') }
  const readNotice = await toast()
  check('12. a link in the reader brings the note in, said with Undo', read.length === 1 && /Brought in from your Obsidian vault/.test(readNotice), `${read.length} in the book; ${JSON.stringify(readNotice)}`)
  await h.keyboard.press('Escape'); await wait(500)
  // 13. ⌥-click: brought in and opened to the side, as ⌥-click opens a note already here.
  await send('article', page); await wait(1200)
  const panes = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].filter((one) => one.getClientRects().length).length)
  const panesBefore = await panes()
  await link('Side page').click({ modifiers: ['Alt'] })
  s = await until((one) => /Opened to the side/.test(one.note), 9000)
  const panesAfter = await panes()
  check('13. ⌥-click: brought in, in a pane to the side', /Opened to the side/.test(s.note) && panesAfter === panesBefore + 1, `${panesBefore} panes, then ${panesAfter}; ${JSON.stringify(s.note.slice(0, 120))}`)
  if (shots) await h.screenshot({ path: `${shots}/side.png` })
  await h.keyboard.press('Meta+w'); await wait(600)
  // 14. A link on a board's card: the card's click brings it in, as in the note.
  await send('article', board); await wait(1800)
  const onCard = h.locator('[data-board] a.tiptap-note-link:has-text("Card page")').first()
  await onCard.waitFor({ timeout: 8000 })
  await onCard.click()
  s = await until((one) => /Followed from a board card/.test(one.note), 9000)
  check('14. a link on a board card brings the note in and opens it', /Followed from a board card/.test(s.note) && s.tab === 'Card page', JSON.stringify(s).slice(0, 200))
  // 9. The vault gone (moved or renamed): where the import kept it and where Obsidian lists it, both empty. The new note says so.
  renameSync(vault, `${vault}.gone`)
  await send('article', page); await wait(1200)
  await link('Gone page').click()
  s = await until((one) => /Gone page/.test(one.note), 9000)
  check('9. the vault gone: the new note says it could not be read there', /A new note: your Obsidian vault could not be read at .*moved or renamed/.test(s.said ?? ''), JSON.stringify(s.said))
  const clashes = await h.evaluate(() => window.__clashes ?? [])
  check('nothing on the way said words changed elsewhere', !clashes.length, JSON.stringify(clashes))
  check('no errors on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  if (shots) await h.screenshot({ path: `${shots}/error.png` }).catch(() => {})
  check('the run finished', false, error.message.split('\n').slice(0, 12).join(' / '))
}
await c.close()
for (const made of [vault, `${vault}.gone`]) rmSync(made, { recursive: true, force: true })
rmSync(`${vault}.json`, { force: true })
done()
