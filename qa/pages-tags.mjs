// The Tags page uses its width as Sources does: two tags side by side where the page is wide, compact rows of one
// height, each keeping its count, read across by the keys (→ the one beside, ↓ the one under). Its first screen
// answers what someone comes for: a box to find a tag, and the tags by size, by what is growing ("+N this month")
// or by name. Its bar matches Sources' bar. 1,000 tags draw only what is in view; no tags shows the made-up example;
// a phone's width is one column with nothing off the side. Light and dark frames to QA_SHOTS.
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/pages-tags.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const { h, electron, go, size, both, close, errors } = await sandbox({ width: 1280, height: 860 })
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const NAMES = ['stoicism', 'writing', 'programming-humour', 'history', 'dune', 'hamlet', 'biology', 'cooking', 'music-theory', 'philosophy', 'film', 'poetry', 'travel', 'garden', 'running', 'chess', 'spanish', 'law', 'design', 'economics', 'a-very-long-tag-name-for-testing']
// Any row of the page (main's rows have no data-tag-row; their name is their first words).
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-row]')].filter((one) => one.offsetParent).map((one) => { const r = one.getBoundingClientRect(); return { tag: one.dataset.tagRow ?? one.innerText.trim().split(/\s/)[0], left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), height: Math.round(r.height), count: one.querySelector('[data-tag-count]')?.textContent ?? one.lastElementChild?.textContent ?? '' } }))
const content = () => h.evaluate(() => { const list = document.querySelector('[data-tags-list]') ?? document.querySelector('[data-row]')?.closest('.mx-3'); const page = list?.closest('section'); return { list: list && Math.round(list.getBoundingClientRect().width), page: page && Math.round(page.getBoundingClientRect().width), // The page's own column: at 390 the window's title bar runs past the edge (its own matter, named in the report).
  overflow: page ? page.scrollWidth - page.clientWidth : 0 } })
// The page's bar and its first row, to set beside Sources'.
const bar = () => h.evaluate(() => { const head = [...document.querySelectorAll('section > header')].find((one) => one.offsetParent); const r = head?.getBoundingClientRect(); const first = document.querySelector('[data-row]')?.getBoundingClientRect(); return { height: r && Math.round(r.height), left: r && Math.round(r.left), row: first && Math.round(first.left) } })
const cursorTag = () => h.evaluate(() => document.querySelector('[data-tag-row][data-cursor]')?.dataset.tagRow ?? null)

try {
  // First open, before this probe's tags: the sandbox's seeded ones.
  await go('tags')
  await wait(1200)
  const empty = await rows()
  check('first open: the sandbox\'s own tags show', empty.length >= 5, String(empty.length))
  if (shots) await both(`${shots}/tags-empty`)

  // 21 tags, the first written lately, the rest a while ago (dates set through the probe hook where there is one).
  for (const [k, name] of NAMES.entries()) for (let n = 0; n <= (NAMES.length - k) % 7; n++) await h.evaluate((p) => window.api.captures.create(p), { kind: 'note', body: doc(`A thought on ${name}, number ${n}. #${name}`) })
  await go('home')
  await go('tags')
  await wait(1400)
  const wide = await rows()
  const room = await content()
  console.log('desktop:', wide.slice(0, 4).map((one) => `${one.tag}@${one.left},${one.top}`).join(' '), JSON.stringify(room))
  const lefts = [...new Set(wide.map((one) => one.left))]
  check('1280: two columns side by side', lefts.length === 2, JSON.stringify(lefts))
  check('1280: the list is at least half the content area', room.list >= room.page / 2, JSON.stringify(room))
  const pairs = []; for (let k = 0; k + 1 < wide.length; k += 2) pairs.push([wide[k], wide[k + 1]])
  check('1280: each pair shares one top and one height', pairs.every(([a, b]) => a.top === b.top && a.height === b.height))
  check('1280: rows stay compact (one line tall)', wide.every((one) => one.height <= 40), JSON.stringify([...new Set(wide.map((one) => one.height))]))
  check('1280: every row keeps its count', wide.every((one) => /\d/.test(one.count)), JSON.stringify(wide.slice(0, 3).map((one) => one.count)))
  const recent = await h.evaluate(() => document.querySelectorAll('[data-tag-recent]').length)
  check('what is growing is said: "+N this month" on tags written into lately', recent > 0, String(recent))
  const find = await h.evaluate(() => !!document.querySelector('[data-tags-find] input'))
  const orders = await h.evaluate(() => [...document.querySelectorAll('[data-tags-bar] button')].map((one) => one.getAttribute('aria-label')))
  check('the first screen has a box to find a tag and the three orders', find && ['Most used', 'Lately', 'A to Z'].every((one) => orders.includes(one)), JSON.stringify(orders))
  // A to Z: the order reads across.
  await h.locator('[data-tags-bar] button[aria-label="A to Z"]').click()
  await wait(500)
  const az = (await rows()).map((one) => one.tag)
  check('A to Z: in order, read across the two columns', az.join() === [...az].sort().join(), az.slice(0, 4).join())
  // The keys: ↓ starts on the first, → the one beside, ↓ the one under, ← and ↑ back.
  await h.mouse.click(5, 300)
  const seen = []
  for (const key of ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) { await h.keyboard.press(key); await wait(80); seen.push(await cursorTag()) }
  check('keys: ↓ first row, → beside, ↓ under, ← back, ↑ up', seen.join() === [az[0], az[1], az[3], az[2], az[0]].join(), seen.join())
  await h.keyboard.press('Enter')
  await wait(1200)
  const opened = await h.evaluate(() => document.querySelector('h1 [data-tag-title]')?.textContent)
  check('Enter opens the tag under the cursor', opened === `#${az[0]}`, opened)
  if (shots) await both(`${shots}/tags-open-1280`)
  await h.keyboard.press('Meta+BracketLeft')
  await wait(900)
  if (shots) await both(`${shots}/tags-1280`)
  const tagsBar = await bar()
  await go('sources')
  await wait(1200)
  const sourcesBar = await bar()
  check('the bar matches Sources\' bar (height and left edge)', tagsBar.height === sourcesBar.height && tagsBar.left === sourcesBar.left, `${JSON.stringify(tagsBar)} vs ${JSON.stringify(sourcesBar)}`)
  await go('tags')
  await wait(900)

  await size(1600, 1000)
  await wait(700)
  check('1600: still two columns', new Set((await rows()).map((one) => one.left)).size === 2)
  if (shots) await both(`${shots}/tags-1600`)

  // The window's minimum (560) and a phone's 390: one column, nothing off the side.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setMinimumSize(1, 1))
  for (const w of [560, 390]) {
    await size(w, 844)
    await wait(900)
    const phone = await rows()
    const fit = await content()
    check(`${w}: one column, nothing off the side`, new Set(phone.map((one) => one.left)).size === 1 && fit.overflow <= 0 && phone.every((one) => one.right <= w), `${JSON.stringify([...new Set(phone.map((one) => one.left))])} ${fit.overflow}`)
    if (shots) await both(`${shots}/tags-${w}`)
  }
  await size(1280, 860)

  // 1,000 tags: only those in view are drawn.
  await h.evaluate(async () => { for (let k = 0; k < 1000; k++) await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Tag number ${k} #t${String(k).padStart(4, '0')}` }] }] } }) })
  await go('home')
  await go('tags')
  await wait(2000)
  const many = await rows()
  check('1,000 tags: two columns, only a screenful drawn', many.length > 10 && many.length < 200 && new Set(many.map((one) => one.left)).size === 2, String(many.length))
  if (shots) await both(`${shots}/tags-1000`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
