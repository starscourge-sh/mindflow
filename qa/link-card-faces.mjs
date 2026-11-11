// Link cards never show an empty grey block. While a card's picture comes in it
// wears its site's face (a tint of the site's hue, its icon or first letter);
// the picture fades in over it; a picture that never comes leaves the face. A
// YouTube card has its picture at once from the video's id, even while its
// details load. A picture still on the site is kept with the notes the first
// time its card is shown, so the next opening asks the network for nothing.
// Measures opening a note of 30 cards: time to cards drawn, and network requests.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/link-card-faces.mjs
// QA_SHOTS=<folder> saves light and dark pictures and frames every 50ms as the pictures arrive.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

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
const VIDEO = 'dQw4w9WgXcQ'
const pictures = { '/icon.png': png(40, 160, 220, 16, 16) }
for (let n = 0; n < 28; n++) pictures[`/pic-${n}.png`] = png((n * 37) % 255, (n * 91) % 255, (n * 53) % 255, 64, 36)
const yt = { hqdefault: png(220, 40, 40, 48, 36), mqdefault: png(220, 40, 40, 32, 18), maxresdefault: png(220, 40, 40, 64, 36) }
const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, electron, send, both } = c
try {
  // The site and YouTube, faked for the window (Chromium's own requests) and
  // for the main process's fetch, each counted; pictures held back until let go.
  await electron.evaluate(async ({ BrowserWindow, net }, [site, pictures, yt]) => {
    globalThis.__cards = { held: true, release: null, page: 0, main: 0 }
    const gate = () => (globalThis.__cards.held ? new Promise((go) => ((globalThis.__cards.release ??= []).push(go))) : Promise.resolve())
    const answer = async (url) => {
      const u = new URL(url)
      if (url.startsWith(site + '/') && pictures[u.pathname]) return new Response(Buffer.from(pictures[u.pathname], 'base64'), { headers: { 'content-type': 'image/png' } })
      const thumb = u.hostname === 'i.ytimg.com' && /\/vi\/[\w-]+\/(\w+)\.jpg$/.exec(u.pathname)?.[1]
      if (thumb && yt[thumb]) return new Response(Buffer.from(yt[thumb], 'base64'), { headers: { 'content-type': 'image/png' } })
      return null
    }
    const ours = (url) => url.startsWith(site + '/') || url.startsWith('https://i.ytimg.com/')
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!ours(url)) return globalThis.__realFetch(input, init)
      globalThis.__cards.main += 1
      await gate()
      return (await answer(url)) ?? new Response('', { status: 404 })
    }
    const ses = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home')).webContents.session
    ses.protocol.handle('https', async (request) => {
      if (!ours(request.url)) return net.fetch(request, { bypassCustomProtocolHandlers: true })
      globalThis.__cards.page += 1
      await gate()
      return (await answer(request.url)) ?? new Response('', { status: 404 })
    })
  }, [SITE, pictures, yt])
  const counts = () => electron.evaluate(() => ({ page: globalThis.__cards.page, main: globalThis.__cards.main }))
  const release = () => electron.evaluate(() => { globalThis.__cards.held = false; (globalThis.__cards.release ?? []).forEach((go) => go()); globalThis.__cards.release = null })
  await c.v('settings:set', { hintRate: 0, rotCount: 0 })

  const card = (n) => ({ type: 'bookmark', attrs: { href: `${SITE}/page-${n}`, title: `Card ${n}`, description: 'A page on a site', image: `${SITE}/pic-${n}.png`, icon: `${SITE}/icon.png`, site: 'Example', id: `c${n}`, loading: false } })
  const content = Array.from({ length: 28 }, (_, n) => card(n))
  content.push({ type: 'bookmark', attrs: { href: `https://www.youtube.com/watch?v=${VIDEO}`, title: 'A video', description: '', image: '', icon: '', site: 'YouTube', id: 'yt', loading: false } })
  content.push({ type: 'bookmark', attrs: { href: 'https://gone.example.org/page', title: 'A page whose picture is gone', description: '', image: `${SITE}/missing.png`, icon: '', site: 'gone.example.org', id: 'gone', loading: false } })
  const id = await h.evaluate((content) => window.api.captures.create({ kind: 'note', title: 'Thirty cards', body: { type: 'doc', content: [...content, { type: 'paragraph' }] } }), content)

  // How long until every card is drawn, timed in the window from the moment the note is asked for.
  const open = async (note = id) => {
    const timing = h.evaluate(() => new Promise((done) => {
      const t0 = performance.now()
      const tick = () => (document.querySelectorAll('.tiptap-bookmark').length >= 30 ? done(Math.round(performance.now() - t0)) : requestAnimationFrame(tick))
      tick()
    }))
    await send('capture', note)
    return timing
  }

  // 1. Opened for the first time, the pictures held back by the network.
  await open()
  await h.waitForTimeout(300)
  const held = await h.evaluate(() => {
    const cards = [...document.querySelectorAll('.tiptap-bookmark')]
    const surface = getComputedStyle(document.querySelector('.tiptap-bookmark-frame')).backgroundColor
    return cards.map((one) => {
      const frame = one.querySelector('.tiptap-bookmark-frame')
      const face = frame?.querySelector('.tiptap-bookmark-face')
      const img = frame?.querySelector('.tiptap-bookmark-image')
      return { frame: !!frame, face: !!face, tinted: !!face && getComputedStyle(face).backgroundColor !== surface, mark: !!face?.querySelector('.tiptap-bookmark-face-icon, .tiptap-bookmark-face-letter'), src: img?.getAttribute('src') ?? '', opacity: img ? getComputedStyle(img).opacity : '' }
    })
  })
  check('30 cards drawn', held.length === 30, String(held.length))
  check('every card has its picture\'s place, with the site\'s face in it', held.every((one) => one.frame && one.face && one.mark), JSON.stringify(held.find((one) => !one.face || !one.mark)))
  check('every face is tinted, not the flat grey surface', held.every((one) => one.tinted))
  check('a picture still coming in is not shown yet (it fades in)', held.slice(0, 28).every((one) => one.opacity === '0'), held[0]?.opacity)
  check('the YouTube card\'s picture is asked for at once, from the video\'s id', held[28]?.src === `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`, held[28]?.src)
  if (SHOTS) await both(join(SHOTS, 'cards-waiting'))

  // 2. The pictures arrive: each fades in; one that is gone leaves its face.
  await release()
  if (SHOTS) for (let f = 0; f < 8; f++) { await h.screenshot({ path: join(SHOTS, `arrive-${String(f).padStart(2, '0')}.png`) }); await h.waitForTimeout(50) }
  await h.waitForTimeout(800)
  const arrived = await h.evaluate(() => [...document.querySelectorAll('.tiptap-bookmark')].map((one) => {
    const img = one.querySelector('.tiptap-bookmark-image')
    return { img: !!img, width: img?.naturalWidth ?? 0, opacity: img ? getComputedStyle(img).opacity : '', face: !!one.querySelector('.tiptap-bookmark-face') }
  }))
  check('every picture that came is shown, fully', arrived.slice(0, 29).every((one) => one.img && one.width > 0 && one.opacity === '1'), JSON.stringify(arrived.slice(0, 29).find((one) => !one.img || one.opacity !== '1')))
  check('a picture that never comes leaves the face, not a broken box', !arrived[29].img && arrived[29].face, JSON.stringify(arrived[29]))
  if (SHOTS) await both(join(SHOTS, 'cards-arrived'))

  // 3. Each picture is kept with the notes the first time it is shown.
  let attrs = []
  for (let i = 0; i < 60; i++) {
    attrs = await h.evaluate(async (id) => (await window.api.captures.get(id))?.body?.content?.filter((node) => node.type === 'bookmark').map((node) => node.attrs) ?? [], id)
    if (attrs.slice(0, 29).every((one) => /^haligtree:/.test(one.image))) break
    await h.waitForTimeout(250)
  }
  check('every shown picture is now kept with the notes', attrs.slice(0, 29).every((one) => /^haligtree:\/\/assets\//.test(one.image)), JSON.stringify(attrs.find((one) => !/^haligtree:/.test(one.image)))?.slice(0, 200))
  check('their icons too', attrs.slice(0, 28).every((one) => /^haligtree:\/\/assets\//.test(one.icon)))
  check('the site\'s addresses stay beside the copies', attrs[0]?.imageSource === `${SITE}/pic-0.png` && attrs[0]?.iconSource === `${SITE}/icon.png`, `${attrs[0]?.imageSource} ${attrs[0]?.iconSource}`)
  check('the YouTube card keeps its picture too', /^haligtree:/.test(attrs[28]?.image ?? '') && /i\.ytimg\.com/.test(attrs[28]?.imageSource ?? ''), `${attrs[28]?.image} ${attrs[28]?.imageSource}`)
  check('the one that is gone stays as it was', attrs[29]?.image === `${SITE}/missing.png`, attrs[29]?.image)

  // 4. Measured: thirty cards still on a site (as every card was before), then the same thirty kept in the book,
  // each opened in a fresh window, timed to every picture shown.
  const shownAll = () => h.evaluate(() => new Promise((done) => {
    const t0 = performance.now()
    const tick = () => {
      const cards = document.querySelectorAll('.tiptap-bookmark')
      const pics = [...document.querySelectorAll('.tiptap-bookmark-image')].filter((img) => img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1')
      if (cards.length >= 30 && pics.length >= 29) done({ cards: Math.round(performance.now() - t0), pictures: Math.round(performance.now() - t0) })
      else if (performance.now() - t0 > 15000) done({ cards: -1, pictures: -1 })
      else requestAnimationFrame(tick)
    }
    tick()
  }))
  const measure = async (note) => {
    await h.reload(); await h.waitForTimeout(2500)
    await electron.evaluate(() => Object.assign(globalThis.__cards, { page: 0, main: 0 }))
    const drawn = open(note)
    const pictures = shownAll()
    const cards = await drawn
    const all = await pictures
    await h.waitForTimeout(1500)
    return { cards, pictures: all.pictures, ...(await counts()) }
  }
  const fresh = Array.from({ length: 28 }, (_, n) => ({ ...card(n), attrs: { ...card(n).attrs, image: `${SITE}/pic-${n}.png?again`, id: `f${n}` } }))
  fresh.push(content[28], { ...content[29], attrs: { ...content[29].attrs, image: `${SITE}/pic-0.png?again` } })
  const remoteId = await h.evaluate((content) => window.api.captures.create({ kind: 'note', title: 'Thirty cards on a site', body: { type: 'doc', content: [...content, { type: 'paragraph' }] } }), fresh)
  const onSite = await measure(remoteId)
  const kept = await measure(id)
  const shown = await h.evaluate(() => [...document.querySelectorAll('.tiptap-bookmark-image')].filter((img) => img.naturalWidth > 0 && /^haligtree:/.test(img.getAttribute('src'))).length)
  check('opened again, the kept pictures are shown from the book', shown >= 29, String(shown))
  // The gone card's picture is the one address left on a site.
  check('opened again, the kept cards ask the network for nothing but the one picture that is gone', kept.page <= 1 && kept.main === 0, JSON.stringify(kept))
  console.log(`MEASURE 30 cards on a site, first shown: cards drawn ${onSite.cards}ms, every picture shown ${onSite.pictures}ms, ${onSite.page} requests from the window, ${onSite.main} from main (keeping copies)`)
  console.log(`MEASURE 30 cards kept in the book: cards drawn ${kept.cards}ms, every picture shown ${kept.pictures}ms, ${kept.page} requests from the window, ${kept.main} from main`)

  // 5. A YouTube card whose details are still loading already has its picture.
  const loadingId = await h.evaluate((video) => window.api.captures.create({ kind: 'note', title: 'Loading video', body: { type: 'doc', content: [{ type: 'bookmark', attrs: { href: `https://youtu.be/${video}`, title: `https://youtu.be/${video}`, description: '', image: '', icon: '', site: '', id: 'l1', loading: true } }, { type: 'paragraph' }] } }), VIDEO)
  await send('capture', loadingId); await h.waitForTimeout(1200)
  const loading = await h.evaluate(() => {
    const one = document.querySelector('.tiptap-bookmark')
    const img = one?.querySelector('.tiptap-bookmark-image')
    return { loading: one?.hasAttribute('data-loading'), src: img?.getAttribute('src') ?? '', width: img?.naturalWidth ?? 0 }
  })
  check('a YouTube card still loading its details shows its picture', loading.loading && /i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg$/.test(loading.src) && loading.width > 0, JSON.stringify(loading))
  if (SHOTS) await both(join(SHOTS, 'youtube-loading'))
  // The one picture that is gone answers 404 on purpose.
  const errors = c.errors.filter((one) => !/Failed to load resource.*404/.test(one))
  check('no errors in the main window', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
