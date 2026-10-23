// Switching between Day, Week, Month and Year moves nothing under the pointer.
// The bar's steady half (Day · Week · Month · Year, ← →, the jump back to now)
// sits in one spot at one width on all four pages; each page's own actions
// sit in their own group at the far right, each with an icon and a word. The
// sidebar keeps exactly one row lit, Journal, on all four, whichever date;
// Week's or Month's page shown as its own row lights that row instead.
// Switched by clicks with the pointer never moving, then by keys.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/period-bar.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 880 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const SCALES = ['Day', 'Week', 'Month', 'Year']

/** Every steady control's box, by name, and the rest of what the bar shows. */
const read = () => h.evaluate(() => {
  const steps = [...document.querySelectorAll('[data-period-steps]')].find((one) => one.getBoundingClientRect().width > 0)
  if (!steps) return null
  const box = (one) => { const r = one.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') }
  const rects = {}
  for (const one of steps.querySelectorAll('button[aria-pressed]')) rects[`tab ${one.getAttribute('aria-label')}`] = box(one)
  for (const one of steps.querySelectorAll('[data-period-step]')) rects[`arrow ${one.dataset.periodStep}`] = box(one)
  const now = steps.querySelector('[data-period-now]')
  if (now) rects.jump = box(now)
  const on = steps.querySelector('button[aria-pressed="true"]')?.getAttribute('aria-label') ?? null
  const actions = [...document.querySelectorAll('[data-period-actions]')].find((one) => one.getBoundingClientRect().width > 0)
  const words = actions ? [...actions.querySelectorAll('button')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => ({ name: one.getAttribute('aria-label') || one.innerText.trim(), word: /[A-Za-z]{2,}/.test(one.innerText.replace(/\s+/g, '')), icon: !!one.querySelector('svg') })) : []
  const lit = [...document.querySelectorAll('[data-side-row][aria-current="page"]:not([inert] *)')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => one.getAttribute('aria-label') || one.innerText.trim())
  return { rects, on, words, lit }
})
const same = (a, b) => Object.keys(a).filter((key) => a[key] !== b[key]).map((key) => `${key} ${a[key]} -> ${b[key]}`)

/** One switch: the steady controls are where they were, the page is the one asked for, Journal (or `row`) alone is lit. */
async function switched(name, act, want, row = 'Journal') {
  const before = await read()
  await act()
  await wait(1000)
  const after = await read()
  check(`${name}: on ${want}`, after?.on === want, after?.on)
  const moved = before && after ? same(before.rects, after.rects) : ['no bar']
  check(`${name}: every tab, arrow and the jump back stay to the pixel`, !moved.length, moved.join(' | '))
  check(`${name}: one sidebar row lit, “${row}”`, after?.lit.length === 1 && after.lit[0] === row, JSON.stringify(after?.lit))
  const bare = (after?.words ?? []).filter((one) => !one.word || !one.icon).map((one) => one.name)
  check(`${name}: each action on the right has an icon and a word`, !bare.length, bare.join(', '))
  return after
}

/** Clicks the tab without the pointer moving off it after: the mouse goes there once and stays. */
const clickTab = (label) => async () => {
  const at = await h.evaluate((label) => {
    const steps = [...document.querySelectorAll('[data-period-steps]')].find((one) => one.getBoundingClientRect().width > 0)
    const r = steps?.querySelector(`button[aria-label="${label}"]`)?.getBoundingClientRect()
    return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, label)
  await h.mouse.move(at.x, at.y)
  await h.mouse.down(); await h.mouse.up()
}
const keys = (...list) => async () => {
  await h.locator('[data-pane-title]').first().click()
  for (const one of list) await h.keyboard.press(one)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await go('day'); await wait(800)
  const first = await read()
  check('Day: the bar has four tabs, two arrows and the jump back', first && Object.keys(first.rects).length === 7, JSON.stringify(first?.rects))
  check('Day: Journal alone is lit', first?.lit.length === 1 && first.lit[0] === 'Journal', JSON.stringify(first?.lit))

  // By clicks, every one to every other, the pointer resting where it clicked.
  for (const from of SCALES) {
    for (const to of SCALES) {
      if (from === to) continue
      await clickTab(from)(); await wait(900)
      await switched(`click ${from} to ${to}`, clickTab(to), to)
    }
  }
  // Each page's own: Day has Mark and Mark looked back, Week Recent, Month Read back, Year none.
  const want = { Day: ['Mark', 'Mark looked back'], Week: ['Recent'], Month: ['Read back'], Year: [] }
  for (const scale of SCALES) {
    await clickTab(scale)(); await wait(900)
    const words = await h.evaluate(() => [...document.querySelectorAll('[data-period-actions]')].find((one) => one.getBoundingClientRect().width > 0)?.innerText.replace(/\s+/g, '') ?? '')
    check(`${scale}: its own actions on the right say ${want[scale].join(', ') || 'nothing'}`, want[scale].every((one) => words.includes(one.replace(/\s+/g, ''))) && (want[scale].length || !words), words)
    // The actions group sits at the bar's far right, apart from the steady half.
    const apart = await h.evaluate(() => {
      const header = [...document.querySelectorAll('[data-period-steps]')].find((one) => one.getBoundingClientRect().width > 0)?.closest('header')
      const actions = header?.querySelector('[data-period-actions]')
      if (!actions) return true
      const pad = parseFloat(getComputedStyle(header).paddingRight)
      return Math.abs(header.getBoundingClientRect().right - pad - actions.getBoundingClientRect().right) <= 2
    })
    check(`${scale}: its actions end at the bar's right edge`, apart)
  }

  // By keys: ← → and T step within a page, G P, G K, G M between them.
  await clickTab('Day')(); await wait(900)
  await switched('← on Day', keys('ArrowLeft'), 'Day')
  await switched('T back to today', keys('t'), 'Day')
  await switched('G K to Week', keys('g', 'k'), 'Week')
  await switched('← on Week', keys('ArrowLeft'), 'Week')
  await switched('G M to Month', keys('g', 'm'), 'Month')
  await switched('→ on Month', keys('ArrowRight'), 'Month')
  await switched('T on Month', keys('t'), 'Month')
  await switched('Year by click', clickTab('Year'), 'Year')
  await switched('← on Year', keys('ArrowLeft'), 'Year')
  await switched('G P to Day', keys('g', 'p'), 'Day')

  // Week's and Month's pages switched on as rows: each lights its own while on it.
  await v('settings:set', { sidebarShown: [...new Set([...(await v('settings')).sidebarShown, 'weekpage', 'monthpage'])] })
  await wait(700)
  await switched("Week, with Week's page a row", clickTab('Week'), 'Week', "Week's page")
  await switched("last week, with Week's page a row", keys('ArrowLeft'), 'Week', "Week's page")
  await switched("Month, with Month's page a row", clickTab('Month'), 'Month', "Month's page")
  await switched('Year still lights Journal', clickTab('Year'), 'Year')
  await switched('Day lights Journal', clickTab('Day'), 'Day')
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
