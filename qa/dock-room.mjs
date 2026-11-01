// A corner card at the sidebar's foot (the "100 captures kept" milestone) takes its own room:
// the sidebar's list ends above it, and no row is drawn, faded or not, under or behind the card.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/dock-room.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, errors } = c
const shots = process.env.QA_SHOTS
try {
  // The sandbox sits just under 100 captures: a few more cross it, and the milestone card comes.
  const card = h.locator('[data-corner-dock] [data-celebration] > *').first()
  for (let n = 0; n < 6 && !(await card.isVisible().catch(() => false)); n++) {
    await h.evaluate((k) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `One more thought, ${k}` }] }] } }), n)
    await card.waitFor({ timeout: 2500 }).catch(() => {})
  }
  await h.waitForTimeout(800)
  const read = () => h.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) } }
    const dock = document.querySelector('[data-corner-dock]')
    const card = dock?.querySelector('[data-celebration] > *')
    const nav = document.querySelector('aside nav')
    // The box the list scrolls in: its visible bottom is where the list's room ends.
    let scroller = nav
    while (scroller && scroller !== document.body && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    const room = scroller ? box(scroller) : null
    const style = scroller ? getComputedStyle(scroller) : null
    return { card: card ? box(card) : null, room, line: dock ? getComputedStyle(dock).borderTopWidth : null, gap: card && room ? Math.round(card.getBoundingClientRect().top - room.bottom) : null }
  })
  const m = await read()
  if (shots) await h.screenshot({ path: `${shots}/dock-room.png` })
  console.log(JSON.stringify(m))
  check('1. the milestone card shows at the sidebar foot', !!m.card)
  check('2. the list\'s room ends above the card (nothing drawn behind it)', !!m.card && !!m.room && m.room.bottom <= m.card.top, JSON.stringify(m))
  check('3. a hairline and a gap set the card apart from the list', m.line === '1px' && m.gap >= 8, `${m.line} ${m.gap}px`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
}
done()
