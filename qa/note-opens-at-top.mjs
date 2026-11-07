// A long note opens at its top, however it was opened: "Keep" in the sort flow going on to the next, a row clicked after
// scrolling another note to its end, the arrows, a tab, Back. A long note offers a way back to the top.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/abs/dir node qa/note-opens-at-top.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => { if (shots) await h.screenshot({ path: `${shots}/${name}.png` }) }
const pump = async () => { for (let i = 0; i < 8; i++) { await h.screenshot(); await wait(40) } }
const longBody = (title) => ({ type: 'doc', content: Array.from({ length: 90 }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `${title}, line ${n + 1}. Words enough to fill the width of the page and more besides.` }] })) })
const place = () => h.evaluate(() => {
  const words = [...document.querySelectorAll('.ProseMirror')].filter((one) => one.getClientRects().length && one.textContent.includes(', line 1.')).pop()
  let box = words?.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  return { top: box ? Math.round(box.scrollTop) : -1, room: box ? box.scrollHeight - box.clientHeight : 0, title: words?.textContent.slice(0, 12), active: document.activeElement?.className?.slice?.(0, 30) ?? '' }
})
const toEnd = () => h.evaluate(() => {
  const words = [...document.querySelectorAll('.ProseMirror')].filter((one) => one.getClientRects().length && one.textContent.includes(', line 1.')).pop()
  let box = words?.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  if (box) box.scrollTop = box.scrollHeight
})
const row = (title) => h.locator('[data-pane] [data-row]', { hasText: title }).first()
const at = async (name, want = true) => { await pump(); const p = await place(); check(`${name}: at its top`, p.top >= 0 && p.top < 40 && p.room > 200, JSON.stringify(p)); return p }
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const groups = await v('groups', 'article')
  const inFolders = new Set(groups.flatMap((one) => one.members))
  const ids = []
  for (const title of ['Long A', 'Long B', 'Long C']) { const id = await v('article:new'); await v('item:save', id, { title, body: longBody(title) }); ids.push(id) }
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !ids.includes(one.id) && !one.archivedAt).map((one) => one.id)
  await v('groups:arrange', 'article', { top: [...ids, ...groups.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: {} })
  await go('articles')
  await wait(900)
  await row('Long A').click(); await wait(900)
  await at('a row clicked, first time')
  await toEnd(); await pump()
  await shot('a-scrolled-down')
  const top = h.locator('[aria-label="Back to top"]')
  check('scrolled far down a note: the way back to the top shows', await top.count() === 1, await top.count())
  if (await top.count()) { await top.first().click(); await wait(900); await pump(); const p = await place(); check('it goes to the top', p.top < 10, p.top); await toEnd(); await pump() }
  await row('Long B').click(); await wait(900)
  await at('another row clicked, the last note scrolled to its end')
  await toEnd(); await pump()
  await row('Long C').click(); await wait(900)
  await at('and again')
  await toEnd(); await pump()
  await row('Long B').click(); await wait(900); await toEnd(); await pump()
  // Sent to its own page by the app, as a link or the sidebar does.
  await s.send('article', ids[0]); await wait(1000)
  await at('opened from a link, the last one scrolled down')
  await toEnd(); await pump()
  await s.send('article', ids[2]); await wait(1000)
  await at('opened from a link again')
  // Left part way down, a note reopens there; that memory stays.
  await h.evaluate(() => { const box = [...document.querySelectorAll('.haligtree-editor-content')].filter((one) => one.getClientRects().length && one.scrollHeight > one.clientHeight + 200).pop(); box.scrollTop = 1500 }); await pump()
  await s.send('article', ids[1]); await wait(1000); await pump()
  await at('another opened after leaving one part way')
  await s.send('article', ids[2]); await wait(1000); await pump()
  const again = await place()
  check('the one left part way reopens where it was left', Math.abs(again.top - 1500) < 40, JSON.stringify(again))
  await h.evaluate(() => { const box = [...document.querySelectorAll('.haligtree-editor-content')].filter((one) => one.getClientRects().length && one.scrollHeight > one.clientHeight + 200).pop(); box.scrollTop = 0 }); await pump()
  // The sort flow: "Keep" goes on to the next, long, note.
  const box = await v('groups:make', 'article', 'To sort', null, false)
  await v('groups:arrange', 'article', { top: [`g:${box}`, ...groups.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: { [box]: ids } })
  await v('imports:sorted', ids, false)
  await go('articles'); await wait(1000)
  check('the group offers sorting', await h.locator('[data-sort-these]').count() === 1)
  await h.evaluate(() => document.querySelector('[data-sort-these]').click()); await wait(1400)
  await shot('sort-first')
  const inSort = () => h.evaluate(() => { const box = (() => { for (let at = document.querySelector('[data-sort-group]')?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at })(); return box ? { top: Math.round(box.scrollTop), room: box.scrollHeight - box.clientHeight } : null })
  await pump()
  let p = await inSort()
  check('sorting: the first note opens at its top', p && p.top < 40 && p.room > 200, JSON.stringify(p))
  await h.evaluate(() => { const box = (() => { for (let at = document.querySelector('[data-sort-group]')?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at })(); box.scrollTop = box.scrollHeight }); await pump()
  await shot('sort-scrolled')
  check('sorting: scrolled down, the way back to the top shows', await h.locator('[aria-label="Back to top"]').count() >= 1)
  for (const n of [2, 3]) {
    await h.locator('[data-sort-keep]').first().click(); await wait(1000); await pump()
    p = await inSort()
    check(`sorting: "Keep", note ${n} opens at its top`, p && p.top < 40 && p.room > 200, JSON.stringify(p))
    await shot(`sort-kept-${n}`)
    if (n === 2) { await h.evaluate(() => { const box = (() => { for (let at = document.querySelector('[data-sort-group]')?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at })(); box.scrollTop = box.scrollHeight }); await pump() }
  }
} finally {
  await close()
}
done()
