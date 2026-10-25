// Long note lists draw only the rows in view: 600 captures in the Inbox and
// 300 gems, checked as one list (grouped by date) and as islands opened all
// the way. On each: far fewer rows in the page than in the list, the last row
// shows at the bottom, ArrowDown walks past the first screen with its row
// drawn and in view, ⌘A picks every one (the count says so), an island folds
// and unfolds, and how long the page takes to open.
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/virtual-lists.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const CAPTURES = 600
const GEMS = 300
const c = await sandbox({ width: 1100, height: 800 })
const { h, v, go, errors } = c
const pad = (n) => String(n).padStart(4, '0')
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

// What is drawn: rows in the page, the cursor's row, and whether it shows.
const look = () => h.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-page] [data-row], main [data-row]')]
  const cursor = document.querySelector('[data-row][data-cursor]')
  const box = cursor?.getBoundingClientRect()
  return {
    rows: rows.length,
    titles: rows.map((one) => one.innerText.split('\n')[0]),
    cursor: cursor?.innerText.split('\n')[0] ?? null,
    inView: !!box && box.top >= 0 && box.bottom <= innerHeight
  }
})
// The list's scroller set to a place: 'end', 'top', or a step of a screen down. Says whether it moved.
const scroller = (to) => h.evaluate((to) => {
  let up = document.querySelector('[data-row]')?.parentElement ?? null
  while (up && !/auto|scroll/.test(getComputedStyle(up).overflowY)) up = up.parentElement
  if (!up) return false
  const was = up.scrollTop
  up.scrollTop = to === 'end' ? up.scrollHeight : to === 'top' ? 0 : was + up.clientHeight * 0.8
  return up.scrollTop !== was
}, to)
// Every one of ours seen, a screen at a time from the top: none is out of reach.
const reach = async (prefix) => {
  const seen = new Set()
  await scroller('top')
  for (let i = 0; i < 400; i++) {
    await h.waitForTimeout(60)
    for (const one of (await look()).titles) if (one.startsWith(prefix)) seen.add(one)
    if (!(await scroller('down'))) break
  }
  await h.waitForTimeout(200)
  for (const one of (await look()).titles) if (one.startsWith(prefix)) seen.add(one)
  return seen.size
}
// From another page to this one, until its rows are drawn and still.
const timeOpen = async (page) => {
  await go('home')
  const start = Date.now()
  await c.send('view', page)
  let last = -1
  for (let i = 0; i < 300; i++) {
    const n = await h.evaluate(() => document.querySelectorAll('[data-row]').length)
    if (n > 0 && n === last) break
    last = n
    await h.waitForTimeout(25)
  }
  return Date.now() - start
}
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]
const press = async (key, times = 1) => { for (let i = 0; i < times; i++) await h.keyboard.press(key) }
const countSays = () => h.evaluate(() => (document.body.innerText.match(/([\d,]+) selected/)?.[1] ?? '').replace(/,/g, ''))

try {
  await h.waitForTimeout(1500)
  for (let i = 1; i <= CAPTURES; i++)
    await h.evaluate((doc) => window.api.captures.create({ kind: 'note', body: doc }), { type: 'doc', content: [para(`Vlist cap ${pad(i)}`), para('Body words')] })
  for (let i = 1; i <= GEMS; i++) await v('nugget:from', `Vlist gem ${pad(i)}`, {})
  // Gems by date, one list.
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'newest', group: 'date', filter: {} })))
  await h.reload()
  await h.waitForTimeout(2500)

  const walk = async (label, page, total, prefix) => {
    const times = []
    for (let i = 0; i < 3; i++) times.push(await timeOpen(page))
    await h.waitForTimeout(800)
    console.log(`TIME ${label}: opens in ${median(times)} ms (median of ${times.join(', ')})`)
    const top = await look()
    check(`${label}: far fewer rows drawn than the ${total} it holds`, top.rows > 0 && top.rows < total / 3, `${top.rows} drawn`)
    const reached = await reach(prefix)
    check(`${label}: scrolled a screen at a time, every one of the ${total} shows`, reached === total, `${reached} seen`)
    await scroller('end')
    await h.waitForTimeout(600)
    const end = await h.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-row]')]
      let up = rows[0]?.parentElement ?? null
      while (up && !/auto|scroll/.test(getComputedStyle(up).overflowY)) up = up.parentElement
      const last = rows.at(-1)?.getBoundingClientRect()
      return { rows: rows.length, shows: !!last && !!up && last.bottom <= up.getBoundingClientRect().bottom + 1 && last.bottom > up.getBoundingClientRect().top }
    })
    check(`${label}: scrolled to the bottom, the last row is drawn and on screen`, end.shows)
    check(`${label}: still few rows drawn at the bottom`, end.rows < total / 3, `${end.rows} drawn`)
    await scroller('top')
    await h.waitForTimeout(400)
    // From no row: the first ↓ lands on the top one, then 40 more.
    await h.evaluate(() => document.activeElement?.blur())
    await press('ArrowDown', 41)
    await h.waitForTimeout(600)
    const walked = await look()
    check(`${label}: 41 presses of ↓, the keyboard's row is past the first screen, drawn and in view`, walked.cursor && walked.inView && !top.titles.includes(walked.cursor), `${walked.cursor} inView=${walked.inView}`)
    await press('Escape')
    await h.evaluate(() => document.activeElement?.blur())
    await press('Meta+a')
    await h.waitForTimeout(600)
    const said = await countSays()
    check(`${label}: ⌘A picks every row, the ${total} of ours and the practice book's own`, Number(said) >= total, `count says ${said}`)
    await press('Escape')
    await h.waitForTimeout(400)
  }

  await walk('Inbox, one list by date', 'inbox', CAPTURES, 'Vlist cap')
  await walk('Gems by date', 'nuggets', GEMS, 'Vlist gem')

  // Islands opened all the way: the Inbox by date, as islands, each shown whole.
  await h.evaluate(() => {
    localStorage.setItem('view:captures:Inbox', JSON.stringify({ sort: 'newest', group: 'date', islands: true, filter: {} }))
    localStorage.setItem('islands:captures:Inbox', JSON.stringify({ folded: [], whole: [], more: { Today: 100000, 'This week': 100000, 'This month': 100000, 'This year': 100000, Older: 100000 } }))
  })
  await h.reload()
  await h.waitForTimeout(2500)
  await walk('Inbox as islands, opened whole', 'inbox', CAPTURES, 'Vlist cap')
  const head = h.locator('[data-island-head]').first()
  const name = await head.getAttribute('data-island-head')
  await scroller('top')
  await head.evaluate((one) => one.click())
  await h.waitForTimeout(500)
  const inIsland = () => h.evaluate((name) => document.querySelectorAll(`[data-island="${CSS.escape(name)}"] [data-row]`).length, name)
  const folded = await inIsland()
  check(`Inbox islands: "${name}" folds`, (await head.getAttribute('aria-expanded')) === 'false' && folded === 0, `${folded} rows`)
  await head.evaluate((one) => one.click())
  await h.waitForTimeout(500)
  const open = await inIsland()

  check(`Inbox islands: "${name}" unfolds, its rows back`, (await head.getAttribute('aria-expanded')) === 'true' && open > 0, `${open} rows`)
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await c.close()
}
done()
