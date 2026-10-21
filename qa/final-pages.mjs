// The final pass over the main window's pages: every page and its looks
// (Home, Inbox, Everything, Writing, Gems, Questions, Goals, Queue, Tags and a
// tag's page, a group's page, Today as List, Page and Matrix, the Calendar as
// Day, Week and Month, Upcoming, Later, Routines, Practices, Review, Stats,
// Map, the Bin, Archived, Sources, "What Haligtree can do"), the sidebar's
// menus and ⌘K, with worst-case data (long titles, long tags, emoji, a long
// group name), measured at 900x700 and 1600x1000, in the Paper theme and a
// dark one, in each of the four styles. Fails on:
//   - a short label, chip or heading whose words are cut off
//   - anything reaching past the edge of the box that scrolls it, or the window
//   - a button or chip whose words wrap inside it
//   - a control smaller than 24px to press
// STYLES=soft,paper THEMES=paper SIZES=900x700 PAGES=home,today narrow a run.
// SHOTS=<dir> saves a picture of each page in each run. HOVER=1 also measures each page
// with the pointer resting on its first row, for the controls that show only then.
//   npx electron-vite build --outDir out-fp
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-fp/main/index.js MINDFLOW_QA_AWAY=1 node qa/final-pages.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const list = (name, all) => (process.env[name] ? process.env[name].split(',') : all)
const STYLES = list('STYLES', ['soft', 'brutal', 'paper', 'swiss'])
const THEMES = list('THEMES', ['paper', 'github'])
const SIZES = list('SIZES', ['900x700', '1600x1000']).map((one) => one.split('x').map(Number))

const LONG = 'Email the department about the extension for the Comparative Literature 302 essay on Frankenstein and the Romantic sublime'
const TAG = 'comparative-literature-and-critical-theory-seminar'
const EMOJI = '🎓📚✍️ Finish thesis chapter 4'

const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const faults = []
let visits = 0

