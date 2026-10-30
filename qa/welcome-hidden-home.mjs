// The welcome ends on Home only when Home is in the sidebar: with Home hidden, it ends on the Inbox (where the
// tour's first stop points), never on the page you put away.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-hidden-home.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
let failed = 0
const check = (name, ok, more = '') => (ok || failed++, console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
try {
  const shown = (await v('settings')).sidebarShown
  if (shown) await v('settings:set', { sidebarShown: shown.filter((id) => id !== 'home') })
  else await v('settings:set', { sidebarShown: ['inbox', 'day', 'articles', 'nuggets', 'today', 'calendar', 'feed', 'review'] })
  await c.go('home'); await h.waitForTimeout(800)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await h.click('[data-skip-intro]').catch(() => {})
  await h.waitForTimeout(1500)
  for (let i = 0; i < 50 && !(await chapter()).includes('Ready'); i++) {
    for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await h.waitForTimeout(120))
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.keyboard.press('Enter')
    await h.waitForTimeout(800)
  }
  check('reached Ready', (await chapter()).includes('Ready'), await chapter())
  for (let j = 0; j < 8; j++) (await h.keyboard.press('Escape'), await h.waitForTimeout(120))
  await h.click('[data-choice="1"], [data-choice="2"]')
  await h.waitForTimeout(3500)
  const view = await h.evaluate(() => document.querySelector('[data-view]')?.getAttribute('data-view') ?? location.search)
  const title = await h.evaluate(() => document.querySelector('header h1, [data-page-title]')?.textContent ?? '')
  check('with Home hidden, the welcome ends on the Inbox', /inbox/i.test(view) || /Inbox/.test(title), `${view} | ${title}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
