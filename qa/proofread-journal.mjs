// Proofread in the writing room on a Journal day, full of misspellings: it finds them (spelling counts), marks
// the first on the page with its reason and fix, the button says how many ("Proofread · N"), Tab takes the fix,
// Esc stops; on a clean day it says "Nothing to fix" in place and stays until dismissed.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=<dir>] node qa/proofread-journal.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const bar = () => h.evaluate(() => { const one = document.querySelector('[data-proofing]'); return one ? { state: one.getAttribute('data-proofing'), text: one.textContent.replace(/\s+/g, ' ').trim() } : null })
const until = async (ok, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ok()) return true; await wait(150) } return false }
const words = () => h.evaluate(() => document.querySelector('[data-room] .tiptap')?.textContent ?? '')
const theme = async (one) => { await h.evaluate((t) => (document.documentElement.className = t === 'dark' ? 'dark' : ''), one); await wait(300) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [
    para('I keep telling myself falese idele stories at night. I dddnt sleep again.'),
    para('The commisioner on the news kept talking about appaulin gcrimes and every prase felt corrup.')
  ] } })
  await go('day'); await wait(900)
  await h.click('[data-room-open]'); await wait(700)
  if (!(await h.locator('[data-room-tools-panel]').count())) { await h.click('[data-room-tools]'); await h.waitForTimeout(250) }
  await h.click('[data-proofread-ask]')
  const seen = await until(async () => (await bar())?.state === 'one')
  const first = await bar()
  check('1. Proofread on a Journal day full of misspellings shows a finding', seen, JSON.stringify(first))
  const marked = await h.evaluate(() => { const m = document.querySelector('[data-room] .mf-proofing'); if (!m) return null; const r = m.getBoundingClientRect(); return { text: m.textContent, visible: r.width > 0 && !!document.elementFromPoint(r.x + 2, r.y + r.height / 2)?.closest('.mf-proofing') } })
  check('1. the finding is marked on the page, in view', marked?.visible, JSON.stringify(marked))
  check('1. a misspelling counts, with its fix', /spelling/i.test(first?.text ?? '') && /→/.test(first?.text ?? ''), first?.text)
  if (!(await h.locator('[data-room-tools-panel]').count())) { await h.click('[data-room-tools]'); await h.waitForTimeout(250) }
  const label = await h.locator('[data-proofread-ask]').innerText()
  const n = Number(/·\s*(\d+)/.exec(label)?.[1] ?? 0)
  check('1. the button says how many it found ("Proofread · N", at least 7)', n >= 7, label)
  if (shots) for (const one of ['light', 'dark']) { await theme(one); await h.screenshot({ path: `${shots}/proof-journal-${one}.png` }) }
  await theme('light')
  const was = first?.text
  await h.keyboard.press('Tab'); await wait(1200)
  check('1. Tab takes the fix and moves on', (await words()) !== '' && (await bar())?.text !== was, JSON.stringify(await bar()))
  await h.keyboard.press('Escape'); await wait(400)
  check('1. Esc stops, the room stays', (await bar()) === null && (await h.locator('[data-room]').count()) === 1)

  // A clean day: it says so in place, and that stays until dismissed.
  await h.keyboard.press('Escape'); await wait(500)
  await v('notes:day:save', today, { body: { type: 'doc', content: [para('I slept well and woke early.')] } })
  await h.reload(); await wait(1500); await go('day'); await wait(900)
  await h.click('[data-room-open]'); await wait(700)
  if (!(await h.locator('[data-room-tools-panel]').count())) { await h.click('[data-room-tools]'); await h.waitForTimeout(250) }
  await h.click('[data-proofread-ask]')
  await until(async () => (await bar())?.state === 'clean')
  await wait(3000)
  const clean = await bar()
  check('1. a clean page says so, still there after 3 seconds', clean?.state === 'clean' && /nothing/i.test(clean.text), JSON.stringify(clean))
  if (!(await h.locator('[data-room-tools-panel]').count())) { await h.click('[data-room-tools]'); await h.waitForTimeout(250) }
  check('1. and the button says 0', /·\s*0/.test(await h.locator('[data-proofread-ask]').innerText()), await h.locator('[data-proofread-ask]').innerText())
  if (shots) for (const one of ['light', 'dark']) { await theme(one); await h.screenshot({ path: `${shots}/proof-clean-${one}.png` }) }
  await theme('light')
  await h.keyboard.press('Escape'); await wait(400)
  check('1. Esc dismisses it', (await bar()) === null)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
