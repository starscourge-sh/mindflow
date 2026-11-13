// Writing on a day's page, the window round the page goes the page's own colour with the sidebar and the tabs, so the
// words sit on one surface (the user, 13 Nov, a picture of Evening pages in writing mode: "look at the black bars": the
// bar and the sidebar faded, the dark frame under them stayed, a page-coloured card with black bars along its top and
// side). Leaving writing, the frame comes back. Both looks, with the dark frame on.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/write-one-surface.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const today = new Date().toLocaleDateString('en-CA')
// Each colour as the screen draws it (any CSS colour, through a canvas pixel).
const colours = () => h.evaluate(() => {
  const ctx = document.createElement('canvas').getContext('2d')
  const px = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  const frame = document.querySelector('[data-frame="dark"]') ?? document.body
  const card = document.querySelector('[data-day-write]')?.closest('[data-pane-card]')
  return { frame: px(getComputedStyle(frame).backgroundColor), card: card ? px(getComputedStyle(card).backgroundColor) : null, writing: document.documentElement.hasAttribute('data-day-writing'), dark: !!document.querySelector('[data-frame="dark"]') }
})
const near = (a, b) => !!a && !!b && a.every((x, i) => Math.abs(x - b[i]) <= 3)
try {
  await v('settings:set', { sounds: false, hintRate: 0, writingStay: false, darkFrame: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    await go('inbox')
    await v('notes:day:save', today, { body: null })
    await send('day', today)
    await wait(1200)
    const before = await colours()
    check(`${look}: before writing, the dark frame stands round the page`, before.dark && !near(before.frame, before.card), JSON.stringify(before))
    await h.click('[data-page] [data-day-write] .ProseMirror')
    await h.keyboard.type('The morning was slow and grey and the rain kept on ', { delay: 30 })
    await wait(1600)
    const writing = await colours()
    if (shots) await h.screenshot({ path: `${shots}/write-one-surface-${look}.png` })
    check(`${look}: writing, the window round the page is the page's own colour: no bars`, writing.writing && near(writing.frame, writing.card), JSON.stringify(writing))
    await h.keyboard.press('Escape')
    await wait(1600)
    const after = await colours()
    check(`${look}: Esc, and the frame is back round the page`, !after.writing && !near(after.frame, after.card), JSON.stringify(after))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
