// Wrapped, on the sandbox's month, read as a person reads it, in three parts (each fits one queue turn):
//   QA_PART=looks (the default): every card of each look (Files, Night), light and dark, wide (1280 x 800) and at the
//     smallest window (560 x 400), shot once its line has typed; frames every 50ms through an open, a turn and a close;
//     the bars and the close never move as cards turn; no word is cut, past the card's edge or inside any box it sits
//     in (a word cut short on purpose ends in "…"), and none runs under the card's own buttons; the sites card says
//     what the database holds, and so does the hours card (the hour ideas came most); two opens of one look differ.
//   QA_PART=worst: worst-case numbers (break-ui) laid over the real ones in each look, wide and small, with the same
//     word checks.
//   QA_PART=stats: Stats' "Sites it kept you off": its line, its big number and its labelled bars, by week and by
//     month, against the database, light and dark, wide and small.
//
//   QA_PART=looks QA_DATA=<a copy of a seeded sandbox> QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/tmp/x node qa/wrap-worlds.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const OUT = process.env.QA_SHOTS ?? '/tmp/wrap-shots'
const PART = process.env.QA_PART ?? 'looks'
mkdirSync(OUT, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { h } = c
/** A contact sheet of shots, three to a row (or `cols` of `width`), drawn by a hidden window of the app's own and never shown. */
const sheet = async (name, files, cols = 3, width = 560) => {
  const page = `${OUT}/${name}.html`
  const wide = cols * width + (cols - 1) * 3
  writeFileSync(page, `<!doctype html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${width}px);gap:3px;align-items:start">${files.map((file) => `<img src="file://${file}" style="width:${width}px;display:block">`).join('')}</body>`)
  const png = await c.electron.evaluate(async ({ BrowserWindow }, [page, wide]) => {
    const win = new BrowserWindow({ show: false, width: wide, height: 1400, webPreferences: { offscreen: true } })
    await win.loadFile(page)
    const height = await win.webContents.executeJavaScript('Promise.all([...document.images].map((one) => one.decode())).then(() => document.body.scrollHeight)')
    win.setContentSize(wide, Math.max(100, height))
    await new Promise((next) => setTimeout(next, 300))
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: wide, height })
    win.destroy()
    return shot.toPNG().toString('base64')
  }, [page, wide])
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(png, 'base64'))
}
const LOOKS = ['files', 'night']
const SIZES = [['wide', 1280, 800], ['small', 560, 400]]
const month = await h.evaluate(() => { const d = new Date(); if (d.getDate() < 7) d.setMonth(d.getMonth() - 1); return `month:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
const open = async (world, worst) => {
  await h.evaluate(([id, world, worst]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world, worst } })), [month, world, worst])
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
}
const close = async () => { await h.keyboard.press('Escape'); await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 }) }
const film = async (name, ms) => { for (let t = 0; t < ms; t += 50) await h.screenshot({ path: `${OUT}/${name}-${String(t).padStart(4, '0')}.png` }) }
const chrome = () => h.evaluate(() => [...document.querySelectorAll('[data-wrap-story] [aria-label^="Card "], [data-wrap-story] [aria-label="Close"]')].map((el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}` }).join(' '))
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n.toLocaleString('en')} times`)

/**
 * Every word on the card that is cut: a line's box reaching past any box above it that clips (overflow other than
 * visible), up to the card itself. A box that cuts with "…" (text-overflow, line-clamp) says so, so its words are
 * kept to it and read on from there. Also every word under the card's own buttons and its name at the foot.
 */
const cutWords = () => h.evaluate(() => {
  const card = document.querySelector('[data-wrap-card]')
  if (!card) return ['no card']
  const found = []
  const marked = (one) => { const s = getComputedStyle(one); return s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none') }
  const foot = [...document.querySelectorAll('[data-wrap-keep] button, [data-wrap-brand]')].map((one) => one.getBoundingClientRect())
  const lines = []
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim()
    const el = node.parentElement
    if (!text || el.closest('[aria-hidden="true"], [data-picture-row], [data-wrap-keep], [data-wrap-brand], svg')) continue
    let hidden = false
    for (let up = el; up && up !== card.parentElement; up = up.parentElement) { const s = getComputedStyle(up); if (s.visibility === 'hidden' || Number(s.opacity) < 0.05) { hidden = true; break } }
    if (hidden) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    let rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }))
    let cut = null
    for (let box = el; box && !cut; box = box === card ? null : box.parentElement) {
      const s = getComputedStyle(box)
      const [x, y] = [s.overflowX !== 'visible', s.overflowY !== 'visible']
      if (!x && !y) continue
      const b = box.getBoundingClientRect()
      if (marked(box)) { rects = rects.map((r) => ({ left: Math.max(r.left, b.left), right: Math.min(r.right, b.right), top: Math.max(r.top, b.top), bottom: Math.min(r.bottom, b.bottom) })); continue }
      if (rects.some((r) => (x && (r.left < b.left - 1 || r.right > b.right + 1)) || (y && (r.top < b.top - 1 || r.bottom > b.bottom + 1)))) cut = box === card ? 'the card' : `${box.tagName.toLowerCase()}${box.className ? `.${String(box.className).split(' ')[0]}` : ''}`
    }
    // Lines of one heading or paragraph may touch by their leading: only different blocks count as over each other.
    let block = el
    while (block !== card && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement
    for (const r of rects) lines.push({ node, block, text, r })
    if (cut) found.push(`"${text.slice(0, 28)}" cut by ${cut}`)
    else if (rects.some((r) => foot.some((f) => r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top))) found.push(`"${text.slice(0, 28)}" under the foot`)
  }
  // A chart or the folder reaching down under the card's foot.
  for (const one of card.querySelectorAll('[data-wrap-rows] > *, [data-wrap-folder], [data-wrap-calendar] > *, [data-wrap-days] > *')) {
    const r = one.getBoundingClientRect()
    if (foot.some((f) => r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top) || r.bottom > card.getBoundingClientRect().bottom - 4) found.push(`${one.closest('[data-wrap-folder]') ? 'the folder' : 'a chart'} reaches the foot`)
  }
  // Words over words: two lines of different text laid on each other (a list grown up over its heading).
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i], lines[j]]
      if (a.block === b.block || a.block.contains(b.block) || b.block.contains(a.block)) continue
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      if (x > 2 && y > 3) { found.push(`"${a.text.slice(0, 20)}" over "${b.text.slice(0, 20)}"`); break }
    }
  return found
})

/** Every card in turn, by key; each shot once its typing is done; the words checked on each. */
const walk = async (name, extra) => {
  const kinds = []
  const boxes = new Set()
  const cuts = []
  const files = []
  const shown = []
  for (let i = 0; i < 14; i++) {
    const kind = await h.getAttribute('[data-wrap-card]', 'data-wrap-card')
    if (kinds.includes(kind)) break
    kinds.push(kind)
    await wait(kind === 'intro' || kind === 'outro' ? 3400 : kind === 'pictures' ? 4500 : 1700)
    if (kind === 'pictures') shown.push(await h.evaluate(() => { const row = document.querySelector('[data-wrap-flow] [data-picture-row]'); return row ? `${row.dataset.pictureRow} ${row.getBoundingClientRect().height}px ${row.dataset.pictureRow === 'still' || !!row.querySelector('[data-picture-row-shown]') ? 'drawn' : 'empty'}` : 'none' }))
    boxes.add(await chrome())
    // The card alone, so its words can be read on the sheet.
    files.push(`${OUT}/${name}-${String(i).padStart(2, '0')}-${kind}.png`)
    await h.screenshot({ path: files.at(-1), clip: await h.locator('[data-wrap-card]').boundingBox() })
    for (const one of await cutWords()) cuts.push(`${kind}: ${one}`)
    if (extra) await extra(kind, i)
    await h.keyboard.press('ArrowRight')
    await wait(80)
  }
  await sheet(`sheet-${name}`, files)
  return { kinds, still: boxes.size === 1, cuts, shown }
}

try {
  if (PART === 'looks') {
    // What the database holds for the month's sites: the card must say the same.
    const [from, until] = await h.evaluate((id) => { const [y, m] = id.slice(6).split('-').map(Number); return [new Date(y, m - 1, 1).toISOString(), new Date(y, m, 1).toISOString()] }, month)
    const rows = await h.evaluate((since) => window.api.haligtree('site-block:since', since), from)
    const sum = new Map()
    for (const row of rows) if (row.at >= from && row.at < until) sum.set(row.site, (sum.get(row.site) ?? 0) + row.count)
    const [site, count] = [...sum].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? []
    check('the sandbox month holds sites sent away', !!site, JSON.stringify([...sum]))
    // The hour ideas came most, from the database by the same rule as the card (8 or more, one hour clearly ahead).
    const hours = (await h.evaluate((since) => window.api.haligtree('recap', 'month', since), from)).hours
    const order = hours.map((n, hour) => [n, hour]).sort((a, b) => b[0] - a[0])
    const peak = hours.reduce((sum, n) => sum + n, 0) >= 8 && order[0][0] > order[1][0] ? order[0] : null
    console.log(`(the month's captures by hour: ${hours.join(' ')}; the thinking hour ${peak ? `${peak[1]}:00, ${peak[0]}` : 'none'})`)
    for (const look of ['light', 'dark'])
      for (const world of LOOKS)
        for (const [size, w, hh] of SIZES) {
          await c.size(w, hh)
          await c.look(look)
          await open(world)
          const first = look === 'light' && size === 'wide'
          if (first) await film(`${world}-open`, 600)
          let said = null
          let hourCard = null
          const { kinds, still, cuts, shown } = await walk(`${world}-${look}-${size}`, async (kind, i) => {
            if (kind === 'sites') said = await h.locator('[data-wrap-card] h2').first().innerText()
            if (kind === 'hours') hourCard = `${(await h.locator('[data-wrap-card] h2').first().innerText()).replace(/\s+/g, ' ')} | ${await h.locator('[data-wrap-hours] [data-wrap-peak]').innerText()} | ${await h.locator('[data-wrap-hours] > div:first-child > div').count()} bars`
            if (first && i === 2) {
              // A click on the left third turns back, with motion; then on again by key, still.
              const card = await h.locator('[data-wrap-card]').boundingBox()
              await h.mouse.click(card.x + 8, card.y + card.height - 30)
              await film(`${world}-turn-back`, 450)
              await h.keyboard.press('ArrowRight')
            }
          })
          const tag = `${world} ${look} ${size}`
          check(`${tag}: intro first, report last, the sites card among them`, kinds[0] === 'intro' && kinds.at(-1) === 'report' && kinds.includes('sites'), kinds.join(' '))
          check(`${tag}: the sites card says "Kept you off ${site} ${times(count)} this month"`, said?.replace(/\s+/g, ' ') === `Kept you off ${site} ${times(count)} this month`, said)
          if (peak) check(`${tag}: the hours card says “Ideas came most around ${peak[1]}:00” over 24 bars, ${peak[0]} lit`, hourCard === `Ideas came most around ${peak[1]}:00 | ${peak[0]} | 24 bars` || (!hourCard && kinds.length === 12), hourCard ?? `left out of a full story: ${kinds.join(' ')}`)
          check(`${tag}: the pictures card shows its row of pictures and gems`, shown.length === 1 && shown[0].endsWith('drawn'), shown.join(' '))
          check(`${tag}: no word cut, over another or under the foot, on any card`, !cuts.length, cuts.join('; '))
          check(`${tag}: the bars and the close never move as cards turn`, still)
          check(`${tag}: "Copy as image" on the last card`, await h.locator('[data-wrap-copy]').isVisible())
          const box = await h.locator('[data-wrap-card]').boundingBox()
          check(`${tag}: card ${size === 'wide' ? 'wide, under 86%' : 'fills the window'}`, size === 'wide' ? box.width > box.height && box.width <= 1280 * 0.86 + 1 : box.width >= 559 && box.x === 0, JSON.stringify(box))
          await h.keyboard.press('Escape')
          if (first) await film(`${world}-close`, 300)
          await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 })
        }
    await c.size(1280, 800)
    await c.look('light')
    // Two opens of one look differ (palette, layout or lines).
    const looks = []
    for (const n of [1, 2]) { await open('files'); await wait(1200); await h.screenshot({ path: `${OUT}/files-twice-${n}.png` }); looks.push(await h.locator('[data-wrap-card]').evaluate((el) => el.style.background + el.textContent)); await close() }
    check('two opens of Files are not the same', looks[0] !== looks[1])
    // Beside the reference each look was drawn from (QA_REFS: Spotify Wrapped 2025's files for Files, 2023's night for Night).
    if (process.env.QA_REFS) for (const [world, ref] of [['files', 'v1.jpg'], ['night', 'v3.jpg']]) await sheet(`beside-${world}`, [`${process.env.QA_REFS}/${ref}`, `${OUT}/sheet-${world}-light-wide.png`, `${OUT}/sheet-${world}-light-small.png`], 3, 700)
  }

  if (PART === 'worst') {
    // break-ui: the worst a real month could hold, in each look.
    const tags500 = Array.from({ length: 500 }, (_, i) => ({ name: `chapter-${i + 1}`, n: 500 - i }))
    const sites50 = Array.from({ length: 50 }, (_, i) => ({ site: `site-number-${i + 1}.example.com`, count: 50 - i }))
    const WORST = {
      empty: { captures: 0, tags: [], minutes: 0, sessions: 0, focusTasks: [], planned: 0, did: 0, planRows: [], pictures: [], notes: [], gems: 0, run: 0, busiest: null, well: [], kind: 'Quiet', sites: [], busy: [], days: {}, thin: true, pages: [] },
      one: { captures: 1, tags: [{ name: 'reading', n: 1 }], minutes: 1, sessions: 1, run: 2, notes: ['Meditations'], gems: 1, sites: [{ site: 'x.com', count: 1 }] },
      many: { captures: 12345, tags: tags500, notes: tags500.map((t) => `Notes on ${t.name}`), sites: sites50 },
      long: { tags: [{ name: 'the-history-of-the-byzantine-empire-and-its-neighbours-notes', n: 9 }, { name: 'reading', n: 3 }], notes: ['The History of the Decline and Fall of the Roman Empire, Volume the Sixth'], well: ['Finished the first draft of the long chapter on the Byzantine succession, all forty pages of it, before the deadline.'], sites: [{ site: 'news.ycombinator.com', count: 12345 }, { site: 'a-very-long-subdomain.of-a-long-site-name.example.org', count: 3 }], focusTasks: [{ name: 'Write the long chapter on the Byzantine succession and its forty pages of notes', minutes: 12345 }] },
      big: { minutes: 12345, sessions: 412, run: 31, captures: 12345, planned: 12345, did: 9876 }
    }
    // QA_WORST=long,big runs only those (a rerun of part of the list).
    for (const [name, worst] of Object.entries(WORST).filter(([name]) => !process.env.QA_WORST || process.env.QA_WORST.split(',').includes(name)))
      for (const world of LOOKS)
        for (const [size, w, hh] of SIZES) {
          await c.size(w, hh)
          await open(world, worst)
          let opening = ''
          const { kinds, cuts } = await walk(`worst-${name}-${world}-${size}`, async (kind) => void ((kind === 'intro' || kind === 'quiet') && (opening = await h.locator('[data-wrap-card]').innerText())))
          check(`worst ${name}, ${world} ${size}: every card shows, no word cut, over another or under the foot`, kinds.at(-1) === (name === 'empty' ? 'quiet' : 'report') && !cuts.length, `${kinds.join(' ')}; ${cuts.join('; ')}`)
          // Too little to tell: one honest card, no report of empty tiles and nothing offered to share (the user, 22 Nov).
          if (name === 'empty') check(`worst empty, ${world} ${size}: one card says there is not much to wrap, with no share buttons`, kinds.length === 1 && /Not much to wrap/.test(opening) && !(await h.locator('[data-wrap-copy], [data-wrap-save]').count()), `${kinds.join(' ')}; ${opening.replace(/\s+/g, ' ')}`)
          await close()
        }
  }

  if (PART === 'stats') {
    // Stats' "Your month" holds the focus sections; the sites one among them.
    const DAY = 86_400_000
    const rows = await h.evaluate(() => window.api.haligtree('site-block:since', new Date(Date.now() - 400 * 86_400_000).toISOString()))
    const span = (from, to) => { const sum = new Map(); for (const row of rows) if (row.at >= from && row.at < to) sum.set(row.site, (sum.get(row.site) ?? 0) + row.count); return [...sum].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) }
    const [week, monthStart] = await h.evaluate(() => { const d = new Date(); d.setHours(0, 0, 0, 0); const m = new Date(d.getFullYear(), d.getMonth(), 1); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [d.toISOString(), m.toISOString()] })
    const far = new Date(Date.now() + DAY).toISOString()
    const expect = { weeks: span(week, far), months: span(monthStart, far) }
    for (const [size, w, hh] of SIZES) {
      await c.size(w, hh)
      await c.go('stats')
      await h.locator('button[aria-label="Your month"]').first().click()
      await h.waitForSelector('[data-group="Sites it kept you off"]', { timeout: 10000 })
      const section = h.locator('[data-group="Sites it kept you off"]')
      for (const unit of ['weeks', 'months']) {
        if (unit === 'months') { await section.locator('button', { hasText: 'Months' }).click(); await wait(500) }
        const [site, count] = expect[unit][0] ?? []
        const total = expect[unit].reduce((n, one) => n + one[1], 0)
        await section.scrollIntoViewIfNeeded()
        await wait(700)
        const said = (await section.locator('[data-sites-said]').innerText()).replace(/\s+/g, ' ')
        const big = await section.locator('.mf-big-number').innerText()
        const labels = await section.locator('[data-bar-label]').allInnerTexts()
        const bars = await section.locator('[data-sites-chart] [data-mark]').count()
        const ranked = await section.locator('[data-site-row]').allInnerTexts()
        const name = unit === 'weeks' ? 'This week' : 'This month'
        check(`Stats ${size}, ${unit}: the line says "${name} it kept you off ${site} ${times(count)}"`, said.startsWith(`${name} it kept you off ${site} ${times(count)}`), said)
        check(`Stats ${size}, ${unit}: the big number is ${total}, the ${unit.slice(0, -1)}'s whole`, big.replace(/,/g, '') === String(total), big)
        check(`Stats ${size}, ${unit}: every bar with any wears its count`, bars > 0 && labels.length === bars, `${bars} bars, labels ${labels.join(' ')}`)
        check(`Stats ${size}, ${unit}: the sites ranked with their counts, most first`, ranked.length === Math.min(5, expect[unit].length) && ranked[0].replace(/\s+/g, ' ').includes(`${site} ${times(count)}`), ranked.join(' | '))
        for (const look of ['light', 'dark']) { await c.look(look); await section.screenshot({ path: `${OUT}/stats-sites-${unit}-${look}-${size}.png` }) }
        await c.look('light')
      }
      const sideways = await h.evaluate(() => document.querySelector('[data-group="Sites it kept you off"]').scrollWidth > document.querySelector('[data-group="Sites it kept you off"]').clientWidth + 1)
      check(`Stats ${size}: the sites section never scrolls sideways`, !sideways)
      await section.locator('button', { hasText: 'Weeks' }).click()
    }
  }
} finally {
  await c.close()
}
done()
