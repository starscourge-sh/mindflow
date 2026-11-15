// The reader keeps a page's links whole and its pictures true (the user, 15 Nov, on notability.com: "it does not look
// like a page with broken css"): four real pages, saved once in qa/fixtures/reader (never fetched here), each read as a
// clean page in the dark theme with "Postcards" on and a black border (the user's own setup): no picture block that is
// an icon (under 100px both ways, or under 48px one way with no words to it), no picture twice (the same file, or two
// of a site's versions of one picture), no picture that does not show, no link without words, no line after line of a
// single sign, and every picture on the light ink, never the postcard's dark plate or shadow. Each site's pictures are
// stand-ins of the real ones' sizes (<name>.pictures.json): drawings (SVG) black lines on nothing, the rest solid.
// A table narrower than the column is framed round its cells.
// Every host is moved to an address on the internet, so fetchOutside's guard runs and nothing asks a name server.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-pictures.mjs
// QA_SHOTS=<folder> keeps the reader at its top, middle and end for each page, light and dark.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const PAGES = { notability: 'https://notability.com/', raycast: 'https://www.raycast.com/', anki: 'https://docs.ankiweb.net/browsing.html', webdev: 'https://web.dev/articles/optimize-lcp' }
const ONLY = process.env.QA_PAGES?.split(',')

/** A solid picture of a size, in a colour of its own (two stand-ins are never the same file). */
const png = (w, h, seed) => {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2
  const colour = createHash('sha256').update(seed).digest().subarray(0, 3)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).fill(colour)])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))])
}
const svg = (w, h, seed) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><!--${seed}--><path d="M4 4L${w - 4} ${h - 4}M4 ${h - 4}L${w - 4} 4" stroke="black" stroke-width="3" fill="none"/></svg>`)

// Each host its own address on the internet; the page and its pictures' sizes moved there with it.
const hosts = new Map()
const at = (host) => (hosts.has(host) || hosts.set(host, `93.184.216.${34 + hosts.size}`), hosts.get(host))
const moved = (text) => text.replace(/(https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/"'?#\s:]|$)/gi, (all, _scheme, host) => (hosts.has(host.toLowerCase()) ? `https://${hosts.get(host.toLowerCase())}` : all))
const site = {}
/** Each stand-in's file name in the book (its sha256, as storeImage names it) back to the site's own address. */
const named = {}
for (const [name, href] of Object.entries(PAGES)) {
  if (ONLY && !ONLY.includes(name)) continue
  const sizes = JSON.parse(readFileSync(new URL(`./fixtures/reader/${name}.pictures.json`, import.meta.url), 'utf8'))
  for (const url of [href, ...Object.keys(sizes)]) at(new URL(url).hostname.toLowerCase())
  const pictures = {}
  for (const [url, size] of Object.entries(sizes)) {
    if (!size) continue
    const [w, h, type] = size
    const bytes = type === 'svg' ? svg(w, h, url) : png(w, h, url)
    named[createHash('sha256').update(bytes).digest('hex')] = url
    pictures[moved(url)] = { type: type === 'svg' ? 'image/svg+xml' : 'image/png', bytes: bytes.toString('base64') }
  }
  site[name] = { href: moved(href), page: moved(readFileSync(new URL(`./fixtures/reader/${name}.html`, import.meta.url), 'utf8')), pictures }
}

