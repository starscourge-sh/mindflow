// Lists start grouped by kind, each kind its own island; a list of one kind
// stays a plain list (on the sandbox, with no list's display kept). In your
// own book, the foot menu's book line is "Switch book…", with "New book…"
// inside it (run without the sandbox, which has no new books).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/group-kind.mjs
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/group-kind.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const heads = () => h.locator('[data-island-head]').evaluateAll((all) => all.map((one) => one.getAttribute('data-island-head')))
try {
  if (process.env.QA_ARGS) {
  await h.evaluate(() => Object.keys(localStorage).filter((k) => /^(view|islands):/.test(k)).forEach((k) => localStorage.removeItem(k)))
  await h.reload(); await wait(1800)
  for (const page of ['all', 'inbox']) {
    await go(page); await wait(1200)
    const names = await heads()
    check(`${page}: starts grouped by kind`, names.length > 1, names.join(', '))
  }
  await go('articles'); await wait(1200)
  const one = await heads()
  check('articles, one kind: a plain list, no island', one.length === 0, one.join(', '))
  } else {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await h.reload(); await wait(1800)
  await go('home'); await wait(900)
  await h.locator('button[aria-label$=" menu"]').last().click(); await wait(500)
  const items = await h.locator('[role=menuitem]').allInnerTexts()
    check('the foot menu has no "New book…" line', !items.some((t) => /^New book/.test(t.trim())), items.join(' | '))
    check('and has "Switch book…"', items.some((t) => /^Switch book/.test(t.trim())))
    await h.getByRole('menuitem', { name: /Switch book/ }).click(); await wait(600)
    check('Switch book offers "New book…" inside it', /New book/.test(await h.locator('[role=dialog]').innerText()))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
