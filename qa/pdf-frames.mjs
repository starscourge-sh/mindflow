// Frames every 50ms through the PDF reader's moments, light and dark, for reading by eye: opening a book,
// a fast scroll, find as you type, a page turn with →; then the window at its smallest (560 x 400).
// Checks what can be measured: the bar's tools never move, the page box never jumps sideways, nothing runs
// off the side at 560 wide.
//   BOOK=/path/crime.pdf SHOT=/tmp/frames QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-frames.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? '/tmp/pdf-frames'
const BOOK = process.env.BOOK
const { check, done } = checks()
if (!BOOK) throw new Error('BOOK=/path/to/the-crime-book.pdf')
mkdirSync(SHOT, { recursive: true })

const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const tools = () => h.evaluate(() => [...document.querySelectorAll('.pdf-reader-bar button, .pdf-reader-bar [data-scrub-field]')].map((one) => { const r = one.getBoundingClientRect(); return `${one.getAttribute('aria-label')}@${Math.round(r.left)},${Math.round(r.top)}` }).join(' '))
/** `n` frames 50ms apart while `act` runs, named `name-NN`; the bar's tools read on each. */
const film = async (name, n, act) => {
  const bars = []
  const going = act()
  for (let i = 0; i < n; i++) {
    await h.screenshot({ path: `${SHOT}/${name}-${String(i).padStart(2, '0')}.png` })
    bars.push(await tools())
    await wait(50)
  }
  await going
  return bars
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('pdf-rail', 'pages'))
  const [book] = (await v('media:add', [{ path: BOOK }])).added
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    const open = await film(`${theme}-open`, 12, () => h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'crime.pdf', page: 48 } })), book.src))
    await wait(1500)
    const steady = open.filter(Boolean).slice(-6)
    check(`${theme}: once open, the bar's tools hold still`, steady.every((one) => one === steady[0]), steady[0])
    const box = await h.$('.pdf-reader-scroll').then((el) => el.boundingBox())
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const scroll = await film(`${theme}-scroll`, 16, async () => { for (let i = 0; i < 40; i++) { void h.mouse.wheel(0, 600); await wait(16) } })
    check(`${theme}: a fast scroll never moves the bar's tools`, new Set(scroll.map((one) => one.replace(/Page@\S+/, ''))).size === 1, '')
    await wait(800)
    await h.click('.pdf-reader-scroll', { position: { x: 20, y: 200 } })
    await h.keyboard.press('Meta+f'); await wait(200)
    await film(`${theme}-find`, 14, () => h.keyboard.type('murder', { delay: 40 }))
    await h.keyboard.press('Escape'); await wait(300)
    await h.click('.pdf-reader-scroll', { position: { x: 20, y: 200 } })
    const turn = await film(`${theme}-turn`, 8, () => h.keyboard.press('ArrowRight'))
    check(`${theme}: → turns a page with the bar still`, new Set(turn.map((one) => one.replace(/Page@\S+/, ''))).size === 1, '')
  }
  // The window at its smallest.
  await c.look('light')
  await c.size(560, 400); await wait(1200)
  await h.screenshot({ path: `${SHOT}/small-light.png` })
  await c.look('dark'); await wait(300)
  await h.screenshot({ path: `${SHOT}/small-dark.png` })
  const small = await h.evaluate(() => {
    const reader = document.querySelector('.pdf-reader').getBoundingClientRect()
    const out = [...document.querySelectorAll('.pdf-reader-bar *')].filter((one) => { const r = one.getBoundingClientRect(); return r.width && (r.right > reader.right + 1 || r.left < reader.left - 1) }).map((one) => one.getAttribute('aria-label') || one.className).slice(0, 5)
    const page = document.querySelector('.pdf-reader [data-scrub-field]')?.getBoundingClientRect()
    return { out, sideways: document.querySelector('.pdf-reader-scroll').scrollWidth > document.querySelector('.pdf-reader-scroll').clientWidth + 1, page: page && Math.round(page.width) }
  })
  check('560 x 400: nothing in the bar runs off the side', small.out.length === 0, JSON.stringify(small))
  check('560 x 400: the page box is still there to type in', small.page >= 32, JSON.stringify(small))
} finally {
  await c.close()
}
done()
