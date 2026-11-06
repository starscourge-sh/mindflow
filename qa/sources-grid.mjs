// The Sources page lays its sources two side by side at a desktop width, as a Notion page of short link lists does,
// never one long column with the right half of the page empty; at a phone's width (390 x 844) one under another.
// Each pair of rows shares one top, every row keeps its count line under the name, and the order reads across:
// Tab and the arrows go A, B on the first line, then C, D. The same for List view's People and Sources.
// Light and dark frames to QA_SHOTS.
//
//   npx electron-vite build --outDir out-src
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-src/main/index.js HALIGTREE_QA_AWAY=1 node qa/sources-grid.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const { h, electron, go, size, both, close, errors } = await sandbox({ width: 1300, height: 900 })
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const PLACES = ['The Law Book', 'youtube.com', 'reddit.com', 'Meditations', 'The Odyssey', 'arxiv.org', 'Hacker News', 'The Atlantic', 'A Very Long Source Name That Will Not Fit In Half The Page At All', 'Wikipedia', 'Letters to a Young Poet', 'news.ycombinator.com']
// The rows of the Sources group, in the order they are drawn, with where each sits and whether it has its count line.
const rows = (group = 'Sources') => h.evaluate((group) => {
  const all = [...document.querySelectorAll('[data-row]')].filter((one) => one.dataset.id?.startsWith(group === 'Sources' ? 'medium:' : 'attribution:'))
  return all.map((one) => { const r = one.getBoundingClientRect(); return { id: one.dataset.id, left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), lines: one.innerText.split('\n').filter(Boolean).length } })
}, group)
const pairs = (list) => { const out = []; for (let k = 0; k + 1 < list.length; k += 2) out.push([list[k], list[k + 1]]); return out }
// Tab from the first row, then the arrows: which row has the focus after each.
const keys = async (presses) => {
  await h.locator('[data-row][data-id^="medium:"]').first().focus()
  const seen = [await h.evaluate(() => document.activeElement?.dataset.id)]
  for (const key of presses) { await h.keyboard.press(key); seen.push(await h.evaluate(() => document.activeElement?.dataset.id)) }
  return seen
}

try {
  for (const [k, name] of PLACES.entries()) await h.evaluate((p) => window.api.captures.create(p), { kind: 'quote', body: doc(`A line from ${name}, number ${k}.`), attribution: 'Mary Oliver', medium: name })
  await h.evaluate(() => localStorage.setItem('view:sources', JSON.stringify({ sort: 'name', group: 'none', density: 'grid' })))
  await go('sources')
  await wait(1500)

  // Grid view, desktop width: the faces, then the sources two side by side.
  const wide = await rows()
  console.log('desktop:', wide.slice(0, 4).map((one) => `${one.id}@${one.left},${one.top}`).join(' '))
  const lefts = [...new Set(wide.map((one) => one.left))]
  check('at least ten sources drawn', wide.length >= 10, String(wide.length))
  check('desktop: two columns side by side', lefts.length === 2 && wide[1].left > wide[0].left + wide[0].width - 4, JSON.stringify(lefts))
  check('desktop: each pair of rows shares one top', pairs(wide).every(([a, b]) => a.top === b.top && a.height === b.height), JSON.stringify(pairs(wide).map(([a, b]) => [a.top, b.top])))
  check('desktop: rows stay compact (one row tall, never stretched)', wide.every((one) => one.height <= 60), JSON.stringify(wide.map((one) => one.height)))
  check('desktop: every row keeps its count line under the name', wide.every((one) => one.lines >= 2), JSON.stringify(wide.map((one) => one.lines)))
  const across = await keys(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Tab'])
  check('desktop: → goes to the row beside, ↓ to the one under, ← and ↑ back', across[1] === wide[1].id && across[2] === wide[3].id && across[3] === wide[2].id && across[4] === wide[0].id, JSON.stringify(across))
  check('desktop: Tab reads across, the first row then the one beside it', across[5] === wide[1].id, across[5])
  if (shots) await both(`${shots}/grid-desktop`)
  await h.locator('[data-row][data-id^="medium:"]').nth(1).hover()
  await wait(250)
  if (shots) await h.screenshot({ path: `${shots}/grid-desktop-hover.png` })

  // Phone width: one under another, the same order. The main window keeps itself 560 wide at least, so the probe
  // lets it go narrower, as a phone's screen would be.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setMinimumSize(1, 1))
  await size(390, 844)
  await wait(900)
  const phone = await rows()
  const inner = await h.evaluate(() => innerWidth)
  console.log('phone width:', inner)
  check('390px: one column', new Set(phone.map((one) => one.left)).size === 1 && phone.length >= 10, JSON.stringify([...new Set(phone.map((one) => one.left))]))
  check('390px: nothing runs off the side', inner <= 400 && phone.every((one) => one.left + one.width <= inner), JSON.stringify(phone.map((one) => one.left + one.width)))
  const down = await keys(['ArrowDown', 'ArrowDown'])
  check('390px: ↓ goes to the next row down', down[1] === phone[1].id && down[2] === phone[2].id, JSON.stringify(down))
  if (shots) await both(`${shots}/grid-phone`)

  // List view: People and Sources both two side by side at the desktop width.
  await size(1300, 900)
  await h.evaluate(() => localStorage.setItem('view:sources', JSON.stringify({ sort: 'name', group: 'none', density: 'list' })))
  await go('home')
  await wait(400)
  await go('sources')
  await wait(1500)
  for (const group of ['People', 'Sources']) {
    const list = await rows(group)
    check(`list view, ${group}: two columns, pairs on one top`, new Set(list.map((one) => one.left)).size === 2 && pairs(list).every(([a, b]) => a.top === b.top), JSON.stringify(list.slice(0, 4).map((one) => [one.left, one.top])))
  }
  if (shots) await both(`${shots}/list-desktop`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
