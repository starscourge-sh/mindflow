// Wikipedia's "Morgoth's Ring" in the reader, as the user read it (20 Nov 2026): "From Wikipedia, the free encyclopedia"
// opened the article under the big first letter, the infobox's labels lost their spaces ("Followedby", "Mediatype")
// and the infobox sat squeezed beside the letter. A saved copy of the real page (qa/fixtures/reader/morgoths-ring.html)
// is served by the stand-in (qa/wiki-stand-in.mjs). Two ways in: one kept by the earlier reader (planted in the book
// before the app starts, tagline and all) opened offline, as it was kept; then online, read again from the site.
// Each: no tagline, the big letter on the first real paragraph, the infobox above it and never beside it; read again,
// "Followed by" with its space and the infobox the column's width. Frames in light and dark.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/wiki-infobox.mjs
import { readFileSync, mkdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn, MORGOTH, ROMAN } from './wiki-stand-in.mjs'
process.env.QA_ARGS ??= '--sandbox'
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

// The article as the earlier reader kept it, before the app opens the book.
const db = new DatabaseSync(`${process.env.QA_DATA}/sandbox/haligtree.db`)
db.exec('create table if not exists web_articles (id text primary key, href text unique not null, title text not null, byline text not null, site text not null, published text not null, html text not null, saved_at text not null)')
db.prepare('insert or replace into web_articles values (?, ?, ?, ?, ?, ?, ?, ?)').run('qa-morgoth', MORGOTH, "Morgoth's Ring", '', 'Wikipedia', '', readFileSync(new URL('./fixtures/reader/morgoths-ring.kept-reader3.html', import.meta.url), 'utf8'), '2026-11-19T10:00:00.000Z')
db.close()

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
mkdirSync(shots, { recursive: true })
const heading = () => h.evaluate(() => document.querySelector('.web-reader-heading')?.textContent ?? null)
const until = async (test, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const theme = (name) => h.evaluate((name) => { localStorage.setItem('theme', name); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name)
const open = (href) => h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
/** The article's opening as a person sees it. */
const look = () => h.evaluate(() => {
  const body = document.querySelector('.web-reader-body')
  const drop = body.querySelector('p[data-drop]')
  const box = body.querySelector('table')
  const r = (one) => one && (({ left, right, top, bottom, width }) => ({ left: Math.round(left), right: Math.round(right), top: Math.round(top), bottom: Math.round(bottom), width: Math.round(width) }))(one.getBoundingClientRect())
  return {
    tagline: /free encyclopedia/i.test(body.textContent),
    first: body.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
    drop: drop?.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) ?? null,
    firstP: [...body.querySelectorAll('p')].find((one) => one.textContent.trim())?.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) ?? null,
    labels: [...body.querySelectorAll('table th')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()),
    box: r(box), dropBox: r(drop), column: r(body),
    infobox: box?.hasAttribute('data-infobox') ?? false,
    emptyRows: [...(box?.querySelectorAll('tr') ?? [])].filter((one) => !one.textContent.trim() && !one.querySelector('img:not([data-wait])')).length
  }
})
const fair = (one) => one.box && one.dropBox && one.box.bottom <= one.dropBox.top && one.drop === one.firstP && /^Morgoth's Ring \(1993\)/.test(one.drop ?? '')
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await wait(500)

  // Kept by the earlier reader, opened offline: shown as it was kept, its tagline taken off.
  site.offline(true)
  await open(MORGOTH)
  await until(async () => (await heading()) === "Morgoth's Ring")
  await wait(600)
  const kept = await look()
  check('kept from before, offline: no "From Wikipedia, the free encyclopedia"', !kept.tagline, JSON.stringify(kept.first))
  check('…the big letter on the first real paragraph, the infobox above it, never beside it', fair(kept), JSON.stringify(kept))
  for (const one of ['light', 'dark']) {
    await theme(one); await wait(500)
    await h.screenshot({ path: `${shots}/infobox-kept-${one}.png` })
  }

  // Online: the earlier reader's copy is read again from the site, as this reader keeps a page.
  // (Another article between, as a person reads on, so the reader opens it anew.)
  site.offline(false)
  await open(ROMAN)
  await until(async () => (await heading()) === 'Roman Empire')
  await open(MORGOTH)
  await until(async () => (await look().catch(() => ({ labels: [] }))).labels.includes('Followed by'))
  await wait(800)
  const fresh = await look()
  check('read again: no tagline', !fresh.tagline, JSON.stringify(fresh.first))
  check('…"Followed by", "Preceded by", "Publication date" and "Media type" keep their spaces', ['Followed by', 'Preceded by', 'Publication date', 'Media type'].every((one) => fresh.labels.includes(one)), JSON.stringify(fresh.labels))
  check('…the big letter on the first real paragraph, the infobox above it, never beside it', fair(fresh), JSON.stringify(fresh))
  check('…the infobox set as the reader\'s own figure: the column\'s full width, from its left edge, no empty band where its fair-use cover was', fresh.infobox && Math.abs(fresh.box.width - fresh.column.width) <= 2 && Math.abs(fresh.box.left - fresh.column.left) <= 1 && fresh.emptyRows === 0, JSON.stringify({ box: fresh.box, column: fresh.column, emptyRows: fresh.emptyRows }))
  for (const one of ['light', 'dark']) {
    await theme(one); await wait(500)
    await h.screenshot({ path: `${shots}/infobox-fresh-${one}.png` })
    await h.evaluate(() => document.querySelector('.web-reader-body p[data-drop]').scrollIntoView({ block: 'center' }))
    await wait(300)
    await h.screenshot({ path: `${shots}/infobox-drop-${one}.png` })
    await h.evaluate(() => document.querySelector('.web-reader-scroll').scrollTo(0, 0))
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
  site.close()
}
done()
