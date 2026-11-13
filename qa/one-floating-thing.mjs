// One floating thing at a time: with a popover up, a real click on something else leaves at most that thing's own
// popover or menu, never the first one as well. The user found two icon pickers up at once in the sidebar (12 Nov;
// mended, qa/one-icon-picker.mjs); this walks the other pairs a person can reach in the example book: a task's date
// picker, a tag's colours or a folder's icon picker up, then a click on another date, a priority chip, a row, a
// tick, a tab, the sidebar, “New”, the sound button, a card on Home.
//
// Why it holds, so nobody "mends" it the wrong way again (13 Nov, read in @radix-ui/react-dismissable-layer 1.1.19):
// a popover acts on a press outside at the CLICK, and not at all if the click (or the mouse events before it) was
// stopped on its way to the document; while it waits, focus leaving is ignored. A control that stops its press where
// it is (`stopPropagation` on pointerdown, as a row's date and tag chips do) is never waited for, and the popover
// closes because focus leaves it, which needs the pressed thing to take focus (a button, or a span with a tabindex).
// So: letting such a control's press through while its click is still stopped makes two pickers stay up (tried,
// and it did). A new control inside a row either takes focus, or lets the press AND the click through.
//
//   QA_DATA=<a seeded sandbox copy> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/one-floating-thing.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)

/** What floats now, each with where it stands: popovers, menus, and ⌘K or any other dialog. */
const up = () => h.evaluate(() => [...new Set(document.querySelectorAll('[data-slot="popover-content"], [role="menu"], [role="dialog"]'))]
  .filter((one) => one.getClientRects().length && one.getAttribute('data-state') !== 'closed')
  .map((one) => { const b = one.getBoundingClientRect(); return { kind: one.getAttribute('role') === 'menu' ? 'menu' : one.matches('[data-slot="popover-content"]') ? 'popover' : 'dialog', top: Math.round(b.top), left: Math.round(b.left) } }))
const clear = async () => { for (let n = 0; n < 3 && (await up()).length; n++) { await h.keyboard.press('Escape'); await wait(350) } }
/**
 * The first of these a press would really land on: in sight, and itself (or its own inside) the topmost thing at its
 * middle. A row scrolled under the sidebar's search field has a box and is not there to press: a press at its
 * middle opens the search instead (the first version of this walk did exactly that and went on with ⌘K open).
 */
const uncovered = async (locator, skip = 0, not = [-99, -99]) => {
  for (let i = skip, n = Math.min(await locator.count(), 40); i < n; i++) {
    const at = await locator.nth(i).evaluate((one, not) => {
      const b = one.getBoundingClientRect()
      const [x, y] = [b.left + b.width / 2, b.top + b.height / 2]
      if (b.width < 2 || y < 8 || y > innerHeight - 20) return null
      if (Math.abs(x - not[0]) < 4 && Math.abs(y - not[1]) < 4) return null   // the very thing that was opened
      const top = document.elementFromPoint(x, y)
      return top && (one === top || one.contains(top)) ? [x, y] : null
    }, not)
    if (at) return at
  }
  return null
}

/**
 * One pair: `open` puts the first thing up (a locator to click), then a real click on the first uncovered `then`.
 * Passes when what floats afterwards is nothing, or one thing that is not the first (it stands somewhere else).
 */
