// Pictures for looking at, not checks only: Writing with 30 folders holding 0, 5, 50 and 500 pages, light and dark,
// at desktop and phone width, beside Gems and Sources; frames every 50ms of a folder opening; the 500-page folder open.
// Checks: folders lead, the page scrolls only down (no sideways scroll at 390), each folder's count is its own.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=<dir> node qa/folders-scale.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, size, look, close, errors } = s
const shots = process.env.QA_SHOTS ?? '/tmp'
mkdirSync(`${shots}/frames`, { recursive: true })
const shot = (name) => h.screenshot({ path: `${shots}/${name}.png` })
try {
  await v('settings:set', { hintRate: 0 })
  const sizes = { 'Empty for now': 0, 'Five drafts': 5, 'Fifty letters to a younger me, kept in order': 50, 'Five hundred morning pages': 500 }
  const made = {}
  // The 26 others first: a new folder goes on top, so the four with pages lead the list.
  for (let i = 0; i < 26; i++) await v('groups:make', 'article', `Folder ${i + 1}${i % 5 === 0 ? ' with a rather long name for its row' : ''}`)
  for (const [name, n] of Object.entries(sizes)) {
    const folder = await v('groups:make', 'article', name)
    made[name] = folder
    const moves = []
    for (let i = 0; i < n; i++) {
      const id = await v('article:new')
      await v('item:save', id, { title: i % 7 === 0 ? `A much longer page title that goes on and on about the morning, number ${i + 1}` : `${name.split(' ')[0]} page ${i + 1}` })
      moves.push({ id, group: folder, order: i })
    }
    if (moves.length) await v('groups:place', moves)
  }
  for (const theme of ['light', 'dark']) {
    await look(theme)
    for (const [w, label] of [[1300, 'desk'], [390, 'phone']]) {
      await size(w, 844)
      for (const page of ['articles', 'nuggets', 'sources']) {
        await go(page)
        await h.waitForTimeout(900)
        await shot(`scale-${page}-${theme}-${label}`)
      }
      await go('articles')
      await h.waitForTimeout(900)
      const sideways = await h.evaluate(() => [...document.querySelectorAll('[role="main"] *')].some((one) => one.scrollWidth > one.clientWidth + 1 && getComputedStyle(one).overflowX === 'auto'))
      check(`${theme} ${label}: no sideways scroll on Writing`, !sideways)
      const order = await h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-group-row], [role="main"] [data-row]')].map((one) => (one.hasAttribute('data-group-row') ? 'F' : 'n')).join(''))
      check(`${theme} ${label}: the folders lead (${order.split('F').length - 1} folder rows drawn)`, /^F+n*$/.test(order), order.slice(0, 50))
    }
  }
  await size(1300, 860)
  await look('light')
  await go('articles')
  await h.waitForTimeout(900)
  // Every folder row drawn, scrolled through, with its count beside the pages it holds.
  const counts = {}
  for (let i = 0; i < 30; i++) {
    Object.assign(counts, await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[role="main"] [data-group-row]')].map((one) => [one.getAttribute('aria-label'), one.querySelector('[data-count]')?.textContent?.replace(/[^0-9]/g, '')]))))
    if (await h.locator(`[role="main"] [data-group-row="${made['Five hundred morning pages']}"]`).count()) break
    await h.mouse.move(1000, 600)
    await h.mouse.wheel(0, 500)
    await h.waitForTimeout(150)
  }
  check('each folder row shows its own count', counts['Five hundred morning pages'] === '500' && counts['Five drafts'] === '5' && counts['Empty for now'] === '0' && Object.keys(counts).length >= 30, JSON.stringify(counts).slice(0, 300))
  // Opening the 500-page folder, a frame every 50ms.
  const row = h.locator(`[role="main"] [data-group-row="${made['Five hundred morning pages']}"]`)
  await row.scrollIntoViewIfNeeded()
  const start = Date.now()
  await row.click()
  const times = []
  for (let i = 0; i < 12; i++) {
    const t = Date.now() - start
    times.push(t)
    await h.screenshot({ path: `${shots}/frames/open-${String(i).padStart(2, '0')}-${t}ms.png` })
    const wait = (i + 1) * 50 - (Date.now() - start)
    if (wait > 0) await h.waitForTimeout(wait)
  }
  check('frames of the folder opening taken about 50ms apart', times.length === 12, times.join(' '))
  await shot('scale-500-open')
  const rows = await h.evaluate(() => document.querySelectorAll('[role="main"] [data-row]').length)
  check('500 open: only what is visible is drawn', rows < 120, `${rows} rows in the page`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
