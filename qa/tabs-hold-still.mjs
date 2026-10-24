// Every bar of tabs holds still: on each page with tabs or modes (Tasks, Pages,
// the Inbox, Goals, Calendar, Review, Stats, Home, Settings), each tab is
// clicked with the pointer resting where it clicked, and every tab of that row
// must be in the same place, to the pixel, afterwards. The sidebar keeps one
// row lit through it all, the page's own (Settings has none).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tabs-hold-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)

// Page, the sidebar row it lights (null: none), and a note on where its tabs are.
const PAGES = [
  ['today', 'Tasks'], ['articles', 'Writing'], ['inbox', 'Inbox'], ['all', 'Inbox'], ['goals', 'Goals'], ['calendar', 'Calendar'],
  ['review', 'Review'], ['stats', 'Stats'], ['home', 'Home'], ['nuggets', 'Gems'], ['settings', null, '[data-section]']
]
const TABS = 'button[aria-pressed], [role="tab"], [role="radio"]'

/** Each row of tabs on the page: two or more pressable buttons side by side under one parent, by name and box. */
const rows = (pick = TABS) => h.evaluate((pick) => {
  const page = [...document.querySelectorAll('[data-page]')].find((one) => one.getBoundingClientRect().width > 0) ?? document.body
  const groups = new Map()
  for (const one of page.querySelectorAll(pick)) {
    const r = one.getBoundingClientRect()
    if (!r.width || one.closest('[role=dialog], [data-radix-popper-content-wrapper]')) continue
    const parent = one.parentElement?.closest('[role=tablist]') ?? (one.parentElement?.matches('[data-state]') ? one.parentElement.parentElement : one.parentElement)
    if (!groups.has(parent)) groups.set(parent, [])
    groups.get(parent).push({ name: (one.getAttribute('aria-label') || one.textContent).replace(/\s+/g, ' ').trim(), box: [r.left, r.top, r.width, r.height].map(Math.round).join(',') })
  }
  return [...groups.values()].filter((list) => list.length >= 2 && new Set(list.map((one) => one.name)).size === list.length)
}, pick)
const lit = () => h.evaluate(() => [...document.querySelectorAll('[data-side-row][aria-current="page"]:not([inert] *)')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => one.getAttribute('aria-label') || one.innerText.trim()))
const clickAt = async (name, row, pick = TABS) => {
  const at = await h.evaluate(([name, names, pick]) => {
    const page = [...document.querySelectorAll('[data-page]')].find((one) => one.getBoundingClientRect().width > 0) ?? document.body
    const one = [...page.querySelectorAll(pick)].find((b) => b.getBoundingClientRect().width > 0 && (b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim() === name && names.length)
    const r = one?.getBoundingClientRect()
    return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, [name, row.map((one) => one.name), pick])
  if (!at) return false
  await h.mouse.move(at.x, at.y)
  await h.mouse.down(); await h.mouse.up()
  return true
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, focusTools: true })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  // The sandbox's "You're in the sandbox" line folds away on its own (9 s, page-hint.tsx) and lifts
  // every page with it: let it go first, so a switch is not blamed for its leaving.
  await go('day')
  for (let i = 0; i < 60 && await h.evaluate(() => !!document.querySelector('[role="note"]')); i++) await wait(250)
  await wait(600)
  for (const [page, row, pick = TABS] of PAGES) {
    await go(page); await wait(900)
    const found = await rows(pick)
    console.log(`  ${page}: ${found.map((list) => list.map((one) => one.name).join(' · ')).join('  |  ') || 'no tabs'}`)
    for (const tabs of found) {
      // Only rows of tabs: a long run of pressable things is a picker (themes), not tabs.
      if (tabs.length > 12) continue
      const names = tabs.map((one) => one.name)
      for (const name of [...names.slice(1), names[0]]) {
        const before = (await rows(pick)).find((list) => list.some((one) => one.name === name) && list.length === tabs.length)
        if (!before || !(await clickAt(name, before, pick))) continue
        await wait(800)
        const after = (await rows(pick)).find((list) => list.some((one) => one.name === name))
        const moved = before.filter((one) => { const now = after?.find((other) => other.name === one.name); return !now || now.box !== one.box }).map((one) => `${one.name} ${one.box} -> ${after?.find((other) => other.name === one.name)?.box ?? 'gone'}`)
        check(`${page}, “${name}”: every tab of ${names.join(' · ')} stays to the pixel`, !moved.length, moved.join(' | '))
        const now = await lit()
        check(`${page}, “${name}”: the sidebar lights ${row ? `“${row}” alone` : 'no row'}`, row ? now.length === 1 && now[0] === row : now.length === 0, JSON.stringify(now))
      }
    }
  }
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
