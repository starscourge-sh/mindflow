// A link card's picture and icon are kept with the notes, not left on the site:
// a new card from quick capture holds haligtree:// addresses whose files are in
// the data folder, with the site's addresses beside them; an old card holding
// the site's addresses, opened, keeps copies written beside the notes and is
// itself left as it was; and with the network
// gone the card still shows its picture. Only pictures under the size cap, with
// a picture's content type, from outside this machine's network, are kept.
// The site is faked in the main process's fetch at an address on the internet
// (93.184.216.34), so fetchOutside's own guard still runs.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-y/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/card-pictures.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { paste } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

// A small solid PNG of one colour, so each fake picture has its own bytes.
const png = (r, g, b, w = 32, h = 18) => {
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
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
const SITE = 'https://93.184.216.34'
const pictures = { '/pic.png': png(200, 40, 40), '/icon.png': png(40, 200, 40, 16, 16), '/old.png': png(40, 40, 200), '/oldicon.png': png(200, 200, 40, 16, 16) }
const html = `<html><head><title>Card test page</title><meta property="og:title" content="Card test page"><meta property="og:image" content="/pic.png"><link rel="icon" href="/icon.png"></head><body>hi</body></html>`

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { page, h, electron, send } = c
const files = (dir = process.env.QA_DATA, out = []) => {
  for (const one of readdirSync(dir, { withFileTypes: true })) one.isDirectory() ? files(join(dir, one.name), out) : out.push(one.name)
  return out
}
const net = (patch) => electron.evaluate((_, p) => Object.assign(globalThis.__cardNet, p), patch)
try {
  await electron.evaluate((_, [site, pictures, html]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.__cardNet = { blocked: false, hits: 0 }
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      globalThis.__cardNet.hits += 1
      if (globalThis.__cardNet.blocked) throw new TypeError('fetch failed: offline')
      const path = new URL(url).pathname
      if (path === '/page') return new Response(html, { headers: { 'content-type': 'text/html' } })
      if (pictures[path]) return new Response(Buffer.from(pictures[path], 'base64'), { headers: { 'content-type': 'image/png' } })
      if (path === '/big.png') return new Response(new Uint8Array(11_000_000), { headers: { 'content-type': 'image/png' } })
      if (path === '/not-a-picture.png') return new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
      return new Response('', { status: 404 })
    }
  }, [SITE, pictures, html])
  await c.v('settings:set', { hintRate: 0, rotCount: 0, motion: false })

  // 1. A new card, by pasting the link into quick capture.
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  await page.locator('.haligtree-editor[contenteditable=true]').first().click()
  await paste(page, `${SITE}/page`); await page.waitForTimeout(600)
  await page.keyboard.press('Alt+Meta+Enter'); await page.waitForTimeout(800)
  let card = null
  for (let i = 0; i < 40 && !card; i++) {
    card = await page.evaluate(async () => {
      for (const meta of await window.api.captures.list()) {
        const one = await window.api.captures.get(meta.id)
        const found = JSON.stringify(one?.body ?? '').includes('93.184.216.34') && one.body?.content?.find?.((node) => node.type === 'bookmark')
        if (found) return found.attrs
      }
      return null
    })
    if (!card) await page.waitForTimeout(250)
  }
  check('a link pasted in quick capture becomes a card', !!card, JSON.stringify(card)?.slice(0, 200))
  check('the new card\'s picture is a haligtree:// address', /^haligtree:\/\/assets\/[a-f0-9]{64}\.png$/.test(card?.image ?? ''), card?.image)
  check('the new card\'s icon is a haligtree:// address', /^haligtree:\/\/assets\/[a-f0-9]{64}\.png$/.test(card?.icon ?? ''), card?.icon)
  check('the site\'s addresses are kept as imageSource and iconSource', card?.imageSource === `${SITE}/pic.png` && card?.iconSource === `${SITE}/icon.png`, `${card?.imageSource} ${card?.iconSource}`)
  const kept = files()
  check('both files are in the data folder', [card?.image, card?.icon].every((src) => src && kept.includes(src.split('/').pop())))

  // 2. An old card holding the site's addresses: opened, its picture and icon are kept with the book the first time it
  // shows, and where each copy is, is written beside the notes (lib/card-pictures.ts, keptOf and remember); the note
  // itself is never rewritten by opening it (819b98062).
  const old = await h.evaluate((site) => window.api.captures.create({ kind: 'note', title: 'Old card', body: { type: 'doc', content: [{ type: 'bookmark', attrs: { href: `${site}/old`, title: 'Old card', description: '', image: `${site}/old.png`, icon: `${site}/oldicon.png`, site: 'old.example', id: 'old-card', loading: false } }, { type: 'paragraph' }] } }), SITE)
  // Drawn the first time, the card shows the site's own picture, and keeps its copy once that has come: the page asks
  // the made-up site too, so it is answered here as main's fetch is, and a test run asks the internet for nothing.
  await electron.evaluate(({ session, net }, [site, pictures]) => session.defaultSession.protocol.handle('https', (request) => {
    if (!request.url.startsWith(site + '/')) return net.fetch(request, { bypassCustomProtocolHandlers: true })
    const body = pictures[new URL(request.url).pathname]
    return body ? new Response(Buffer.from(body, 'base64'), { headers: { 'content-type': 'image/png' } }) : new Response('', { status: 404 })
  }), [SITE, pictures])
  await send('capture', old)
  // What the window wrote beside the notes, for this book: the site's address to the copy's.
  const recorded = () => h.evaluate(() => { try { return JSON.parse(localStorage.getItem(`card-pictures ${window.api.book?.() ?? ''}`) ?? '{}') } catch { return {} } })
  let kept2 = {}
  for (let i = 0; i < 40; i++) {
    kept2 = await recorded()
    if (/^haligtree:/.test(kept2[`${SITE}/old.png`] ?? '') && /^haligtree:/.test(kept2[`${SITE}/oldicon.png`] ?? '')) break
    await h.waitForTimeout(250)
  }
  const was = await h.evaluate(async (id) => (await window.api.captures.get(id))?.body?.content?.[0]?.attrs, old)
  check('an old card\'s picture is kept: its copy, a haligtree:// address, written beside the notes', /^haligtree:\/\/assets\/[a-f0-9]{64}\.png$/.test(kept2[`${SITE}/old.png`] ?? ''), kept2[`${SITE}/old.png`])
  check('an old card\'s icon is kept the same way', /^haligtree:\/\/assets\/[a-f0-9]{64}\.png$/.test(kept2[`${SITE}/oldicon.png`] ?? ''), kept2[`${SITE}/oldicon.png`])
  check('the old card itself is not rewritten: the site\'s addresses as it had them', was?.image === `${SITE}/old.png` && was?.icon === `${SITE}/oldicon.png`, `${was?.image} ${was?.icon}`)
  check('the old card\'s kept files are in the data folder', [kept2[`${SITE}/old.png`], kept2[`${SITE}/oldicon.png`]].every((src) => src && files().includes(src.split('/').pop())))
  // The window's page made again, so the next opening draws the card anew, from its kept copy: a development build
  // kept the card drawn with the site's picture through a trip to Home and back.
  await h.reload()
  await h.waitForTimeout(1500)

  // 3. The guards: too big, not a picture, inside the network, offline.
  const guarded = await h.evaluate((site) => Promise.all([
    window.api.keepCardPictures(`${site}/big.png`, `${site}/not-a-picture.png`),
    window.api.keepCardPictures('http://127.0.0.1/x.png', ''),
    window.api.keepCardPictures(`${site}/pic.png`, `${site}/pic.png`)
  ]), SITE)
  check('a picture past the size cap stays the site\'s address', guarded[0].image === `${SITE}/big.png`, guarded[0].image)
  check('a file that is not a picture stays the site\'s address', guarded[0].icon === `${SITE}/not-a-picture.png`, guarded[0].icon)
  check('a picture on this machine is never fetched', guarded[1].image === '', guarded[1].image)
  check('the same picture twice is one file', guarded[2].image === card?.image && guarded[2].icon === card?.image, guarded[2].image)
  await net({ blocked: true })
  const offline = await h.evaluate((site) => window.api.keepCardPictures(`${site}/never.png`, ''), SITE)
  check('offline with no copy, the card keeps the site\'s address', offline.image === `${SITE}/never.png`, offline.image)

  // 4. With the network gone, the kept card still shows its picture.
  await net({ hits: 0 })
  await send('capture', old); await h.waitForTimeout(1500)
  const shown = await h.evaluate(async () => {
    const img = document.querySelector('.tiptap-bookmark .tiptap-bookmark-image')
    if (img && !img.complete) await new Promise((done) => img.addEventListener('load', done, { once: true }))
    const icon = document.querySelector('.tiptap-bookmark .tiptap-bookmark-icon')
    return img ? { src: img.getAttribute('src'), width: img.naturalWidth, icon: icon?.getAttribute('src'), iconWidth: icon?.naturalWidth ?? 0 } : null
  })
  check('offline, the card shows its kept picture', !!shown && /^haligtree:/.test(shown.src) && shown.width > 0, JSON.stringify(shown))
  check('offline, the card shows its kept icon', !!shown && /^haligtree:/.test(shown.icon ?? '') && shown.iconWidth > 0, JSON.stringify(shown))
  check('showing it asked the site for nothing', (await electron.evaluate(() => globalThis.__cardNet.hits)) === 0)
  check('no errors in the main window', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
