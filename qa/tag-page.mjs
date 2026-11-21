// A tag's own page, as a finished list page beside Gems and Sources: no
// cover card beside its name (a tag has no cover), a faded wash of the newest
// picture behind the head only when its notes have one (the count line still
// reads at 4.5:1 on it), the head and toolbar held at the top in one opaque
// band as the rows scroll (never over the first row at rest, the name set on
// one smaller line as it sticks, nothing but the scroll moving), its count saying
// what it counts, List by default, one left edge for head, toolbar and rows,
// nothing wider than the page at 560, 1280 and 1920, at 5, 50, 500 and 5,000
// notes, light and dark. Then every control to its end: ↓ and ↵ open a note
// and ⌘[ comes back, ⌘A picks and Esc lets go, a right click has "Read from
// here", Filter narrows, Stream and List swap, Read through opens and Esc
// shuts it, Study and ⋯ open their menus (no Backdrop), an "Often with" tag
// opens its page, and Read or Manage are steps ⌘[ and ⌘] walk.
//
//   npx electron-vite build --outDir out-tag
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-tag/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/tag-page.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { deflateSync } from 'zlib'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// Seeded on a closed sandbox: four tags at four sizes, mixed captures and gems, one note carrying a long run of tags.
let c = await sandbox({ width: 1280, height: 860 })
await c.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
const doc = (...lines) => JSON.stringify({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const words = (n, s = 0) => Array.from({ length: n }, (_, i) => ['slow', 'river', 'light', 'stone', 'paper', 'garden', 'letter', 'window', 'supercalifragilisticexpialidocious'][(i + s) % 9]).join(' ')
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
db.exec('begin')
let n = Number(db.prepare('select coalesce(max(number), 0) as n from captures').get().n)
const cap = db.prepare("insert into captures (id, number, title, kind, status, body, captured_at) values (?, ?, '', 'note', 'open', ?, ?)")
const gem = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', ?, ?, ?, ?)")
for (const size of [5, 50, 500, 5000]) {
  for (let i = 0; i < size; i++) {
    const extra = i === 1 ? ' #vocabulary #research #youtube #maliketh #idea #reading #history #a-very-long-tag-name-that-goes-on' : i % 7 === 0 ? ' #often' : ''
    if (i % 3 === 0) gem.run(randomUUID(), `${words(4, i)} ${i}`, doc(`${words(30, i)} #scale${size}${extra}`), ago(i * 41), ago(i * 41))
    else cap.run(randomUUID(), ++n, doc(`${words(i === 2 ? 60 : 8, i)} ${i}`, `${words(40, i)} #scale${size}${extra}`), ago(i * 37))
  }
}
// A loud picture, the worst a wash can be under grey words: black, white and full colours in stripes and checks.
const png = (w, hh, at) => {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td)); return Buffer.concat([len, td, sum]) }
  const raw = Buffer.alloc((w * 3 + 1) * hh)
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) raw.set(at(x, y), y * (w * 3 + 1) + 1 + x * 3)
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(hh, 4); head[8] = 8; head[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const COLOURS = [[0, 0, 0], [255, 255, 255], [220, 20, 30], [20, 40, 220], [255, 220, 0], [0, 160, 60], [40, 40, 40]]
const loud = png(160, 100, (x, y) => ((Math.floor(x / 12) + Math.floor(y / 12)) % 3 === 0 ? COLOURS[(x * 7 + y) % 2] : COLOURS[Math.floor(x / 23) % COLOURS.length]))
const name = `${createHash('sha256').update(loud).digest('hex')}.png`
mkdirSync(join(process.env.QA_DATA, 'sandbox', 'assets'), { recursive: true })
writeFileSync(join(process.env.QA_DATA, 'sandbox', 'assets', name), loud)
const pictured = (text) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'image', attrs: { src: `haligtree://assets/${name}` } }] })
for (let i = 0; i < 60; i++) cap.run(randomUUID(), ++n, i === 0 ? pictured(`${words(12, i)} #pictured`) : doc(`${words(10, i)} ${i}`, `${words(30, i)} #pictured`), ago(i * 13))
db.exec('commit')
db.close()

