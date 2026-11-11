// A drawing asks nothing of the web. Excalidraw named a CDN (esm.sh) as the second home of each of its fonts, and
// read a font with fetch to put it inside a drawing's picture: the built app's pages are opened from files, a page
// from a file may not fetch a file, so it went on to the CDN, which the app's policy refuses and logs. Now the fonts
// come through the app's own address (haligtree://app/fonts/…) and the CDN is named nowhere. Checked here: a note
// holding a drawing with words in it shows its picture with the font inside it, the words in the hand-drawn face,
// no error logged and no web address asked for; then "/drawing" opens its canvas the same way.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/drawing-offline.mjs
//   SHOTS=dir keeps a picture of the drawing in the note, light and dark.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const asked = []
h.on('request', (request) => { if (/^https?:\/\/(?!localhost|127\.0\.0\.1)/.test(request.url())) asked.push(request.url()) })
const words = { type: 'text', id: 'words-1', x: 40, y: 40, width: 260, height: 25, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [], frameId: null, index: 'a0', roundness: null, seed: 7, version: 2, versionNonce: 7, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, text: 'Hand drawn words', fontSize: 20, fontFamily: 5, textAlign: 'left', verticalAlign: 'top', containerId: null, originalText: 'Hand drawn words', autoResize: true, lineHeight: 1.25 }
const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A drawing with words in it' }] }, { type: 'excalidraw', attrs: { scene: { elements: [words], files: {} } } }, { type: 'paragraph' }] }
const outside = () => c.errors.filter((one) => /esm\.sh|Failed to fetch font|Failed to load font|https?:\/\/(?!localhost|127\.0\.0\.1)/.test(one))
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), body)
  await c.send('capture', id)
  // Its picture, once drawn.
  const picture = () => h.evaluate(() => {
    const svg = document.querySelector('[data-open] .tiptap-excalidraw svg, .tiptap-excalidraw svg')
    if (!svg) return null
    const text = svg.querySelector('text')
    const style = [...svg.querySelectorAll('style')].map((one) => one.textContent ?? '').join('\n')
    return {
      words: (text?.textContent ?? '').trim(), family: text ? getComputedStyle(text).fontFamily : '',
      own: /@font-face[^}]*url\(data:font\/woff2/.test(style), web: /https?:\/\//.test(style.replace(/xmlns[^ ]*/g, '')), styleStart: style.replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,…').slice(0, 200),
      wide: Math.round(text?.getBoundingClientRect().width ?? 0),
    }
  })
  let seen = null
  for (let n = 0; n < 60 && !(seen = await picture())?.words; n++) await wait(200)
  await wait(1200)
  seen = await picture()
  check('the note shows the drawing\'s picture, with its words', seen?.words === 'Hand drawn words', JSON.stringify(seen))
  check('the picture carries the font inside itself, and names no web address', !!seen?.own && !seen?.web, seen?.styleStart ?? '')
  const face = await h.evaluate(async () => { await document.fonts.ready; return { ready: document.fonts.check('20px Excalifont', 'Hand drawn words'), loaded: [...document.fonts].filter((one) => one.family.replace(/"/g, '') === 'Excalifont' && one.status === 'loaded').length } })
  check('its words are drawn in the hand-drawn face (Excalifont, loaded from the app)', /^"?Excalifont/.test(seen?.family ?? '') && face.ready && face.loaded > 0, `${seen?.family} ${JSON.stringify(face)}`)
  if (process.env.SHOTS) for (const theme of ['light', 'dark']) { await c.look(theme); await wait(900); await h.screenshot({ path: `${process.env.SHOTS}/drawing-offline-${theme}.png`, clip: { x: 300, y: 80, width: 960, height: 520 } }) }
  check('opened, nothing is asked of the web and no error is logged', asked.length === 0 && outside().length === 0, [...asked, ...outside()].join(' / ').slice(0, 400))

  // "/drawing" in a note: its canvas opens and asks for nothing either.
  const plain = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A plain note' }] }, { type: 'paragraph' }] })
  await c.send('capture', plain); await wait(2000)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.commands.focus('end'))
  await h.keyboard.type('/drawing', { delay: 15 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(3500)
  const canvas = await h.evaluate(() => ({ block: document.querySelectorAll('[data-open] .tiptap-excalidraw').length, canvas: document.querySelectorAll('.excalidraw canvas').length }))
  check('"/drawing" puts a drawing in the note and opens its canvas', canvas.block === 1 && canvas.canvas > 0, JSON.stringify(canvas))
  check('with the canvas open, still nothing asked of the web and no error logged', asked.length === 0 && outside().length === 0, [...asked, ...outside()].join(' / ').slice(0, 400))
  for (const one of c.errors.slice(0, 6)) console.log(`NOTE  console: ${one.slice(0, 240)}`)
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  check('the run finished', false, error.message.split('\n').slice(0, 6).join(' ⏎ '))
} finally { await c.close() }
done()
