// The selection bar shows icons only at first; "Words on the selection bar" (Settings, Appearance) puts the words
// back beside them, and its sample shows which. The tooltips say what each does either way.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/bar-words.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1900, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const words = () => h.evaluate(() => [...document.querySelectorAll('[data-selection-bar] button .tiptap-button-text')].filter((one) => getComputedStyle(one).display !== 'none' && one.closest('button').querySelector('svg')).map((one) => one.textContent))
const select = async () => {
  await c.go('inbox'); await wait(1500)
  await h.click('[data-capture-row], [data-row]').catch(() => {})
  await wait(900)
  await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap, .tiptap'); const p = ed.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus() })
  await h.mouse.up()
  await wait(900)
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await select()
  check('the selection bar shows', (await h.locator('[data-selection-bar]').count()) > 0)
  check('at first: icons only, no words beside them (with room for them)', (await words()).length === 0 && !(await h.evaluate(() => document.querySelector('[data-selection-bar]')?.hasAttribute('data-tight'))), JSON.stringify(await words()))
  if (shots) await h.screenshot({ path: `${shots}/bar-icons.png` })
  await v('settings:set', { barWords: true })
  await wait(600)
  await select()
  check('"Words on the selection bar" on: the words are back', (await words()).length >= 3, JSON.stringify({ words: await words(), root: await h.evaluate(() => document.documentElement.dataset.barWords), tight: await h.evaluate(() => document.querySelector('[data-selection-bar]')?.hasAttribute('data-tight')), all: await h.evaluate(() => [...document.querySelectorAll('[data-selection-bar] .tiptap-button-text')].map((o) => o.textContent + ':' + getComputedStyle(o).display)) }))
  await c.go('settings')
  await h.click('[data-section="Appearance"]').catch(() => {})
  await wait(800)
  const sample = h.locator('[data-bar-words-sample]').first()
  await sample.scrollIntoViewIfNeeded()
  check('its sample shows the words when on', /Capture/.test(await sample.innerText()))
  if (shots) { const b = await sample.boundingBox(); await h.screenshot({ path: `${shots}/bar-setting.png`, clip: { x: Math.max(0, b.x - 500), y: Math.max(0, b.y - 80), width: 900, height: 160 } }) }
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
