// The Journal's page kept to a height on arrival: a long day's words stop at about a third of the window, their
// foot fading into "Show the whole page · N more lines", so the day's tasks stay near. It opens whole on that (and
// stays whole until you leave), and a click in the words opens it with the line clicked staying put. Read, the page
// ends at its last line: no half window of room after it, kept only while writing.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/day-page-cap.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const page = () => h.evaluate(() => {
  const frame = document.querySelector('[data-day-write] .haligtree-editor-wrapper')
  const ed = frame.querySelector('.tiptap')
  return { height: Math.round(frame.getBoundingClientRect().height), room: innerHeight, open: document.querySelector('[data-day-write]').hasAttribute('data-page-open'), more: document.querySelector('[data-page-more]')?.textContent ?? null, pad: getComputedStyle(ed).paddingBottom, faded: getComputedStyle(frame).maskImage !== 'none' }
})
const away = async () => { await c.go('tasks'); await wait(800); await c.go('day'); await h.waitForSelector('[data-day-write] .haligtree-editor-wrapper .tiptap > p', { timeout: 15000 }); await wait(1200) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('day'); await wait(2000)
  await h.evaluate(() => document.querySelector('[data-day-write] .tiptap').focus())
  await h.keyboard.press('Meta+ArrowDown')
  for (let i = 0; i < 30; i++) { await h.keyboard.type(`line ${i}`, { delay: 2 }); await h.keyboard.press('Enter') }
  await wait(600)
  check('writing: the page is whole', (await page()).open && (await page()).height > 700, JSON.stringify(await page()))
  await away()
  const capped = await page()
  check('back on the page: kept to about a third of the window', !capped.open && capped.height <= Math.max(capped.room * 0.34, 204) + 2, JSON.stringify(capped))
  check('its foot fades into "Show the whole page", saying how much more', capped.faded && /Show the whole page\s*· \d+ more lines/.test(capped.more ?? ''), JSON.stringify(capped))
  check('read, the page ends at its last line (no room kept after it)', parseFloat(capped.pad) < 30, capped.pad)
  if (shots) await h.screenshot({ path: `${shots}/day-capped.png` })
  await h.click('[data-page-more] button')
  await wait(900)
  const whole = await page()
  check('"Show the whole page": whole, the button gone, no fade', whole.open && whole.height > 700 && whole.more === null && !whole.faded, JSON.stringify(whole))
  if (shots) await h.screenshot({ path: `${shots}/day-open.png` })
  // A click in the words of a capped page: whole, and the line clicked stays put.
  await away()
  const target = await h.evaluate(() => { const frame = document.querySelector('[data-day-write] .haligtree-editor-wrapper'); const r = frame.getBoundingClientRect(); const one = [...frame.querySelectorAll('.tiptap > p')].filter((p) => { const b = p.getBoundingClientRect(); return b.bottom < r.bottom - 80 && b.top > r.top }).pop(); const b = one.getBoundingClientRect(); return { x: b.left + 12, y: b.top + b.height / 2, text: one.textContent } })
  await h.mouse.click(target.x, target.y)
  await wait(900)
  const after = await h.evaluate((text) => { const b = [...document.querySelectorAll('[data-day-write] .tiptap > p')].find((p) => p.textContent === text).getBoundingClientRect(); return b.top + b.height / 2 }, target.text)
  check('a click in the words opens it whole', (await page()).open && (await page()).height > 700, JSON.stringify(await page()))
  check('and the line clicked does not move', Math.abs(after - target.y) < 3, `${target.y} -> ${after}`)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