/** Everything wrong with the page as it stands, measured. */
const measure = () => h.evaluate(() => {
  const out = []
  const name = (el) => {
    const bits = [el.tagName.toLowerCase()]
    for (const a of el.getAttributeNames()) if (a.startsWith('data-') && !/^data-(state|slot|side|align|orientation|radix|highlighted)/.test(a)) bits.push(`[${a}]`)
    return `${bits.slice(0, 3).join('')}"${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`
  }
  const W = innerWidth, H = innerHeight
  const LANES = '[data-cal-block], [data-cal-untimed], [data-cal-event], [data-cal-event-chip], [data-plan-task], [data-mark-flag], [data-cal-loose]'
  /** Seen: drawn, not faded out, not hidden from the reader, inside the window. */
  const seen = (el) => {
    if (el.closest('[inert], [aria-hidden=true], [hidden]')) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return false
    for (let up = el; up; up = up.parentElement) { const s = getComputedStyle(up); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false
      // Words for a screen reader only (sr-only), never drawn.
      if (/rect\(0px/.test(s.clip) || /inset\(50%/.test(s.clipPath)) return false }
    return true
  }
  /** The part of an element left showing once every clipping box above it has cut it. */
  const shown = (el) => {
    let { left, right, top, bottom } = el.getBoundingClientRect()
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      const s = getComputedStyle(up)
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const r = up.getBoundingClientRect()
        if (s.overflowX !== 'visible') { left = Math.max(left, r.left); right = Math.min(right, r.right) }
        if (s.overflowY !== 'visible') { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom) }
      }
      if (s.position === 'fixed') break
    }
    return { left, right, top, bottom }
  }
  // A dialog open over the page (⌘K) is what is seen: the page behind it is under its veil.
  const dialog = [...document.querySelectorAll('[role=dialog]')].filter((one) => one.getBoundingClientRect().width > 0).pop()
  const scope = dialog ?? document.body
  const all = [...scope.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement) && !el.closest('svg, canvas, .ProseMirror'))

  // 1. Words cut off: a short label, chip or heading that does not fit its box.
  for (const el of all) {
    const s = getComputedStyle(el)
    if (!(s.textOverflow === 'ellipsis' || s.overflowX === 'hidden' || s.overflowX === 'clip')) continue
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    if (el.scrollWidth <= el.clientWidth + 1 || !seen(el)) continue
    const text = el.innerText.trim()
    if (!text) continue
    // A rolling label draws two copies of itself and slides between them.
    if (el.closest('[data-roll], .slot-text, [class*="slot-text"]')) continue
    // A calendar's blocks keep the size of their time and day: a name there is cut to fit, whole on its card.
    if (el.closest(LANES)) continue
    // A long name in a narrow list row, cut with "…", whole in the row's own hover tip (its title).
    if (el.closest('[title]')?.getAttribute('title').includes(text.replace(/…$/, '').slice(0, 20)) && text.length > 16) continue
    // The top bar's page name gives way to the sandbox's own pill, which only these runs wear; the page says its name in full.
    if (el.closest('[data-pane-title]') && document.querySelector('[data-sandbox-pill]') && innerWidth < 1000) continue
    const heading = /^H[1-4]$/.test(el.tagName) || el.closest('h1, h2, h3, h4, header [data-title]')
    if (text.length <= 32 || heading) out.push(`cut: ${name(el)} ${el.clientWidth}<${el.scrollWidth}`)
  }
  // 1b. Words sliced by a box above them with no "…" to say so: the line runs past an edge that clips it.
  for (const el of all) {
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
    if (!texts.length || !seen(el) || el.closest(LANES)) continue
    const s = getComputedStyle(el)
    if (s.textOverflow === 'ellipsis') continue
    const range = document.createRange()
    let right = -Infinity, left = Infinity
    for (const n of texts) { range.selectNodeContents(n); for (const r of range.getClientRects()) if (r.width > 0) { right = Math.max(right, r.right); left = Math.min(left, r.left) } }
    if (right === -Infinity) continue
    for (let up = el; up && up !== document.body; up = up.parentElement) {
      const u = getComputedStyle(up)
      if (u.position === 'fixed') break
      if (u.overflowX === 'visible') continue
      // A box that scrolls shows the rest when scrolled; only a box that cuts is a fault.
      if (/auto|scroll/.test(u.overflowX) && up !== el) break
      const box = up.getBoundingClientRect()
      if (right > box.right + 1 || left < box.left - 1) { out.push(`sliced: ${name(el)} by ${name(up).slice(0, 30)} ${Math.round(right - box.right)}px`); break }
    }
  }

  // 1d. A page that stops short of the window's foot, leaving its bottom bar or edge floating.
  if (!dialog) for (const pane of document.querySelectorAll('[data-pane]')) {
    const r = pane.getBoundingClientRect()
    if (r.width > 0 && r.bottom < H - 24) out.push(`short: ${name(pane).slice(0, 30)} ends at ${Math.round(r.bottom)} of ${H}`)
  }
  // 1c. A box's hint (its placeholder) cut short.
  const pen = document.createElement('canvas').getContext('2d')
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (el.value || !seen(el) || el.tagName === 'TEXTAREA' && el.rows > 1) continue
    const s = getComputedStyle(el)
    pen.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    const need = pen.measureText(el.placeholder).width
    if (need > room + 2) out.push(`hint cut: ${name(el)} "${el.placeholder.slice(0, 40)}" ${Math.round(room)}<${Math.round(need)}`)
  }

  // 2. Past the edge: anything reaching outside the box that scrolls it, or outside the window.
  for (const box of all) {
    const s = getComputedStyle(box)
    if (!/auto|scroll/.test(s.overflowY) || box.scrollWidth <= box.clientWidth + 1 || /auto|scroll/.test(s.overflowX) && box.dataset.scrollX !== undefined) continue
    if (!seen(box) || box.clientWidth < 40) continue
    // A row of chips or cards meant to scroll sideways says so with snap or its own scrollbar style.
    if (s.scrollSnapType !== 'none' || box.closest('[data-scroll-sideways]')) continue
    const r = box.getBoundingClientRect()
    const past = [...box.querySelectorAll('*')].filter((kid) => { const k = kid.getBoundingClientRect(); return k.width > 0 && k.right > r.right + 1 && k.left < r.right && seen(kid) && ![...kid.children].some((g) => g.getBoundingClientRect().right > r.right + 1) })
    out.push(`spill: ${name(box)} scrolls sideways by ${box.scrollWidth - box.clientWidth}px; past it: ${past.slice(0, 2).map(name).join(' ; ')}`)
  }
  for (const el of all) {
    if (!seen(el)) continue
    const { left, right, top, bottom } = shown(el)
    if (right - left <= 0 || bottom - top <= 0) continue
    if (right > W + 1 || left < -1) out.push(`window: ${name(el)} ${Math.round(left)}..${Math.round(right)} of ${W}`)
  }
  if (document.documentElement.scrollWidth > W + 1) out.push(`window: the page scrolls sideways by ${document.documentElement.scrollWidth - W}px`)

  // 3. A button or chip whose words wrap inside it.
  const presses = [...scope.querySelectorAll('button, [role=button], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=tab], [role=radio], [role=option], [data-chip], a[href]')].filter((el) => !el.closest('.ProseMirror') && seen(el))
  for (const el of presses) {
    const text = el.innerText.trim()
    if (!text || text.length > 40 || el.closest('[data-roll]')) continue
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      // A title clamped to two lines (a card's) is meant to wrap.
      if (!n.textContent.trim() || n.parentElement.closest('[class*=line-clamp]')) continue
      const range = document.createRange(); range.selectNodeContents(n)
      const tops = new Set([...range.getClientRects()].filter((one) => one.width > 1).map((one) => Math.round(one.top / 4)))
      if (tops.size > 1) { out.push(`wraps: ${name(el)}`); break }
    }
  }

  // 4. Too small to press: under 24px either way, unless a hit area round it makes it bigger.
  for (const el of presses) {
    if (el.matches('a[href]') && !el.matches('button, [role]') && el.closest('p, li, .prose')) continue
    // A block on the calendar is as tall as its time: a quarter of an hour is short.
    if (el.matches('[data-cal-block]')) continue
    const r = el.getBoundingClientRect()
    if (r.width >= 23.5 && r.height >= 23.5) continue
    const grown = ['::before', '::after'].some((p) => { const s = getComputedStyle(el, p); if (s.content === 'none' || s.position !== 'absolute') return false; return parseFloat(s.top) < 0 || parseFloat(s.left) < 0 || parseFloat(s.width) >= 24 })
    if (grown) continue
    // A press inside a bigger press (a row's own small part) is reached by the row too.
    const inside = el.parentElement?.closest('button, [role=button], [role=menuitem], [role=option]')
    if (inside && inside.getBoundingClientRect().height >= 24) continue
    out.push(`small: ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  return [...new Set(out)]
})

const record = async (where) => {
  visits++
  const found = await measure().catch((e) => [`probe: ${e.message.slice(0, 120)}`])
  for (const one of found) faults.push(`${where}  ${one}`)
  console.log(`${found.length ? 'FAIL' : 'PASS'}  ${where}${found.length ? `\n      ${found.slice(0, 12).join('\n      ')}${found.length > 12 ? `\n      … and ${found.length - 12} more` : ''}` : ''}`)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/${where.replace(/[^\w-]+/g, '_')}.png` }).catch(() => {})
}

