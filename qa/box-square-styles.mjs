// In Paper (no rounded corners anywhere) quick capture is square too: its one-line card and the open glance tab, with no
// curved feet (the user, 13 Nov, two pictures of the box in Paper: "notice the issue here, im on the paper style which
// has no rounded corners": a round pill inside a square outline, and the tab on curved feet). Soft keeps its round
// pill and its feet. The main window's open tab stands square in Paper too.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-square-styles.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h, page, v } = c
const shots = process.env.QA_SHOTS
// The feet as drawn (tab-row.tsx Foot), found by their curve, whatever marks them.
const FEET = 'svg:has(> path[d="M8 0 V8 H0 A8 8 0 0 0 8 0 Z"])'
const read = (p) => p.evaluate((feet) => {
  const card = document.querySelector('.app-container')
  const shown = [...document.querySelectorAll(feet)].filter((one) => getComputedStyle(one).display !== 'none' && one.getBoundingClientRect().width > 0).length
  return { radius: card ? parseFloat(getComputedStyle(card).borderTopLeftRadius) : null, feet: shown, all: document.querySelectorAll(feet).length }
}, FEET)
const wear = (p, style) => p.evaluate((style) => { if (style === 'soft') delete document.documentElement.dataset.style; else document.documentElement.dataset.style = style }, style)
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, boxHideButtons: false, boxOneLine: true, boxGlance: true })
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  for (const style of ['paper', 'soft']) {
    await wear(page, style)
    await page.waitForTimeout(250)
    const box = await read(page)
    if (shots) await page.screenshot({ path: `${shots}/box-${style}.png` })
    if (style === 'soft') check('Soft: the one-line card keeps its round ends, and the open tab its feet', box.radius >= 20 && box.feet > 0, JSON.stringify(box))
    else check(`${style}: the one-line card is square, and the open tab stands on no curved feet`, box.radius === 0 && box.feet === 0 && box.all > 0, JSON.stringify(box))
  }
  // Aligned (the user, 13 Nov: "aligned?"): the three tabs' words on one line, their tops level, and the open tab's
  // shape still reaching the pill.
  const lined = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-glance-tab]')]
    const word = (tab) => { const r = [...tab.querySelectorAll('span')].at(-1).getBoundingClientRect(); return r.top + r.height / 2 }
    const top = (tab) => (tab.querySelector('[data-glance-round], [data-glance-shape]') ?? tab).getBoundingClientRect().top
    const chosen = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')
    const shape = chosen?.querySelector('[data-glance-shape]')?.getBoundingClientRect()
    const card = document.querySelector('.app-container')?.getBoundingClientRect()
    return { words: tabs.map(word).map(Math.round), tops: tabs.map(top).map(Math.round), shapeFoot: shape ? Math.round(shape.bottom) : null, cardTop: card ? Math.round(card.top) : null }
  })
  const spread = (list) => Math.max(...list) - Math.min(...list)
  check('the three tabs\' words sit on one line, and their tops are level', lined.words.length === 3 && spread(lined.words) <= 1 && spread(lined.tops) <= 1, JSON.stringify(lined))
  check('the open tab\'s shape still reaches down to the pill', lined.shapeFoot !== null && Math.abs(lined.shapeFoot - lined.cardTop) <= 2, JSON.stringify(lined))
  // The main window in Paper: its open tab square, no feet.
  await wear(h, 'paper')
  await h.waitForTimeout(250)
  const main = await read(h)
  check('Paper, the main window: the open tab stands on no curved feet', main.feet === 0 && main.all > 0, JSON.stringify(main))
  await wear(h, 'soft')
  // The other windows of their own (the user, 13 Nov: "im guessting other elements that have their own windows have
  // the same issues e.g the session pill, the goals, stickies etc..."): Paper worn as a person wears it (Settings
  // stores it, every window follows), then every sticky and goal card read for a round corner or a round clip.
  await h.evaluate(() => { localStorage.setItem('style', 'paper'); document.documentElement.dataset.style = 'paper' })
  await h.waitForTimeout(900)
  const others = c.electron.windows().filter((one) => /[?&]view=(sticky|pill|nudge|meeting)/.test(one.url()))
  const rounds = []
  for (const one of others) {
    const found = await one.evaluate(() => {
      const worn = document.documentElement.dataset.style
      const round = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 12 || r.height < 12 || el.closest('[data-keep-soft]')) return false
        const s = getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false
        const radius = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((k) => parseFloat(s[k]) || 0))
        const clip = /round\s+[1-9]/.test(s.clipPath)
        return radius > 0 || clip
      }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`)
      return { worn, round: round.slice(0, 3), count: round.length }
    }).catch(() => null)
    if (found) rounds.push({ view: new URL(one.url()).searchParams.get('view'), ...found })
  }
  check('Paper, every other window of its own (stickies, goal cards, pills): Paper worn, no round corner or round clip', rounds.length > 0 && rounds.every((one) => one.worn === 'paper' && one.count === 0), JSON.stringify(rounds))
  await h.evaluate(() => { localStorage.setItem('style', 'soft'); delete document.documentElement.dataset.style })
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