const pair = async (name, page, open, then, skip = 0) => {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return
  await go(page); await wait(700); await clear()
  await h.evaluate(() => { for (const one of document.querySelectorAll('aside *')) if (one.scrollTop) one.scrollTop = 0 })
  const first = h.locator(open).nth(open.includes('data-date-chip') || (open === then && !skip) ? 1 : 0)
  if (!(await first.count())) return check(`${name}: the first thing is on the page`, false, open)
  await first.scrollIntoViewIfNeeded()
  const box = await first.boundingBox()
  const was = [box.x + box.width / 2, box.y + box.height / 2]
  await h.mouse.click(was[0], was[1]); await wait(500)
  const before = await up()
  if (before.length !== 1) {
    // Why not, said in the line: what stands where the press went, and what holds the keys.
    const why = await h.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return { under: one ? `${one.tagName.toLowerCase()} “${(one.textContent ?? '').trim().slice(0, 16)}” in ${one.closest('[role="dialog"], [role="menu"]') ? 'something floating' : one.closest('aside') ? 'the sidebar' : 'the page'}` : 'nothing', keys: `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('aria-label') ?? ''}` } }, was)
    if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/not-opened-${name.replace(/[^a-z]+/gi, '-').slice(0, 40)}.png` })
    return check(`${name}: the first thing opens, alone`, false, JSON.stringify({ before, why, at: was.map(Math.round) }))
  }
  const at = await uncovered(h.locator(then), skip, was)
  if (!at) return check(`${name}: the second thing is in reach`, false, then)
  await h.mouse.click(at[0], at[1]); await wait(650)
  const after = await up()
  const same = (one) => one.kind === before[0].kind && Math.abs(one.top - before[0].top) < 3 && Math.abs(one.left - before[0].left) < 3
  check(name, after.length === 0 || (after.length === 1 && !same(after[0])), JSON.stringify({ before, after }))
  await clear()
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  const DATE = '[data-pane] [data-task-row] [data-date-chip]'
  await pair('a date picker, then another task\'s date', 'alltasks', DATE, DATE)
  await pair('a date picker, then a task\'s priority', 'alltasks', DATE, '[data-pane] [data-chip-choices]')
  await pair('a date picker, then a task\'s own words (the row)', 'alltasks', DATE, '[data-pane] [data-task-row] [data-row]')
  await pair('a date picker, then a task\'s tick', 'alltasks', DATE, '[data-pane] [data-task-row] [data-task-tick]')
  await pair('a date picker, then the sidebar\'s Home', 'alltasks', DATE, 'aside [data-side-row][data-side-view="home"], aside [data-side-row]')
  await pair('a date picker, then a tab of Tasks', 'alltasks', DATE, '[data-pane] [role="tab"], [data-pane] [data-tab]')
  await pair('a date picker, then “New” at the top', 'alltasks', DATE, 'button:has-text("New")')
  await pair('a date picker, then the sound button', 'alltasks', DATE, 'button[aria-label="Turn sounds off"], button[aria-label="Turn sounds on"]')
  await pair('a date picker, then a folder\'s icon in the sidebar', 'alltasks', DATE, 'aside [data-folder-icon]')
  const HUE = 'aside [data-tag-colour]'
  await pair('a tag\'s colours, then a task\'s date', 'alltasks', HUE, DATE)
  await pair('a tag\'s colours, then a task\'s tick', 'alltasks', HUE, '[data-pane] [data-task-row] [data-task-tick]')
  await pair('a tag\'s colours, then another tag\'s icon', 'home', HUE, HUE, 1)
  await pair('a tag\'s colours, then a folder\'s icon', 'home', HUE, 'aside [data-folder-icon]')
  await pair('a tag\'s colours, then a sidebar row', 'home', HUE, 'aside [data-side-row]')
  await pair('a tag\'s colours, then a card on Home', 'home', HUE, '[data-pane] [data-recent-card], [data-pane] a, [data-pane] button')
  const ICON = 'aside [data-folder-icon]'
  // The pair the user found (12 Nov): it failed, two pickers, until a press in the sidebar's folders reached the document.
  await pair('a folder\'s icon picker, then another folder\'s icon', 'home', ICON, ICON)
  await pair('a folder\'s icon picker, then a sidebar row', 'home', ICON, 'aside [data-side-row]')
  await pair('a folder\'s icon picker, then a card on Home', 'home', ICON, '[data-pane] [data-recent-card], [data-pane] a, [data-pane] button')
  await pair('a folder\'s icon picker, then “New” at the top', 'home', ICON, 'button:has-text("New")')
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
}
done()
