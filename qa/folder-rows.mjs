// A folder row in Writing only folds and unfolds, as in Obsidian's file explorer and Notion's sidebar:
// a click anywhere on it (name, icon) toggles it at once and never opens the folder as a page; Enter,
// Space, ← and → fold it from the keys; ⌘-click and "Open folder" open its page. Folders start open, and
// each keeps its own fold over a reload.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/folder-rows.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
import { checks } from './harness.mjs'

const { check, done } = checks()
const shots = process.env.SHOTS
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const named = async (name) => (await v('groups', 'article')).find((one) => one.name === name)
const path = () => h.locator('[data-path-part]').allInnerTexts().then((all) => all.map((one) => one.trim().split('\n').at(-1).trim()).join(' › '))
const expanded = (id) => h.locator(`[data-group-row="${id}"]`).getAttribute('aria-expanded')
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await wait(1500)
  await c.go('articles'); await wait(900)
  const all = await h.evaluate(() => [...document.querySelectorAll('[data-group-row]')].map((one) => one.getAttribute('aria-expanded')))
  check('every folder in Writing starts open', all.length > 0 && all.every((one) => one === 'true'), JSON.stringify(all))
  await c.go('nuggets'); await wait(900)
  const gems = await h.evaluate(() => [...document.querySelectorAll('[data-group-row]')].map((one) => one.getAttribute('aria-expanded')))
  check('and every folder in Gems', gems.length > 0 && gems.every((one) => one === 'true'), JSON.stringify(gems))
  await c.go('articles'); await wait(900)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme); await c.go('articles'); await wait(900)
    if (shots) await h.screenshot({ path: `${shots}/writing-folders-${theme}.png` })
  }
  await c.theme('light'); await c.go('articles'); await wait(900)
  const history = await named('History'), leonardo = await named('Leonardo')
  const before = await path()
  const t0 = Date.now()
  await h.locator(`[data-group-row="${leonardo.id}"]`).click({ position: { x: 120, y: 18 } })
  await wait(60)
  check('a click on the name folds it at once', (await expanded(leonardo.id)) === 'false', `${await expanded(leonardo.id)} after ${Date.now() - t0}ms`)
  await wait(600)
  check('and never opens it as a page', (await path()) === before, `${before} → ${await path()}`)
  await h.locator(`[data-group-row="${leonardo.id}"] [data-group-fold]`).click(); await wait(400)
  check('a click on its icon unfolds it', (await expanded(leonardo.id)) === 'true')
  await h.locator(`[data-group-row="${leonardo.id}"]`).focus()
  await h.keyboard.press('Enter'); await wait(300)
  check('Enter folds it', (await expanded(leonardo.id)) === 'false')
  await h.keyboard.press(' '); await wait(300)
  check('Space unfolds it', (await expanded(leonardo.id)) === 'true')
  await h.keyboard.press('ArrowLeft'); await wait(300)
  check('← folds it', (await expanded(leonardo.id)) === 'false')
  await h.keyboard.press('ArrowRight'); await wait(300)
  check('→ unfolds it', (await expanded(leonardo.id)) === 'true')
  check('no rename from the keys', (await h.locator('input[aria-label="Folder name"]').count()) === 0)
  await h.mouse.move(700, 120); await wait(300)
  await h.locator(`[data-group-row="${leonardo.id}"]`).hover({ position: { x: 300, y: 18 } })
  // A tip opens after its delay: read once it is there, up to 4 s.
  const tip = await h.locator('[data-slot="tooltip-content"], [role="tooltip"]').first().innerText({ timeout: 4000 }).catch(() => '')
  if (shots) await h.screenshot({ path: `${shots}/folder-row-tip.png` })
  check('its tooltip says how to open it', /⌘-click/.test(tip ?? '') && /Open folder/.test(tip ?? ''), tip)
  // Fold History, then reload: it stays folded, the rest stay open.
  await h.locator(`[data-group-row="${history.id}"]`).click({ position: { x: 120, y: 18 } }); await wait(600)
  await h.reload(); await wait(1500)
  await c.go('articles'); await wait(900)
  check('folded History stays folded over a reload', (await expanded(history.id)) === 'false')
  const others = await h.evaluate((id) => [...document.querySelectorAll('[data-group-row]')].filter((one) => one.getAttribute('data-group-row') !== id).map((one) => one.getAttribute('aria-expanded')), history.id)
  check('and the others stay open', others.every((one) => one === 'true'), JSON.stringify(others))
  await h.locator(`[data-group-row="${history.id}"]`).click({ position: { x: 120, y: 18 } }); await wait(600)
  // ⌘-click opens it as its own page.
  await h.locator(`[data-group-row="${leonardo.id}"]`).click({ position: { x: 120, y: 18 }, modifiers: ['Meta'] }); await wait(900)
  check('⌘-click opens it as a page', (await path()).endsWith('Leonardo'), await path())
  await h.keyboard.press('Meta+ArrowUp'); await wait(800)
  await h.locator('[data-path-part]').first().click(); await wait(800)
  await h.locator(`[data-group-row="${leonardo.id}"]`).dblclick({ position: { x: 120, y: 18 } }); await wait(400)
  check('a double-click on the name renames it', (await h.locator('input[aria-label="Folder name"]').count()) === 1)
  await h.keyboard.press('Escape'); await wait(300)
  check('and the double-click leaves its fold as it was', (await expanded(leonardo.id)) === 'true')
  await h.locator(`[data-group-row="${leonardo.id}"]`).click({ button: 'right' }); await wait(400)
  await h.getByRole('menuitem', { name: 'Open folder' }).click(); await wait(900)
  check('"Open folder" in its menu opens it as a page', (await path()).endsWith('Leonardo'), await path())
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
