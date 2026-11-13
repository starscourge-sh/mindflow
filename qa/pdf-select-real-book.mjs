// Picking one line on a real magazine page (the user, 13 Nov: "why all the selection, because i was just tryign to
// select this line first", The Crime Book, printed p. 54, the file's 56th): dragged along "On the night of 16 February
// 2003," and on past its end over the page, the selection is that line, never the "In context" box and everything
// between; dragged half way along it, half the line.
//   BOOK=<a COPY of the-crime-book.pdf> QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-select-real-book.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const BOOK = process.env.BOOK
const { check, done } = checks()
if (!BOOK) throw new Error('BOOK=/path/to/a-copy-of-the-crime-book.pdf')
const c = await sandbox({ width: 1400, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const [book] = (await v('media:add', [{ path: BOOK }])).added
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'crime.pdf', page: 56 } })), book.src)
  const line = h.locator('.pdf-reader .pdf-page[data-page="56"] .textLayer span', { hasText: 'On the night of 16' }).first()
  await line.waitFor({ timeout: 30000 })
  await line.scrollIntoViewIfNeeded()
  await wait(1500)
  const at = await line.boundingBox()
  check('the line is on the page, with the box above it in the page', !!at)
  const pick = async (from, to) => {
    await h.evaluate(() => window.getSelection()?.removeAllRanges())
    await h.mouse.move(from.x, from.y); await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await wait(25) }
    await h.mouse.up(); await wait(300)
    return h.evaluate(() => window.getSelection()?.toString() ?? '')
  }
  const y = at.y + at.height / 2
  // Past the line's end into the gap before the next column's words, never onto them (half the gap, at most 60px):
  // onto them, any reader rightly selects up to there.
  const next = await h.evaluate(([y, right]) => Math.min(...[...document.querySelectorAll('.pdf-reader .pdf-page[data-page="56"] .textLayer span')].map((one) => one.getBoundingClientRect()).filter((b) => b.top <= y && b.bottom >= y && b.left > right + 1).map((b) => b.left)), [y, at.x + at.width])
  const past = Number.isFinite(next) ? Math.min(60, (next - (at.x + at.width)) / 2) : 60
  console.log(`line ends at ${Math.round(at.x + at.width)}, the next words at ${Math.round(next)}, dragging ${Math.round(past)}px past its end`)
  const whole = await pick({ x: at.x + 1, y }, { x: at.x + at.width + past, y: y + 2 })
  console.log('picked:', JSON.stringify(whole.length > 300 ? `${whole.slice(0, 120)} … ${whole.slice(-120)}` : whole))
  if (shots) await h.screenshot({ path: `${shots}/crime-54-line.png` })
  check('dragged along the line and past its end: that line, all of it', /^\s*On the night of 16 February 2003,\s*$/.test(whole), JSON.stringify(whole.slice(0, 200)))
  check('and nothing of the "In context" box or the columns beside it', !/LOCATION|THEME|BEFORE|AFTER|Antwerp Diamond Centre|Notarbartolo|Despite/.test(whole), JSON.stringify(whole.slice(0, 200)))
  const half = await pick({ x: at.x + 1, y }, { x: at.x + at.width / 2, y })
  check('dragged half way along it: about half the line, from its start', /^On the night/.test(half) && half.length < 'On the night of 16 February 2003,'.length, JSON.stringify(half))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (e) {
  check('the run finished', false, String(e?.message ?? e).split('\n')[0])
} finally {
  await c.close()
}
done()
