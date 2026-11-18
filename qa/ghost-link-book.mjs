// The user's own case (13 Nov), on a copy of their book, the Inbox in Graph view as theirs was:
//  A. their click: in “Vocabulary Reference”, the link “QUOTE - Reed - Nothing Truly Painful Yet Nothing Truly
//     Satisfying”, which holds their gem's own id with no "nugget:" in front. It was drawn grey and opened the Inbox
//     with nothing open under a tab named “You can be stuck in a li…”. Now: drawn solid, and the page shows the gem.
//  B. a link in “On ambition and failure” to “PER - On why procrastination doesn't feel like lost time”, a note in their
//     vault and not in the book: clicked, it is brought in with its words and its picture, under its own tab, and the
//     notice says so. The vault is a stand-in the probe makes beside the data folder (never the user's own vault), with
//     a note of that name in a folder of its own.
//   QA_DATA=<a copy of the book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/ghost-link-book.mjs
//   SHOTS=<folder> saves frames of each click, and the page after it in light and dark.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
// The stand-in vault, and Obsidian's list of vaults naming it (never the real one).
const LINK = "PER - On why procrastination doesn't feel like lost time"
const vault = `${process.env.QA_DATA}.vault`
rmSync(vault, { recursive: true, force: true })
for (const folder of ['.obsidian', 'Personal', 'attachments']) mkdirSync(join(vault, folder), { recursive: true })
writeFileSync(join(vault, 'attachments', 'stand-in-picture.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(join(vault, 'Personal', `${LINK}.md`), '---\ntags:\n  - personal\n---\nA stand-in for the vault note, made by the probe.\n\n![[stand-in-picture.png]]\n')
const config = `${vault}.json`
writeFileSync(config, JSON.stringify({ vaults: { a: { path: vault, ts: 1, open: true } } }))
process.env.HALIGTREE_OBSIDIAN_CONFIG = config
const NOTE = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, v, send, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const shown = () => h.evaluate((sel) => {
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 40 && getComputedStyle(el).visibility !== 'hidden' }
  return {
    page: document.querySelector('[data-page]')?.getAttribute('data-page') ?? null,
    graph: !!document.querySelector('[data-inbox-graph]') && seen(document.querySelector('[data-inbox-graph]')),
    note: [...document.querySelectorAll(sel)].filter(seen).map((one) => one.textContent.replace(/\s+/g, ' ').trim().slice(0, 140)).join(' | '),
    tab: document.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') ?? null,
    picture: [...document.querySelectorAll(sel)].filter(seen).some((one) => [...one.querySelectorAll('img')].some((img) => img.src.startsWith('haligtree://assets/'))),
    notice: [...document.querySelectorAll('[role=status]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).join(' | ')
  }
}, NOTE)
const until = async (test, ms = 9000) => {
  const end = Date.now() + ms
  let last = await shown()
  while (Date.now() < end && !test(last)) { await wait(150); last = await shown() }
  return last
}
const film = async (name) => { if (shots) for (let i = 0; i < 16; i++) { await h.screenshot({ path: `${shots}/${name}-f${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const graphOn = async () => {
  await send('view', 'inbox'); await wait(1500)
  if (!(await h.$('[data-inbox-graph]'))) await h.click('[data-kind-chips] button:has-text("Graph")')
  await h.waitForSelector('[data-inbox-graph]', { timeout: 10000 })
}
const openPage = async (title, label) => {
  const page = (await v('items', 'article')).find((one) => one.title === title)
  check(`the book has “${title}”`, !!page)
  await send('article', page.id); await wait(1500)
  const link = h.locator(`.note-pane a.tiptap-note-link:has-text("${label}")`).first()
  await link.waitFor({ timeout: 10000 })
  await link.scrollIntoViewIfNeeded()
  await wait(800)
  return link
}
try {
  await v('settings:set', { sounds: false })
  await graphOn()

  // A. Their click.
  const quote = await openPage('Vocabulary Reference', 'QUOTE - Reed - Nothing Truly Painful Yet Nothing Truly Satisfying')
  const grey = await quote.evaluate((one) => one.classList.contains('is-unresolved'))
  check('A. their link to the quote is drawn solid: the quote is in the book', !grey, grey ? 'drawn grey' : 'solid')
  if (shots) await h.screenshot({ path: `${shots}/a-before-click.png` })
  await quote.click()
  await film('a-click')
  let s = await until((one) => /stuck in a life/.test(one.note))
  check('A. clicked, the page shows the gem “You can be stuck in a life…”, under its tab', /stuck in a life/.test(s.note) && /stuck in a li/.test(s.tab ?? '') && s.page !== 'inbox', JSON.stringify(s).slice(0, 400))
  if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(500); await h.screenshot({ path: `${shots}/a-after-${name}.png` }) }
  await look('light')

  // A2. Their second picture: in “Starscourge (Channel Identity & Brand)”, “MOC - YouTube” holds the page “YouTube map”'s
  // own id. It opened the Inbox's graph under a tab named “YouTube map”, lit in the sidebar under Writing › YouTube.
  await graphOn()
  const moc = await openPage('Starscourge (Channel Identity & Brand)', 'MOC - YouTube')
  check('A2. “MOC - YouTube” is drawn solid', !(await moc.evaluate((one) => one.classList.contains('is-unresolved'))))
  await moc.click()
  await film('a2-click')
  s = await until((one) => one.tab === 'YouTube map' && one.page !== 'inbox' && one.note.length > 0)
  check('A2. clicked, the page shows “YouTube map”, under its tab', s.tab === 'YouTube map' && s.page === 'articles' && !s.graph && s.note.length > 0, JSON.stringify(s).slice(0, 300))
  // C. The bar over the page names it as its tab does: scrolled past its first heading (“PER - Channel Identity & Brand”),
  // “Starscourge (Channel Identity & Brand)”, its own title from the import.
  await openPage('Starscourge (Channel Identity & Brand)', 'MOC - YouTube')
  // The page's own scroller, whichever box that is at this width (the side list's is not touched).
  await h.evaluate(() => { for (const one of document.querySelectorAll('[data-page] *')) if (one.querySelector('.ProseMirror') && one.scrollHeight > one.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(one).overflowY)) one.scrollTop = 1200 })
  await wait(900)
  // The bar's title (premium-pass's build has no marker on it: found by its look there).
  const bar = await h.evaluate(() => ({ title: (document.querySelector('[data-top-title]') ?? [...document.querySelectorAll('span.truncate.text-center.px-4')].find((one) => getComputedStyle(one).opacity === '1'))?.textContent ?? null, tab: document.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') ?? null }))
  if (shots) await h.screenshot({ path: `${shots}/c-scrolled.png` })
  check('C. scrolled down, the bar names the page as its tab does', !!bar.title && bar.title === bar.tab && !/^PER - /.test(bar.title), JSON.stringify(bar))

  // B. A link to a note only in their vault.
  await graphOn()
  const link = await openPage('On ambition and failure', LINK)
  check('B. its link to the vault note is greyed: no note of that name in the book', await link.evaluate((one) => one.classList.contains('is-unresolved')))
  if (shots) await h.screenshot({ path: `${shots}/b-before-click.png` })
  await link.click()
  await film('b-click')
  s = await until((one) => /stand-in for the vault note/.test(one.note) && one.picture)
  check('B. the page shows the note, brought in with its words and its picture', /stand-in for the vault note/.test(s.note) && s.picture, JSON.stringify(s).slice(0, 400))
  check('B. its tab names the note the page shows', s.tab === LINK && /stand-in for the vault note/.test(s.note), `tab ${JSON.stringify(s.tab)}`)
  check('B. the notice says it came from the vault', /Brought in from your Obsidian vault/.test(s.notice), JSON.stringify(s.notice))
  if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(500); await h.screenshot({ path: `${shots}/b-after-${name}.png` }) }
  check('no errors on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  if (shots) await h.screenshot({ path: `${shots}/error.png` }).catch(() => {})
  check('the run finished', false, error.message.split('\n').slice(0, 12).join(' / '))
}
await c.close()
rmSync(vault, { recursive: true, force: true })
rmSync(config, { force: true })
done()
