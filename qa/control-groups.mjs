// Controls of one kind sit together. For each bar fixed, read its controls in
// order, name each one a filter (what the list holds), an action (does
// something once) or a view (how the list is shown), and check every kind is
// one unbroken run: filters first on the line's left, by the content they
// filter, the views at the far right. A filter also stays put when clicked.
//   Inbox: "Show sorted too" left; Go through…; Display and Spread right; Graph last in the chip row.
//   Pages and Questions: All / Questions left; New page; Read through, Display, Spread right.
//   Goals: Open / Ended left; All on one sticky, New goal right.
//   Tasks ⋯: the ticks (Urgent and important, Your order) in one part, "I have 15 min" with the other things to do.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/control-groups.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 950 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)

const KINDS = {
  filter: /^(All|Questions|Open|Ended|Show sorted too|Note|Task|Quote|Word|Link|Check back|Which tasks.*)$/,
  action: /^(New page|New question|New goal|All on one sticky|Go through…|\d+ to sort|Two at random)$/,
  view: /^(Read through|Display.*|Spread the list over the page|Back beside the note|Fold the list to pictures|Graph)$/
}
const kindOf = (name) => Object.keys(KINDS).find((kind) => KINDS[kind].test(name)) ?? '?'
/** The controls of a bar, left to right, with their kind and place. */
const controls = (selector) => h.evaluate((selector) => {
  const bar = [...document.querySelectorAll(selector)].find((one) => one.getBoundingClientRect().width > 0)
  if (!bar) return []
  return [...bar.querySelectorAll('button, label')]
    .filter((one) => one.getBoundingClientRect().width > 0 && !one.parentElement.closest('button, label'))
    .map((one) => ({ name: (one.getAttribute('aria-label') || one.innerText).replace(/\s+/g, ' ').trim(), left: Math.round(one.getBoundingClientRect().left) }))
    .sort((a, b) => a.left - b.left)
}, selector)
/** Each kind one unbroken run, in the order given. */
const runs = (list) => list.map((one) => kindOf(one.name)).filter((kind, at, all) => kind !== all[at - 1])
const said = (list) => list.map((one) => `${one.name}:${kindOf(one.name)}`).join(' | ')
const HEADER = '[data-page] header'

async function bar(name, page, order) {
  await go(page); await wait(900)
  const list = await controls(HEADER)
  const got = runs(list)
  check(`${name}: nothing unnamed in the bar`, !got.includes('?'), said(list))
  check(`${name}: ${order.join(', then ')}, each in one run`, got.join(',') === order.join(','), said(list))
  // The filters on the line's left half, by the list; the rest on its right.
  const middle = await h.evaluate((selector) => { const box = [...document.querySelectorAll(selector)].find((one) => one.getBoundingClientRect().width > 0).getBoundingClientRect(); return box.left + box.width / 2 }, HEADER)
  const wrong = list.filter((one) => (kindOf(one.name) === 'filter') !== (one.left < middle)).map((one) => one.name)
  check(`${name}: the filters on the left, the rest on the right`, !wrong.length, wrong.join(', '))
  return list
}
/** A filter clicked stays where it was, and so do the controls beside it. */
async function stays(name, click, back = click, selector = HEADER) {
  const before = await controls(selector)
  await click(); await wait(900)
  const after = await controls(selector)
  const moved = before.filter((one) => { const now = after.find((other) => other.name === one.name); return now && Math.abs(now.left - one.left) > 1 }).map((one) => one.name)
  check(`${name}: clicked, nothing in the bar moves`, !moved.length, moved.join(', '))
  await back(); await wait(900)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false, focusTools: true })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })

  // Inbox: the switch on the left, then what you do, then how it shows.
  await bar('Inbox', 'inbox', ['filter', 'action', 'view'])
  await wait(600)
  await stays('Inbox "Show sorted too"', () => h.locator(`${HEADER} [data-sorted-too] button[role=switch]`).first().click())
  const chips = await controls('[data-page] [data-kind-chips]')
  check('Inbox chips: the kinds, then Graph at the far end', runs(chips).join(',') === 'filter,view' && chips.at(-1)?.name === 'Graph', said(chips))
  const gap = chips.length > 1 ? chips.at(-1).left - chips.at(-2).left : 0
  check('Inbox chips: Graph stands well apart from the last kind', gap > 200, `${gap}px`)
  await bar('Inbox, sorted too on', 'all', ['filter', 'action', 'view'])

  // Pages and its questions: the two chips on the left, New page, then the views.
  await bar('Pages', 'articles', ['filter', 'action', 'view'])
  // By its words as drawn (a chip holds its bold width in a hidden copy of them).
  const chip = (word) => async () => {
    const at = await h.evaluate(([selector, word]) => { const one = [...document.querySelectorAll(`${selector} button`)].find((b) => b.getBoundingClientRect().width > 0 && b.innerText.trim() === word)?.getBoundingClientRect(); return one && { x: one.left + one.width / 2, y: one.top + one.height / 2 } }, [HEADER, word])
    if (at) await h.mouse.click(at.x, at.y)
  }
  await stays('Pages "Questions"', chip('Questions'), chip('All'))
  await bar('Questions', 'questions', ['filter', 'action', 'view'])

  // Goals: which goals on the left, the buttons that make or gather them on the right.
  await bar('Goals', 'goals', ['filter', 'action'])
  await stays('Goals "Ended"', chip('Ended'), chip('Open'))

  // Tasks ⋯: the ticks together, and the things to do in a part of their own.
  await go('today'); await wait(900)
  await h.locator(`${HEADER} button[aria-label="More"]`).first().click(); await wait(500)
  const parts = await h.evaluate(() => {
    const out = [[]]
    for (const one of document.querySelectorAll('[role=menu] [role^=menuitem], [role=menu] [role=separator]')) {
      if (one.getAttribute('role') === 'separator') out.push([])
      else out.at(-1).push(one.textContent.replace(/\s+/g, ' ').trim())
    }
    return out.filter((part) => part.length)
  })
  const partOf = (start) => parts.findIndex((part) => part.some((one) => one.startsWith(start)))
  check('Tasks ⋯: "Urgent and important" and "Your order" share a part', partOf('Urgent and important') >= 0 && partOf('Urgent and important') === partOf('Your order'), JSON.stringify(parts))
  check('Tasks ⋯: "I have 15 min" sits with "Stick Today on the desktop", not among the ticks', partOf('I have 15 min') >= 0 && partOf('I have 15 min') === partOf('Stick Today on the desktop') && partOf('I have 15 min') !== partOf('Your order'), JSON.stringify(parts))
  await h.keyboard.press('Escape')
} finally {
  await c.close()
}
done()
