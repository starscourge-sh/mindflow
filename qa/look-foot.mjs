// The bar under Files' viewer with a long file name (the user, 14 Nov, a screen recording named "example_guys i am
// making the fastest way to switch between your most used apps_2026-05-12_023316_2875": its "Open in its app" broke
// onto two lines). The bar may use the window's whole width, a button's words never break, the name gives way first,
// and nothing leaves the window, in a wide window and at the smallest one (560 by 400).
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/look-foot.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const here = mkdtempSync(join(tmpdir(), 'look-foot-'))
const NAME = 'example_guys i am making the fastest way to switch between your most used apps_2026-05-12_023316_2875'
const film = join(here, `${NAME}.mp4`)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15:duration=3', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', film])
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
/** The bar's own box, its button's words (how many lines they take), and the name's box. */
const bar = () => h.evaluate(() => {
  const foot = document.querySelector('[data-file-look] .mf-look-foot .tiptap-toolbar')
  const open = document.querySelector('[data-file-look-open] .tiptap-button-text')
  const name = document.querySelector('[data-file-look-name]')
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) } : null }
  const lines = open ? Math.round(open.getBoundingClientRect().height / parseFloat(getComputedStyle(open).lineHeight)) : 0
  return { foot: box(foot), name: box(name), lines, wide: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await electron.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, film)
  await go('media'); await wait(900)
  if (!(await h.locator('[data-media-choose]').count())) await h.locator('[data-media-add]').click()
  await h.locator('[data-media-choose]').click(); await wait(2500)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: /^Videos/ }).first().click(); await wait(1200)
  await h.locator('[data-video-front] .files-video-front-face').click(); await wait(1500)
  const wide = await bar()
  if (process.env.QA_SHOTS) await h.screenshot({ path: join(process.env.QA_SHOTS, 'look-foot-wide.png') })
  check('the viewer is up with its bar', !!wide.foot && !!wide.name, JSON.stringify(wide))
  check('"Open in its app" stays on one line beside a long name', wide.lines === 1, `${wide.lines} lines; bar ${JSON.stringify(wide.foot)} in ${wide.wide}`)
  check('the bar may use more than half the window', !!wide.foot && wide.foot.w > wide.wide / 2, `${wide.foot?.w} of ${wide.wide}`)
  check('the bar stays inside the window', !!wide.foot && wide.foot.l >= 0 && wide.foot.r <= wide.wide && !wide.sideways, JSON.stringify(wide.foot))
  await c.size(560, 400)
  await wait(900)
  const small = await bar()
  if (process.env.QA_SHOTS) await h.screenshot({ path: join(process.env.QA_SHOTS, 'look-foot-small.png') })
  check('at 560 by 400: one line, inside the window, nothing scrolls sideways', small.lines === 1 && !!small.foot && small.foot.l >= 0 && small.foot.r <= small.wide && !small.sideways, JSON.stringify(small))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
  rmSync(here, { recursive: true, force: true })
}
done()