/** A picture's place and name without what tells a site's versions of it apart, as article-clean.ts reads it. */
const stem = (url) => { const at = URL.parse(url); const served = at?.searchParams.get('url'); return ((served ? URL.parse(served, 'https://x')?.pathname : at?.pathname) ?? '').replace(/\.[a-z0-9]+$/i, '').toLowerCase().split(/[/\-_.@\s]+/)
  .filter((word) => word && !/^(wide|narrow|desktop|mobile|tablet|phone|small|medium|large|sm|md|lg|xl|xs|xxl|portrait|landscape|retina|full|half|\d+(w|px|x|x\d+)?)$/.test(word)).join('-') }

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron, look, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? ''
try {
  await electron.evaluate((_, served) => {
    globalThis.__realFetch ??= globalThis.fetch
    const pages = Object.fromEntries(Object.values(served).map((one) => [one.href, one.page]))
    const pictures = Object.assign({}, ...Object.values(served).map((one) => one.pictures))
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!/^https:\/\/93\.184\.216\.\d+\//.test(url)) return globalThis.__realFetch(input, init)
      if (pages[url]) return new Response(pages[url], { headers: { 'content-type': 'text/html; charset=utf-8' } })
      const picture = pictures[url]
      return picture ? new Response(Buffer.from(picture.bytes, 'base64'), { headers: { 'content-type': picture.type } }) : new Response('', { status: 404 })
    }
  }, site)
  // The user's setup: pictures in notes as postcards, on a black border, in the dark.
  await v('settings:set', { sounds: false, hintRate: 0, motion: false, postcards: true, postcardBorder: 'black' })
  await look('dark')
  await h.evaluate(() => {
    const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    window.__rgb = (fill) => { ink.fillStyle = '#000'; ink.fillRect(0, 0, 1, 1); ink.fillStyle = fill; ink.fillRect(0, 0, 1, 1); return [...ink.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  })

  for (const [name, { href }] of Object.entries(site)) {
    // The reader opens in the pane in place of the page before: read once the new article's title is up.
    const before = await h.evaluate(() => document.querySelector('.web-reader-heading')?.textContent ?? '')
    await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
    await h.waitForFunction((before) => { const now = document.querySelector('.web-reader-heading')?.textContent; return (!!now && now !== before && !!document.querySelector('.web-reader-body')) || !!document.querySelector('.web-reader-failed') }, before, { polling: 100, timeout: 30000 }).catch(() => {})
    await wait(600)
    // Every picture loaded (or failed) before it is measured: a parked window still loads them.
    await h.waitForFunction(() => [...document.querySelectorAll('.web-reader-body img')].every((one) => one.complete), null, { polling: 100, timeout: 15000 }).catch(() => {})
    const seen = await h.evaluate(() => {
      const body = document.querySelector('.web-reader-body')
      const pictures = [...(body?.querySelectorAll('img') ?? [])].map((one) => {
        const box = one.getBoundingClientRect()
        const style = getComputedStyle(one)
        return { src: one.getAttribute('src'), alt: one.getAttribute('alt') ?? '', inline: one.hasAttribute('data-inline'), natural: [one.naturalWidth, one.naturalHeight], box: [Math.round(box.width), Math.round(box.height)], under: window.__rgb(style.backgroundColor), shadow: style.boxShadow, padding: style.paddingTop }
      })
      const links = [...(body?.querySelectorAll('a') ?? [])].map((one) => (one.textContent ?? '').trim())
      const lines = [...(body?.querySelectorAll('p, div, li') ?? [])].filter((one) => !one.querySelector('p, div, li')).map((one) => (one.textContent ?? '').trim())
      // Each table's frame against its widest row: a narrow table framed round its cells, not the whole column.
      const tables = [...(body?.querySelectorAll('table') ?? [])].map((one) => [Math.round(one.getBoundingClientRect().width), Math.round(Math.max(0, ...[...one.querySelectorAll('tr')].map((row) => row.getBoundingClientRect().width)))])
      return { title: document.querySelector('.web-reader-heading')?.textContent ?? document.querySelector('.web-reader-failed')?.textContent, words: (body?.textContent ?? '').replace(/\s+/g, ' ').trim().length, pictures, links, lines, tables }
    })
    const original = (src) => named[/assets\/([a-f0-9]{64})\./.exec(src ?? '')?.[1]] ?? src
    const block = seen.pictures.filter((one) => !one.inline)
    const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    check(`${name}: the article reads (its title and its words)`, !!seen.title && seen.words > 300, `${seen.title} / ${seen.words} characters`)
    check(`${name}: no picture that does not show`, seen.pictures.every((one) => one.natural[0] > 0 && one.box[0] > 0 && one.box[1] > 0), JSON.stringify(seen.pictures.filter((one) => !(one.natural[0] > 0 && one.box[0] > 0)).map((one) => original(one.src))))
    check(`${name}: no picture block that is an icon (under 100px both ways, or under 48px one way with no words)`, block.every((one) => Math.max(...one.box) >= 100 && (Math.min(...one.box) >= 48 || one.alt)), JSON.stringify(block.filter((one) => !(Math.max(...one.box) >= 100 && (Math.min(...one.box) >= 48 || one.alt))).map((one) => [original(one.src), one.box])))
    const stems = seen.pictures.map((one) => stem(original(one.src)))
    check(`${name}: no picture twice, as a site's two versions of one either`, new Set(seen.pictures.map((one) => one.src)).size === seen.pictures.length && new Set(stems).size === stems.length, stems.join(' '))
    check(`${name}: no link without words`, seen.links.every((one) => one.replace(/[↗→\s]/g, '')), JSON.stringify(seen.links.filter((one) => !one.replace(/[↗→\s]/g, ''))))
    check(`${name}: no line after line of a single sign (a keyboard drawn from letters)`, !seen.lines.some((_, i) => seen.lines.slice(i, i + 3).length === 3 && seen.lines.slice(i, i + 3).every((one) => one.length > 0 && one.length <= 3)), JSON.stringify(seen.lines.filter((one) => one.length <= 3).slice(0, 12)))
    check(`${name}: in the dark every picture lies on the light ink, with no postcard plate, padding or shadow`, seen.pictures.every((one) => lum(one.under) > 0.6 && one.shadow === 'none' && one.padding === '0px'), JSON.stringify(seen.pictures.filter((one) => !(lum(one.under) > 0.6 && one.shadow === 'none' && one.padding === '0px')).slice(0, 3).map((one) => [original(one.src), one.under, one.shadow, one.padding])))
    if (seen.tables.length) check(`${name}: a table's frame goes round its cells, never on across the empty column`, seen.tables.every(([frame, row]) => frame <= row + 4), JSON.stringify(seen.tables))
    console.log(`  ${name}: ${seen.pictures.length} pictures (${block.length} blocks), ${seen.links.length} links: ${seen.pictures.map((one) => `${original(one.src)?.split('/').pop()?.slice(0, 40)} ${one.box.join('x')}`).join(', ')}`)
    if (shots) {
      for (const mode of ['dark', 'light']) {
        await look(mode)
        await wait(300)
        for (const [i, share] of [0, 0.45, 0.9].entries()) {
          await h.evaluate((share) => { const box = document.querySelector('.web-reader-scroll'); box.scrollTop = (box.scrollHeight - box.clientHeight) * share }, share)
          await wait(250)
          await h.screenshot({ path: `${shots}/${name}-${mode}-${i}.png` })
        }
      }
      await look('dark')
    }
  }
  check('no page errors', c.errors.filter((one) => !/favicon|net::|Failed to load resource/i.test(one)).length === 0, c.errors.slice(0, 3).join(' | '))
  // Home again, so a book opened after this run (r3's kept-page check) does not open in the reader and ask the network
  // for its page before this probe's stand-in site is in place.
  await go('home')
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close?.()
  done()
}
