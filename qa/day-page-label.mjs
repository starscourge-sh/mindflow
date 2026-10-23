// A day's, week's or month's page on another day says which in the top bar,
// and the sidebar keeps its row lit on any date (Journal for a day; Week's or
// Month's page when shown as a row). Asking for that row by name from another
// day goes to now; Back returns.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-page-label.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 820 })
const { h, go, send, v } = c
const key = (d) => d.toLocaleDateString('en-CA')
const monthWord = (d) => d.toLocaleDateString('en-GB', { month: 'long' })
const title = async () => {
  await h.waitForTimeout(500)
  return (await h.textContent('[data-pane-title]'))?.trim()
}
const lit = (label) => h.evaluate((name) => document.querySelector(`[data-side-row][aria-label="${name}"]`)?.getAttribute('aria-current') ?? null, label)
const row = (label) => h.$(`[data-side-row][aria-label="${label}"]`)

try {
  const now = new Date()
  // A day this month that is not today or either side of it.
  const pick = new Date(now)
  pick.setDate(now.getDate() > 20 ? 10 : 25)
  const picked = key(pick)

  // 1. From the Month's page, a day clicked.
  await go('monthpage')
  await h.click(`[data-grid-day="${picked}"]`)
  await h.waitForTimeout(900)
  check('1. top bar names the clicked day', (await title()) === `${pick.getDate()} ${monthWord(pick)}`, await title())
  check('1. sidebar keeps Journal lit on another day', (await lit('Journal')) === 'page', await lit('Journal'))

  // 2. Today's page asked for from there: today, lit.
  await (await row('Journal')).click()
  await h.waitForTimeout(900)
  check('2. sidebar Journal goes to today', (await title()) === 'Journal', await title())
  check('2. its row is lit on today', (await lit('Journal')) === 'page')
  const heading = await h.textContent('[data-page="day"] h1').catch(() => '')
  check('2. the page itself is today', heading?.startsWith('Today'), heading)

  // 3. Back returns to the clicked day.
  await h.keyboard.press('Meta+BracketLeft')
  check('3. Back returns to the day', (await title()) === `${pick.getDate()} ${monthWord(pick)}`, await title())
  await h.keyboard.press('Meta+BracketRight')
  check('3. Forward to today again', (await title()) === 'Journal', await title())

  // 4. Yesterday and Tomorrow by name.
  const y = new Date(now); y.setDate(now.getDate() - 1)
  const t = new Date(now); t.setDate(now.getDate() + 1)
  await send('day', key(y))
  check('4. yesterday says Yesterday', (await title()) === 'Yesterday', await title())
  await send('day', key(t))
  check('4. tomorrow says Tomorrow', (await title()) === 'Tomorrow', await title())
  // G P from another day goes to today too.
  await h.click('[data-pane-title]')
  await h.keyboard.press('g')
  await h.keyboard.press('p')
  check('4. G P goes to today', (await title()) === 'Journal', await title())

  // 5. The Week's page a week back: named, still lit, and its row brings this week.
  // First with Week's page not a row (Journal stays lit), then with it and Month's page switched on as rows.
  await go('weekpage')
  await h.click('[data-pane-title]')
  await h.keyboard.press('ArrowLeft')
  await h.waitForTimeout(500)
  check('5. Journal stays lit on last week while Week’s page is no row', (await lit('Journal')) === 'page', await lit('Journal'))
  await v('settings:set', { sidebarShown: [...new Set([...(await v('settings')).sidebarShown, 'weekpage', 'monthpage'])] })
  await h.waitForTimeout(500)
  await go('weekpage')
  check('5. this week says Week’s page', (await title()) === "Week's page", await title())
  await h.click('[data-pane-title]')
  await h.keyboard.press('ArrowLeft')
  check('5. a week back says Last week', (await title()) === 'Last week', await title())
  if (await row("Week's page")) {
    check('5. Week’s page row stays lit on last week', (await lit("Week's page")) === 'page')
    await (await row("Week's page")).click()
    check('5. its row goes to this week', (await title()) === "Week's page", await title())
  } else check('5. Journal stays lit on last week (Week’s page not a row)', (await lit('Journal')) === 'page', await lit('Journal'))

  // 6. The Month's page a month back.
  await go('monthpage')
  await h.click('[data-pane-title]')
  await h.keyboard.press('ArrowLeft')
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 15)
  const said = last.getFullYear() === now.getFullYear() ? monthWord(last) : `${monthWord(last)} ${last.getFullYear()}`
  check('6. a month back is named', (await title()) === said, await title())
  if (await row("Month's page")) {
    check('6. Month’s page row stays lit on last month', (await lit("Month's page")) === 'page')
    await (await row("Month's page")).click()
    check('6. its row goes to this month', (await title()) === "Month's page", await title())
  }
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
