// The Tasks row's one bar: the tabs Today, Upcoming, Later and Routines on the
// left, the count, "Write out my day" and ⋯. The button stays in the same
// place on every tab (greyed off Today) and reads "Back to the list" while the
// day is written out; ⋯ holds "Urgent and important", "Your order" and
// "I have 15 min" (only with the focus tools on). Nothing in the bar moves:
// every control's place is measured before and after each click.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tasks-bar.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)

/** Every control in the Tasks bar, by its name, with its left and right edge and whether it can be used. */
const bar = () => h.evaluate(() => {
  const header = document.querySelector('[data-page] section header')
  const out = {}
  for (const one of header?.querySelectorAll('button') ?? []) {
    // The write-out button by its words (its tip names it otherwise), the rest by name.
    const name = one.hasAttribute('data-write-day') ? one.querySelector('span:last-child').textContent.trim() : (one.getAttribute('aria-label') || one.textContent || '').replace(/\s+/g, ' ').trim()
    const box = one.getBoundingClientRect()
    if (!box.width) continue
    out[name] = { left: Math.round(box.left), right: Math.round(box.right), off: one.disabled }
  }
  return { out, count: header?.innerText.replace(/\s+/g, ' ').match(/\d+ ?open/)?.[0] ?? null, page: document.querySelector('[data-page]')?.getAttribute('data-page') }
})
const write = () => h.locator('[data-page] header [data-write-day]').first()
/** The places of the controls both bars have, compared: what moved, by how much. */
const moved = (a, b, skip = []) => Object.keys(a.out).filter((name) => b.out[name] && !skip.includes(name) && (Math.abs(a.out[name].left - b.out[name].left) > 1 || Math.abs(a.out[name].right - b.out[name].right) > 1))
  .map((name) => `${name} ${a.out[name].left}→${b.out[name].left}`)
const menu = async () => {
  await h.locator('[data-page] header button[aria-label="More"]').first().click()
  await wait(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  return lines
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, focusTools: false })
  await go('today')
  await wait(900)
  const first = await bar()
  const names = Object.keys(first.out)
  check('the tabs are Today, Upcoming, Later and Routines, in the bar', ['Today', 'Upcoming', 'Later', 'Routines'].every((one) => names.includes(one)), names.join(', '))
  check('no List, Page or Matrix chips', !names.some((one) => ['List', 'Page', 'Matrix'].includes(one)), names.join(', '))
  check('the count says how many are open', /\d+ open/.test(first.count ?? ''), String(first.count))
  check('"Write out my day" is there, after the tabs', first.out['Write out my day'] && first.out['Write out my day'].left > first.out.Routines.right, JSON.stringify(first.out['Write out my day']))
  check('⋯ is last', first.out.More && Object.values(first.out).every((one) => one.right <= first.out.More.right), JSON.stringify(first.out.More))
  const mids = await h.evaluate(() => [...document.querySelectorAll('[data-page] section header button')].filter((one) => one.getBoundingClientRect().width).map((one) => { const r = one.getBoundingClientRect(); return Math.round(r.top + r.height / 2) }))
  check('one row: every control on the same line', Math.max(...mids) - Math.min(...mids) <= 3, mids.join(' '))

  // Write out my day, and back: the same button, the same place.
  await write().click()
  await wait(700)
  const written = await bar()
  check('written out, the button reads "Back to the list"', !!written.out['Back to the list'], Object.keys(written.out).join(', '))
  check('… in the same place', written.out['Back to the list'] && written.out['Back to the list'].left === first.out['Write out my day'].left && written.out['Back to the list'].right === first.out['Write out my day'].right, JSON.stringify(written.out['Back to the list']))
  check('nothing else in the bar moved', moved(first, written).length === 0, moved(first, written).join('; '))
  check('the day is a page to write on', await h.locator('[data-page="today"] [data-day-list], [data-page="today"] .tiptap').count() > 0)
  await write().click()
  await wait(700)
  const back = await bar()
  check('back to the list, it reads "Write out my day" again', !!back.out['Write out my day'])
  check('and nothing moved', moved(first, back).length === 0, moved(first, back).join('; '))

  // Each tab: the controls stay where they were; "Write out my day" greyed off Today.
  for (const tab of ['Upcoming', 'Later', 'Routines', 'Today']) {
    await h.locator(`[data-page] header button[aria-label="${tab}"]`).first().click()
    await wait(900)
    const now = await bar()
    check(`${tab}: on its own tab`, now.page === tab.toLowerCase(), now.page)
    check(`${tab}: "Write out my day" in its place${tab === 'Today' ? '' : ', greyed'}`, now.out['Write out my day'] && now.out['Write out my day'].left === first.out['Write out my day'].left && now.out['Write out my day'].off === (tab !== 'Today'), JSON.stringify(now.out['Write out my day']))
    check(`${tab}: nothing in the bar moved`, moved(first, now).length === 0, moved(first, now).join('; '))
  }

  // ⋯: what it holds, with the focus tools off and on.
  const off = await menu()
  check('⋯ holds "Urgent and important" and "Your order"', off.some((one) => one.startsWith('Urgent and important')) && off.some((one) => one.startsWith('Your order')), off.join(' | '))
  check('⋯ has no "I have 15 min" with the focus tools off', !off.some((one) => one.startsWith('I have')), off.join(' | '))
  await h.keyboard.press('Escape')
  await v('settings:set', { focusTools: true })
  await wait(700)
  const on = await menu()
  check('⋯ has "I have 15 min" with the focus tools on', on.some((one) => one.startsWith('I have 15 min')), on.join(' | '))
  // Urgent and important: today's tasks in four boxes, the bar where it was.
  const before = await bar()
  await h.locator('[role=menu] [role^=menuitem]', { hasText: 'Urgent and important' }).first().click()
  await wait(900)
  await h.keyboard.press('Escape')
  await wait(300)
  const boxes = await bar()
  check('"Urgent and important" shows today\'s tasks in four boxes', await h.locator('[data-page="today"] [data-quadrant]').count() === 4)
  check('… with the same tabs and button in the same places', moved(before, boxes, ['More']).length === 0 && !!boxes.out['Write out my day'], moved(before, boxes).join('; ') + ' ' + Object.keys(boxes.out).join(','))
  // Back to the list from ⋯.
  await menu()
  await h.locator('[role=menu] [role^=menuitem]', { hasText: 'Urgent and important' }).first().click()
  await wait(700)
  await h.keyboard.press('Escape')
  check('chosen again, the list is back', await h.locator('[data-page="today"] [data-quadrant]').count() === 0)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
