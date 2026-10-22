// The notes side of Haligtree at its smallest and on a big screen: Inbox,
// Everything, the Bin, Archived, tags, Review, cards, Map, Goals, Stats,
// Powers, "What's new", Today, the year and day pages, kind pages and an open
// note. At each size, with the sidebar open and shut, it checks: no sideways
// page scroll, no text cut off with no ellipsis, nothing past the window's
// right edge, no line of details folded onto several lines, and, wide, that
// reading text keeps a sensible width. SHOTS=<dir> keeps a screenshot of each.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-notes/main/index.js HALIGTREE_QA_AWAY=1 node qa/notes-layout.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const { h, go, send, size } = c
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const items = (tier) => h.evaluate((t) => window.api.haligtree('items', t), tier)

const VIEWS = ['inbox', 'all', 'discarded', 'archived', 'tags', 'review', 'queue', 'map', 'goals', 'stats', 'powers', 'whatsnew', 'today', 'yearpage', 'day', 'nuggets', 'articles', 'questions']
const SIZES = (process.env.SIZES ?? '560x400,900x640,1920x1200,2560x1440').split(',').map((s) => s.split('x').map(Number))

/** What is wrong on the page as it stands, read off the screen. */
const measure = () => h.evaluate(() => {
  const W = innerWidth
  const bad = []
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''} "${(el.textContent || '').trim().slice(0, 40)}"`
  const seen = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 }
  const main = document.querySelector('main') ?? document.body
  // Sideways scroll on the page or its main scroller.
  for (const el of [document.scrollingElement, ...main.querySelectorAll('*')]) {
    if (!el) continue
    const s = getComputedStyle(el)
    if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > W * 0.5 && !/snap-x/.test(el.className)) bad.push(`sideways scroll ${name(el)} ${el.scrollWidth}>${el.clientWidth}`)
  }
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || !seen(el) || el.closest('.ProseMirror, svg, canvas, [data-map], [aria-hidden="true"]')) continue
    if (r.bottom < 0 || r.top > innerHeight) continue
    const s = getComputedStyle(el)
    // Past the right edge, inside no scroller.
    if (r.right > W + 1 && r.left < W && !el.closest('[class*="overflow-x"], [style*="overflow"]')) {
      let p = el.parentElement, scroller = false
      while (p) { const ps = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) { scroller = true; break } p = p.parentElement }
      if (!scroller) bad.push(`past right edge ${name(el)} right=${Math.round(r.right)}`)
    }
    const leaf = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    // A short detail folded onto two or more lines (e.g. "open the top" / "result").
    const words = (el.textContent || '').trim()
    if (leaf && el.children.length <= 2 && words.length < 28 && words.includes(' ') && s.display !== 'block' && !el.closest('h1, h2, h3, p, li p, .ProseMirror, [data-mark-label]')) {
      const line = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3
      if (r.height > line * 1.8 && el.getClientRects().length <= 1 && r.width < 160 && !el.querySelector('img, svg + svg')) bad.push(`folded ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    // Cut off text with no ellipsis, fade or clamp.
    if (leaf && !el.closest('.sr-only') && /(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis' && !s.maskImage?.includes('gradient') && !s.webkitMaskImage?.includes('gradient') && s.webkitLineClamp === 'none') bad.push(`cut off ${name(el)} ${el.scrollWidth}>${el.clientWidth}`)
  }
  // The title bar's buttons keep their size, never squeezed by a long page name.
  for (const b of document.querySelectorAll('header button, [data-chrome] ~ * button')) {
    const r = b.getBoundingClientRect()
    if (r.top > 60 || !r.width || !b.closest('header, [class*="drag"]')) continue
    if (b.getAttribute('aria-label') && r.width < 18) bad.push(`squeezed button "${b.getAttribute('aria-label')}" ${Math.round(r.width)}px`)
    const box = b.parentElement?.closest('span, div')
    if (box && getComputedStyle(box).overflow === 'hidden' && r.right > box.getBoundingClientRect().right + 1) bad.push(`button cut off "${b.getAttribute('aria-label')}"`)
  }
  // Anything open (a menu, a dialog) stays inside the window.
  for (const el of document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]')) {
    const r = el.getBoundingClientRect()
    if (r.width && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > innerHeight + 1)) bad.push(`off screen ${name(el)} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`)
  }
  return bad
})

const shoot = async (label) => { if (shots) await h.screenshot({ path: `${shots}/${label}.png` }) }
const sidebar = async (open) => {
  const shown = await h.evaluate(() => { const a = document.querySelector('aside[data-chrome]'); return !!a && a.getBoundingClientRect().width > 40 })
  if (shown !== open) { await h.keyboard.press('Meta+\\'); await h.waitForTimeout(500) }
}

const run = async (theme) => {
  for (const [w, hh] of SIZES) {
    await size(w, hh)
    for (const side of w < 1000 ? [true, false] : [true]) {
      await sidebar(side)
      for (const id of VIEWS) {
        if (only.length && !only.includes(id)) continue
        await go(id)
        const bad = await measure()
        const label = `${id}-${w}x${hh}${side ? '' : '-noside'}-${theme}`
        await shoot(label)
        check(`${label} lays out`, bad.length === 0, bad.slice(0, 4).join(' | '))
      }
      // Search, ⌘K.
      if (!only.length || only.includes('search')) {
        await h.keyboard.press('Meta+k'); await h.waitForTimeout(700)
        await h.keyboard.type('the'); await h.waitForTimeout(700)
        const bad = await measure()
        const label = `search-${w}x${hh}${side ? '' : '-noside'}-${theme}`
        await shoot(label)
        check(`${label} lays out`, bad.length === 0, bad.slice(0, 4).join(' | '))
        await h.keyboard.press('Escape'); await h.waitForTimeout(400)
      }
      // An open note: a nugget and an article.
      for (const tier of ['nugget', 'article']) {
        if (only.length && !only.includes(tier)) continue
        const one = (await items(tier))[0]
        if (!one) continue
        await send(tier, one.id); await h.waitForTimeout(1200)
        const bad = await measure()
        const label = `${tier}-${w}x${hh}${side ? '' : '-noside'}-${theme}`
        await shoot(label)
        check(`${label} lays out`, bad.length === 0, bad.slice(0, 4).join(' | '))
      }
    }
  }
}

try {
  await run('light')
  if (!process.env.LIGHT_ONLY) { await c.theme('midnight'); await run('dark') }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