/** A look chip in a page's header, found by its name though its label rolls. */
const pickLook = async (label) => {
  const at = await h.evaluate((n) => [...document.querySelectorAll('header button[aria-pressed], [data-pane] button[aria-pressed]')].findIndex((one) => { const t = one.textContent.trim(); return t === n || [...t.slice(0, t.length / 2)].filter((_, i) => i % 2 === 0).join('') === n || t.startsWith(n) }), label)
  if (at < 0) return false
  await h.locator('header button[aria-pressed], [data-pane] button[aria-pressed]').nth(at).click(); await wait(900)
  return true
}
const escape = async () => { for (let i = 0; i < 2; i++) { await h.keyboard.press('Escape'); await wait(200) } await h.mouse.move(2, 400); await wait(200) }

let groupId = null
const PAGES = {
  home: () => go('home'), inbox: () => go('inbox'), everything: () => go('all'), writing: () => go('articles'), gems: () => go('nuggets'),
  questions: () => go('questions'), goals: () => go('goals'), queue: () => go('queue'), tags: () => go('tags'),
  tag: async () => { await c.send('tag', TAG); await wait(1000) },
  group: async () => {
    await go('articles')
    const head = h.locator(`[data-group-row="${groupId}"]`).first()
    if (!(await head.count())) return false
    await head.click({ button: 'right' }); await wait(400)
    const open = h.getByRole('menuitem', { name: 'Open as a page' })
    if (!(await open.count())) return false
    await open.click(); await wait(1200)
  },
  'today-list': async () => { await go('today'); await pickLook('List') },
  'today-page': async () => { await go('today'); if (!(await pickLook('Page'))) return false },
  'today-matrix': async () => { await go('today'); if (!(await pickLook('Matrix'))) return false },
  'calendar-day': async () => { await go('calendar'); await h.locator('[data-cal-view=day]').click(); await wait(900) },
  'calendar-week': async () => { await go('calendar'); await h.locator('[data-cal-view=week]').click(); await wait(900) },
  'calendar-month': async () => { await go('calendar'); await h.locator('[data-cal-view=month]').click(); await wait(900) },
  upcoming: () => go('upcoming'), later: () => go('later'), routines: () => go('routines'), practices: () => go('practices'),
  review: () => go('review'), stats: () => go('stats'), map: () => go('map'), bin: () => go('discarded'), archived: () => go('archived'),
  sources: () => go('sources'), powers: () => go('powers'),
  'sidebar-menu': async () => {
    await go('inbox')
    const row = h.locator('aside [aria-current=page], nav [aria-current=page]').first()
    if (!(await row.count())) return false
    await row.click({ button: 'right' }); await wait(500)
  },
  'sidebar-tag-menu': async () => {
    await go('home')
    const unfold = h.locator('button[aria-label="Show your tags"]')
    if (await unfold.count()) { await unfold.first().click(); await wait(600) }
    const row = h.locator('[data-side-tag]').first()
    if (!(await row.count())) return false
    await row.scrollIntoViewIfNeeded(); await row.click({ button: 'right' }); await wait(500)
  },
  'cmd-k': async () => { await go('home'); await h.keyboard.press('Meta+k'); await wait(700) },
  'cmd-k-typed': async () => { await go('home'); await h.keyboard.press('Meta+k'); await wait(500); await h.keyboard.type('thesis'); await wait(800) }
}
const ONLY = process.env.PAGES?.split(',')

