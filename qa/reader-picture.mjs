// The web reader's pictures and highlights (19 Nov, the user's asks): a picture kept from the page right-clicks to its
// own lines (Look at it, Put in a note…, Copy image, Save a copy, Keep in Files), next to the pointer; and a highlight
// says so with Undo, ⌘Z takes it back, the first ever says where highlights go, and the bar's highlighter counts them.
// The site is faked in the main process's fetch, as in qa/web-reader.mjs. QA_SHOTS=dir keeps the menu light and dark.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-picture.mjs
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const png = (r, g, b, w, h) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
const SITE = 'https://93.184.216.34'
const para = (n) => `<p>Paragraph ${n} of the probe article walks slowly through the garden, noting each tree and the light that falls between the leaves, so a reader has enough words here to call this an article and not a scrap.</p>`
const page = `<html><head><title>The Garden Essay | Probe Times</title><meta property="og:site_name" content="Probe Times"></head><body><article><h1>The Garden Essay</h1>${para(1)}<p>A quiet sentence worth keeping sits here, in the middle of the essay.</p><figure><img src="/pic.png" alt="The walled garden"><figcaption>The walled garden</figcaption></figure>${para(2)}${para(3)}</article></body></html>`

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const shots = process.env.QA_SHOTS
const notice = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((one) => one.textContent).join(' | '))
try {
  await electron.evaluate((_, [site, page, pic]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      const path = new URL(url).pathname
      if (path === '/garden') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      if (path === '/pic.png') return new Response(Buffer.from(pic, 'base64'), { headers: { 'content-type': 'image/png' } })
      return new Response('', { status: 404 })
    }
  }, [SITE, page, png(60, 140, 60, 640, 360)])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/garden`)
  await h.waitForFunction(() => !!document.querySelector('.web-reader-body img[src^="haligtree://"]'), null, { timeout: 20000 }).catch(() => {})
  await h.waitForTimeout(600)
  // The picture's own menu, at the pointer.
  const img = h.locator('.web-reader-body img[src^="haligtree://"]').first()
  await img.scrollIntoViewIfNeeded()
  const box = await img.boundingBox()
  const at = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 }
  await h.mouse.click(at.x, at.y, { button: 'right' }); await h.waitForTimeout(500)
  const menu = await h.evaluate(() => {
    const one = document.querySelector('[role="menu"]')
    const b = one?.getBoundingClientRect()
    return { rows: [...(one?.querySelectorAll('[role="menuitem"]') ?? [])].map((row) => row.textContent.trim()), at: b && { left: Math.round(b.left), top: Math.round(b.top) } }
  })
  check('a reader picture right-clicks to its own lines', ['Look at it', 'Put in a note…', 'Copy image', 'Keep in Files'].every((one) => menu.rows.includes(one)), JSON.stringify(menu.rows))
  check('its menu opens at the pointer', !!menu.at && Math.abs(menu.at.left - at.x) < 24 && Math.abs(menu.at.top - at.y) < 24, JSON.stringify({ menu: menu.at, at }))
  if (shots) await c.both(`${shots}/reader-picture-menu`)
  // "Put in a note…": the notes' search, and the picture at the end of the note picked.
  await h.locator('[role="menuitem"]', { hasText: 'Put in a note…' }).click(); await h.waitForTimeout(600)
  const asked = await h.evaluate(() => document.querySelector('input[placeholder^="Put "]')?.getAttribute('placeholder') ?? null)
  check('"Put in a note…" asks which note', /^Put “The walled garden” in which note\?/.test(asked ?? ''), String(asked))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  // It drags out as itself (main's drag-out): the page's own drag is not started.
  const dragged = await h.evaluate(() => { const one = document.querySelector('.web-reader-body img[src^="haligtree://"]'); const event = new DragEvent('dragstart', { bubbles: true, cancelable: true }); one.dispatchEvent(event); return event.defaultPrevented })
  check('it drags out as the picture itself', dragged, String(dragged))

  // A highlight: a notice with Undo, ⌘Z takes it back, the first says where they go, the bar counts them.
  await h.evaluate(() => {
    const text = [...document.querySelectorAll('.web-reader-body p')].find((one) => /quiet sentence/.test(one.textContent)).firstChild
    const from = text.data.indexOf('sits here')
    const range = document.createRange()
    range.setStart(text, from); range.setEnd(text, from + 'sits here'.length)
    getSelection().removeAllRanges(); getSelection().addRange(range)
  })
  await h.waitForTimeout(400)
  await h.keyboard.press('1'); await h.waitForTimeout(700)
  const said = await notice()
  const count = await h.evaluate(() => document.querySelector('[data-marks-count]')?.textContent ?? null)
  check('a highlight says so, with Undo, and once where highlights go', /Highlighted/.test(said) && /Undo/.test(said) && /lists them/.test(said), said)
  check('the bar\'s highlighter counts them', count === '1', String(count))
  if (shots) await c.both(`${shots}/reader-highlight`)
  await h.keyboard.press('Meta+z'); await h.waitForTimeout(800)
  const left = await v('pdf:highlights', `${SITE}/garden`)
  check('⌘Z takes the highlight back', left.length === 0 && (await h.evaluate(() => document.querySelector('[data-marks-count]')?.textContent)) === '', JSON.stringify(left))
} finally {
  await c.close()
}
done()
