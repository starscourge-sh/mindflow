// Pressing play on a YouTube video in a note: the frame never goes blank. Its picture stays, dimmed on a dark stage,
// until the player loads and fades in (the user, 22 Nov). The picture and the player are answered here; nothing leaves the Mac.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOTS = process.env.QA_SHOTS
try {
  // Nothing leaves the Mac: the picture and the player are answered here, the player a second late.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAGElEQVR4nGP4z8DwnwEJMDAwMIyqHVkAAN3gD/Fv7a5kAAAAAElFTkSuQmCC', 'base64')
  await h.route(/ytimg\.com/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }))
  await h.route(/youtube(-nocookie)?\.com\/embed/, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fulfill({ status: 200, contentType: 'text/html', body: '<body style="margin:0;background:#300"><h1 style="color:#fff">player</h1></body>' }) })
  await h.locator('[data-new]').click(); await wait(1200)
  await h.$eval('.tiptap', (el) => el.editor.commands.insertContentAt(1, [{ type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' } }]))
  await wait(800)
  await h.locator('[data-youtube-video] .mf-video-play').click()
  const read = () => h.evaluate(() => { const st = document.querySelector('[data-youtube-video] .mf-video-stage'); const f = st?.querySelector('iframe'); const img = st?.querySelector('img'); const r = st?.getBoundingClientRect(); return { stage: !!st && r.height > 100, bg: st ? getComputedStyle(st).backgroundColor : null, img: img ? getComputedStyle(img).opacity : null, frame: f ? getComputedStyle(f).opacity : null } })
  const frames = []
  for (let n = 0; n < 8; n++) { frames.push(await read()); if (SHOTS) await h.screenshot({ path: `${SHOTS}/video-${n}.png` }); await wait(150) }
  await wait(1500)
  const after = await read()
  check('play pressed: a dark stage holds the picture while the player loads, never a blank frame', frames.slice(0, 4).every((one) => one.stage && one.img === '0.45' && one.frame === '0'), JSON.stringify(frames.slice(0, 4)))
  check('...and the player fades in over it once loaded', after.frame === '1', JSON.stringify(after))
} catch (error) { check('ran', false, error.stack) } finally { await c.close() }
done()