try {
  await v('settings:set', { sounds: false, hintRate: 0, celebrate: false, sidebarGrows: false })
  await v('onboarding:set', { pageHints: false }).catch(() => {})
  const shown = (await v('settings')).sidebarShown ?? []
  await v('settings:set', { sidebarShown: [...new Set([...shown, 'nuggets', 'articles', 'questions', 'goals', 'queue', 'tags', 'sources', 'stats', 'map', 'discarded', 'archived', 'powers', 'later', 'routines', 'upcoming'])] })
  // Worst-case data beside the seed: a long task with a long tag, emoji, a long note, a long group, a long question and goal.
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const add = async (title, patch = {}) => { const made = await v('task:add', title); const id = made?.id ?? made; if (Object.keys(patch).length) await v('task:save', id, patch); return id }
  await add(`${LONG} #${TAG}`, { due: new Date(`${today}T10:00:00`).toISOString(), estimate: 600, important: 1 })
  await add(EMOJI, { due: new Date(`${today}T12:00:00`).toISOString(), estimate: 90 })
  await add('a', { due: new Date(`${today}T15:00:00`).toISOString(), estimate: 1 })
  await h.evaluate(([t, tag]) => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${t} #${tag} #日本語 #📚` }] }] } }), [LONG, TAG])
  const q = await v('question:new', 'What did Shelley’s creature learn from 📖 Milton, Plutarch and Volney, and why does it matter for the ending?')
  await v('question:pin', q?.id ?? q, true).catch(() => {})
  await v('goal:new', 'Hand in the Comparative Literature thesis with every chapter revised and the bibliography checked', 'Every chapter revised', null, null).catch(() => {})
  const notes = []
  for (const title of [LONG, 'Observer', 'Strategy', '日本語のノート']) { const id = await v('article:new'); await v('item:save', id, { title }); notes.push(id) }
  groupId = 'fp'
  const before = await v('groups', 'article').catch(() => [])
  await v('groups:arrange', 'article', { top: ['g:fp', notes[3]], groups: { fp: notes.slice(0, 3) }, make: { id: 'fp', name: 'Comparative Literature and Critical Theory reading for the seminar' } }).catch((e) => console.log('group', e.message))
  if (!before) groupId = null

  for (const style of STYLES) for (const theme of THEMES) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s) }, [theme, style])
    await h.reload(); await wait(2000)
    for (const [w, hh] of SIZES) {
      await c.size(w, hh)
      for (const [page, open] of Object.entries(PAGES)) {
        if (ONLY && !ONLY.includes(page)) continue
        const where = `${style}/${theme}/${w}x${hh}/${page}`
        let ok
        try { ok = await open() } catch (e) { ok = false; console.log(`      (${page}: ${e.message.split('\n')[0].slice(0, 100)})`) }
        if (ok === false) { faults.push(`${where}  could not open`); console.log(`FAIL  ${where}  could not open`); await escape(); continue }
        await wait(400)
        await record(where)
        // The controls a row shows only while pointed at (its ⋯, its tick, its Start), measured as they show.
        if (process.env.HOVER && !page.startsWith('cmd-k') && !page.startsWith('sidebar')) {
          const row = h.locator('[data-pane] [data-row], [data-pane] [data-day-line], [data-pane] li').first()
          if (await row.count() && await row.isVisible().catch(() => false)) { await row.hover().catch(() => {}); await wait(350); await record(`${where}:hover`) }
        }
        await escape()
      }
    }
  }
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
}
// The same fault on many runs is one fault: how often each was seen.
const kinds = new Map()
for (const one of faults) { const [where, ...rest] = one.split('  '); const key = `${where.split('/').pop()}  ${rest.join('  ')}`; kinds.set(key, (kinds.get(key) ?? 0) + 1) }
console.log(`\n${visits} views measured, ${faults.length} faults, ${kinds.size} distinct`)
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x  ${k}`)
process.exit(faults.length ? 1 : 0)