c = await sandbox({ width: 1280, height: 860 })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const open = async (tag) => { await send('tag', tag); await h.waitForSelector('[data-tag-page]', { timeout: 15000 }).catch(() => {}); await wait(800) }
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const key = async (one) => { await blur(); await h.keyboard.press(one); await wait(600) }
const measure = () => h.evaluate(() => {
  const page = document.querySelector('[data-tag-page]')
  if (!page) return null
  const box = page.getBoundingClientRect()
  const left = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null)
  const titleWords = document.querySelector('[data-tag-title]')
  const firstIcon = document.querySelector('[data-tag-list] [data-row] > :first-child') ?? document.querySelector('[data-tag-stream] article')
  const wide = [...page.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > box.right + 1 }).map((el) => el.tagName + '.' + String(el.className).slice(0, 40))
  let scroller = page.parentElement
  while (scroller && !(scroller.scrollHeight > scroller.clientHeight && getComputedStyle(scroller).overflowY !== 'visible')) scroller = scroller.parentElement
  return {
    head: left(titleWords), toolbar: left(document.querySelector('[data-tag-toolbar]')), row: left(firstIcon),
    wide: wide.slice(0, 3), sideways: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false,
    // A cover card is any picture in the band but the wash; the wash is the one behind it all.
    cover: [...page.querySelectorAll('[data-tag-band] img, [data-tag-head] img')].filter((one) => !one.closest('[data-backdrop]')).length,
    wash: page.querySelectorAll('[data-backdrop]').length,
    count: document.querySelector('[data-tag-held]')?.textContent ?? '', list: !!document.querySelector('[data-tag-list]'),
    rows: document.querySelectorAll('[data-tag-list] [data-row]').length, titleSize: titleWords ? parseFloat(getComputedStyle(titleWords).fontSize) : 0
  }
})
try {
  await h.evaluate(() => localStorage.removeItem('tag:look'))
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    for (const [w, hh] of [[1280, 860], [560, 700], [1920, 1080]]) {
      await c.size(w, hh)
      for (const size of [5, 50, 500, 5000]) {
        const started = Date.now()
        await open(`scale${size}`)
        const m = await measure()
        if (!m) { check(`${theme} ${w} #scale${size}: the page shows`, false); continue }
        const tag = `${theme} ${w} #scale${size}`
        check(`${tag}: no cover card, and no wash when no note has a picture`, m.cover === 0 && m.wash === 0, `cover ${m.cover}, wash ${m.wash}`)
        check(`${tag}: List is the default`, m.list)
        check(`${tag}: the count says what it counts`, new RegExp(`^${size.toLocaleString('en')} notes with #scale${size}$`).test(m.count.replace(/\s/g, ' ')), m.count)
        check(`${tag}: nothing wider than the page, no sideways scroll`, !m.wide.length && !m.sideways, m.wide.join(' | '))
        check(`${tag}: head, toolbar and rows on one left edge`, m.head !== null && Math.abs(m.head - m.toolbar) <= 2 && Math.abs(m.head - m.row) <= 14, `head ${m.head}, toolbar ${m.toolbar}, row ${m.row}`)
        if (size === 5000) check(`${tag}: only the rows in view are drawn, shown in ${Date.now() - started}ms`, m.rows > 0 && m.rows < 200, `${m.rows} rows`)
        await h.screenshot({ path: `${dir}/after-${theme}-${w}-${size}.png` })
      }
    }
  }
  // The band: the head and toolbar held at the top, opaque, never over the first row at rest; the name smaller on one line once held.
  const band = () => h.evaluate(() => {
    const el = document.querySelector('[data-tag-band]')
    const page = document.querySelector('[data-tag-page]')
    let scroller = page.parentElement
    while (scroller && getComputedStyle(scroller).overflowY === 'visible') scroller = scroller.parentElement
    const r = (one) => { const b = one?.getBoundingClientRect(); return b ? { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, left: Math.round(b.left), height: Math.round(b.height * 10) / 10 } : null }
    const firstRow = document.querySelector('[data-tag-list] [data-row]') ?? document.querySelector('[data-tag-stream] article')
    const rows = [...document.querySelectorAll('[data-tag-list] [data-row]')]
    const under = rows.find((one) => one.getBoundingClientRect().top > el.getBoundingClientRect().bottom + 4)
    return {
      band: r(el), top: Math.round(scroller.getBoundingClientRect().top * 10) / 10, scroll: scroller.scrollTop, stuck: el.hasAttribute('data-stuck'),
      bg: getComputedStyle(el).backgroundColor, title: r(document.querySelector('[data-tag-title]')), meta: r(document.querySelector('[data-tag-meta]')),
      toolbar: r(document.querySelector('[data-tag-toolbar]')), first: r(firstRow), under: under ? { id: under.getAttribute('data-id'), ...r(under) } : null,
      shadow: getComputedStyle(el).boxShadow
    }
  })
  const scrollTo = (y) => h.evaluate((to) => { const page = document.querySelector('[data-tag-page]'); let s = page.parentElement; while (s && getComputedStyle(s).overflowY === 'visible') s = s.parentElement; s.scrollTop = to }, y).then(() => wait(120))
  const opaque = (bg) => { const m = bg.match(/[\d.]+/g); return !!m && (m.length < 4 || Number(m[3]) === 1) && !/transparent/.test(bg) }
  for (const theme of ['light', 'dark']) {
    for (const [w, hh] of [[1440, 900], [560, 700]]) {
      await c.look(theme); await c.size(w, hh)
      for (const tag of ['scale500', 'pictured']) {
        await open(tag)
        const at = `${theme} ${w} #${tag}`
        const rest = await band()
        check(`${at}: at rest the band sits at the top, not held, and the first row starts under it`, Math.abs(rest.band.top - rest.top) <= 1 && !rest.stuck && rest.first.top >= rest.band.bottom - 0.5, `band ${rest.band.top}-${rest.band.bottom}, first row ${rest.first.top}`)
        check(`${at}: the band is opaque in the page's colour`, opaque(rest.bg), rest.bg)
        await h.screenshot({ path: `${dir}/band-${theme}-${w}-${tag}-rest.png` })
        // Scrolled 10px at a time through the rise: the rows move by the scroll alone, never jumping.
        let jumps = []
        let before = rest
        for (let y = 10; y <= 120; y += 10) {
          await scrollTo(y)
          const now = await band()
          if (before.under && now.under && before.under.id === now.under.id && Math.abs((before.under.top - now.under.top) - (now.scroll - before.scroll)) > 0.6) jumps.push(`${y}: ${before.under.top}→${now.under.top}`)
          if (Math.abs(now.meta.height - rest.meta.height) > 0.5 || Math.abs(now.toolbar.height - rest.toolbar.height) > 0.5) jumps.push(`${y}: a line changed height`)
          before = now
        }
        check(`${at}: scrolling into the hold moves the rows by the scroll and nothing else`, !jumps.length, jumps.slice(0, 3).join(' | '))
        await scrollTo(2000)
        const held = await band()
        check(`${at}: after 2,000px the band is held at the top with a hairline`, held.scroll >= 1500 && held.band.bottom > held.top + 40 && held.title.top >= held.top - 0.5 && held.stuck && held.shadow !== 'none', `band ${held.band.top}-${held.band.bottom}, title ${held.title.top}, scroll ${held.scroll}`)
        check(`${at}: held, the name is one line about 1.25rem tall`, held.title.height <= 30 && held.title.height >= 18, `${held.title.height}px`)
        check(`${at}: held, the count line and the toolbar stay whole and in view`, held.meta.top >= held.top && held.toolbar.bottom <= held.band.bottom + 0.5 && Math.abs(held.toolbar.height - rest.toolbar.height) < 0.5, `meta ${held.meta.top}, toolbar ${held.toolbar.top}-${held.toolbar.bottom}`)
        check(`${at}: held, the band is still opaque`, opaque(held.bg), held.bg)
        await h.screenshot({ path: `${dir}/band-${theme}-${w}-${tag}-held.png` })
        await scrollTo(2600)
        const later = await band()
        check(`${at}: further down nothing in the band moves`, later.band.top === held.band.top && later.toolbar.top === held.toolbar.top && later.title.top === held.title.top)
        await scrollTo(0)
        const back = await band()
        check(`${at}: back at the top it is as it was`, JSON.stringify([back.band, back.title, back.meta, back.toolbar, back.first]) === JSON.stringify([rest.band, rest.title, rest.meta, rest.toolbar, rest.first]) && !back.stuck)
      }
    }
  }

  // The wash: there with a picture, loaded, behind the head; the count line reads at 4.5:1 on its worst pixel, light and dark.
  await c.size(1440, 900)
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    await open('pictured')
    const m = await measure()
    const loaded = await h.evaluate(() => { const one = document.querySelector('[data-backdrop] img'); return one ? one.complete && one.naturalWidth > 0 : false })
    check(`${theme}: #pictured has the wash behind its head and no cover card`, m.wash === 1 && m.cover === 0 && loaded, `wash ${m.wash}, cover ${m.cover}, loaded ${loaded}`)
    const meta = await h.locator('[data-tag-meta]').boundingBox()
    await h.evaluate(() => document.querySelector('[data-tag-meta]').style.setProperty('visibility', 'hidden'))
    const shot = await h.screenshot({ clip: meta })
    await h.evaluate(() => document.querySelector('[data-tag-meta]').style.removeProperty('visibility'))
    const worst = await h.evaluate(async (data) => {
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      // The line's grey as drawn: its computed colour painted and read back.
      const probe = document.querySelector('[data-tag-meta] > span.whitespace-nowrap') ?? document.querySelector('[data-tag-meta]')
      ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0, 0, 1, 1)
      const ink = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
      const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode()
      const big = document.createElement('canvas'); big.width = img.width; big.height = img.height
      const g = big.getContext('2d'); g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, img.width, img.height).data
      let low = Infinity
      for (let i = 0; i < px.length; i += 4) {
        const a = lum(ink), b = lum([px[i], px[i + 1], px[i + 2]])
        low = Math.min(low, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))
      }
      return Math.round(low * 100) / 100
    }, shot.toString('base64'))
    check(`${theme}: the count line reads at 4.5:1 or more on the wash's worst pixel`, worst >= 4.5, `${worst}:1`)
    await h.screenshot({ path: `${dir}/wash-${theme}-1440.png` })
  }

  // Frames through the hold and back, a wheel step each 50ms, for reading by eye.
  mkdirSync(`${dir}/frames`, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await c.look(theme); await open('pictured')
    await h.mouse.move(1000, 600)
    for (let i = 0; i < 24; i++) {
      await h.mouse.wheel(0, i < 12 ? 12 : -12); await wait(50)
      await h.screenshot({ path: `${dir}/frames/stick-${theme}-${String(i).padStart(2, '0')}.png`, clip: { x: 560, y: 80, width: 880, height: 360 } })
    }
  }

  // Reduce motion: the name is set small at the first scroll, never shrinking along with it.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await open('scale500')
  await scrollTo(8)
  const reduced = await band()
  await scrollTo(0)
  const reducedBack = await band()
  check('with Reduce motion the name is small at once on the first scroll, and big again at the top', reduced.title.height <= 30 && reducedBack.title.height > 30, `${reduced.title.height}px, then ${reducedBack.title.height}px`)
  await h.emulateMedia({ reducedMotion: 'no-preference' })

  // A row reached with ↓ stops under the band, never behind it.
  await c.look('dark'); await open('scale500')
  await h.mouse.move(5, 5)
  await blur()
  // Down far enough that the page scrolls, then back up: each row the cursor climbs to is scrolled in at the top.
  for (let i = 0; i < 40; i++) (await h.keyboard.press('ArrowDown'), await wait(40))
  for (let i = 0; i < 30; i++) (await h.keyboard.press('ArrowUp'), await wait(40))
  await wait(500)
  const cursorRow = await h.evaluate(() => { const one = document.querySelector('[data-tag-list] [data-cursor]'); const b = document.querySelector('[data-tag-band]').getBoundingClientRect(); return one ? { top: one.getBoundingClientRect().top, band: b.bottom } : null })
  check('a row reached with the keys after scrolling is never under the band', !!cursorRow && cursorRow.top >= cursorRow.band - 1, JSON.stringify(cursorRow))
  await scrollTo(0)

  await c.look('dark')
  await c.size(1280, 860)
  await open('scale50')

  // Keys: ↓ puts the cursor on a row, ↵ opens it, ⌘[ comes back to the tag.
  await h.mouse.move(5, 5)
  await key('ArrowDown')
  check('↓ puts the cursor on the first row', await h.locator('[data-tag-list] [data-cursor]').count() === 1)
  await key('ArrowDown')
  const second = await h.evaluate(() => document.querySelector('[data-tag-list] [data-cursor]')?.getAttribute('data-id'))
  await key('Enter')
  check('↵ opens the row under the cursor', !(await h.locator('[data-tag-page]').count()), second)
  await key('Meta+BracketLeft')
  await wait(800)
  check('⌘[ comes back to the tag page', await h.locator('[data-tag-page]').count() === 1)

  // ⌘A picks every row, Esc lets them go.
  await key('Meta+a')
  const bar = await h.locator('[data-picked-bar]').textContent().catch(() => '')
  check('⌘A picks all 50', /50 selected/.test(bar ?? ''), bar)
  await key('Escape')
  check('Esc lets them go', await h.locator('[data-picked-bar]').count() === 0)

  // A right click on a row: its full menu with "Read from here".
  await h.locator('[data-tag-list] [data-row]').nth(2).click({ button: 'right' })
  await wait(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('a right click opens the row\'s menu with "Read from here"', menu.some((one) => one.startsWith('Read from here')), `${menu.length} lines`)
  await h.screenshot({ path: `${dir}/after-row-menu.png` })
  await h.keyboard.press('Escape'); await wait(300)

  // Filter narrows, and says how many of how many.
  await h.locator('[data-tag-toolbar] input').fill('supercalifragilisticexpialidocious 4')
  await wait(600)
  const narrowed = await h.locator('[data-tag-narrowed]').textContent().catch(() => '')
  check('Filter narrows the list and says how many of how many', /of 50 shown/.test(narrowed ?? ''), narrowed)
  await h.locator('[data-tag-toolbar] input').fill('')
  await wait(500)

  // Stream and List swap, kept for next time; the stream never runs off the page.
  await h.locator('[data-tag-toolbar] button:has-text("Stream")').click()
  await wait(700)
  const stream = await measure()
  check('Stream shows the notes as text', await h.locator('[data-tag-stream] article').count() > 0)
  check('the stream stays inside the page, tags and all', !stream.wide.length && !stream.sideways, stream.wide.join(' | '))
  await h.screenshot({ path: `${dir}/after-stream-dark-1280.png` })
  await c.size(560, 700); await wait(400)
  const narrow = await measure()
  check('the stream stays inside the page at 560', !narrow.wide.length && !narrow.sideways, narrow.wide.join(' | '))
  await h.screenshot({ path: `${dir}/after-stream-dark-560.png` })
  await c.size(1280, 860)
  await h.locator('[data-tag-toolbar] button:has-text("List")').click()
  await wait(600)
  check('List comes back', await h.locator('[data-tag-list]').count() === 1)

  // Read through opens the reader; Esc shuts it.
  await h.locator('[data-tag-head] button:has-text("Read through")').click()
  await wait(900)
  const reader = await h.evaluate(() => !!document.querySelector('[data-read-through], [role="dialog"]'))
  check('Read through opens the reader', reader)
  await h.keyboard.press('Escape'); await wait(700)
  check('Esc shuts it, back on the tag', await h.evaluate(() => !document.querySelector('[data-read-through], [role="dialog"]')) && await h.locator('[data-tag-page]').count() === 1)

  // Study and ⋯: their menus, every line named; no Backdrop any more.
  await h.locator('[data-study-menu]').click(); await wait(400)
  const study = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('Study offers Review, Practise and Blurt', study.length === 3, study.join(' / '))
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[data-tag-more]').click(); await wait(400)
  const more = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  // Its colour in the menu itself, under "Colour of #tag", never a submenu (the user, 21 Nov).
  const hues = await h.evaluate(() => ({ heading: document.querySelector('[role="menu"] [data-tag-colour-menu]')?.textContent ?? '', swatches: document.querySelectorAll('[role="menu"] [role="menuitemradio"][data-tag-swatch]').length, sub: document.querySelectorAll('[role="menu"] [aria-haspopup="menu"]').length }))
  check('⋯ has Rename and its colours in the menu itself, and no Backdrop', more.some((one) => one.startsWith('Rename')) && /^Colour of #/.test(hues.heading) && hues.swatches === 9 && hues.sub === 0 && !more.some((one) => /Backdrop/.test(one)), `${more.join(' / ')} ${JSON.stringify(hues)}`)
  await h.screenshot({ path: `${dir}/after-more-menu.png` })
  await h.keyboard.press('Escape'); await wait(300)

  // Often with: a tag there opens its own page.
  await h.mouse.move(900, 500); await h.mouse.wheel(0, 20000); await wait(600)
  await h.locator('[data-often-tag="often"]').click(); await wait(1500)
  check('an "Often with" tag opens its page', /#often/.test(await h.locator('[data-tag-held]').textContent().catch(() => '')))
  await h.screenshot({ path: `${dir}/after-often.png` })

  // Read and Manage are steps: ⌘[ and ⌘] walk them.
  const tabNow = () => h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => one.getAttribute('aria-selected') === 'true' || one.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label') ?? '')
  await h.locator('[data-list-tabs] button[aria-label="Manage"]').click(); await wait(700)
  const a = await tabNow()
  await key('Meta+BracketLeft')
  const back = await tabNow()
  await key('Meta+BracketRight')
  const forward = await tabNow()
  check('Manage, ⌘[ is Read, ⌘] is Manage again', a === 'Manage' && back === 'Read' && forward === 'Manage', `${a}, ${back}, ${forward}`)
} catch (error) {
  check('the run finished', false, String(error.message ?? error).slice(0, 300))
}
await c.close()
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed} of ${results.length} passed.`)
process.exit(failed ? 1 : 0)
