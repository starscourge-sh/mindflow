// Proofread, on this computer (Harper, harper.js): no WebAssembly is fetched as the app comes up; in the writing
// room of a piece of Writing, "Proofread" goes through what it finds one at a time with a plain reason, Esc skips,
// Tab takes the fix (a planted "is is" made "is"), and it ends "Clean."; the Prose report says what it found; the
// Journal never has it. Prints the first load's time.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/proofread.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
// The grammar checker's own code and its WebAssembly: loaded together, by its first use (lib/grammar.ts), never before.
const wasm = () => h.evaluate(() => performance.getEntriesByType('resource').filter((one) => /slimBinary|harper|\.wasm/.test(one.name)).length + (window.qaGrammarLoad ? 1 : 0))
const bar = () => h.evaluate(() => { const one = document.querySelector('[data-proofing]'); return one ? { state: one.getAttribute('data-proofing'), text: one.textContent.replace(/\s+/g, ' ').trim(), reason: one.querySelector('[data-proof-reason]')?.textContent ?? '' } : null })
const words = () => h.evaluate(() => document.querySelector('[data-room] .tiptap')?.textContent ?? '')
const until = async (ok, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ok()) return true; await wait(150) } return false }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await h.reload(); await wait(2000)
  await go('articles'); await wait(1200)
  check('no WebAssembly fetched as the app comes up and Writing opens', (await wasm()) === 0, `${await wasm()} wasm`)

  // The Journal: its writing room has no Proofread, and asking for one there does nothing.
  await go('day'); await wait(1200)
  await h.click('[data-room-open]').catch(() => {})
  await wait(500)
  check('the Journal\'s writing room has no Proofread', (await h.locator('[data-proofread-ask]').count()) === 0)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:proofread')))
  await wait(800)
  check('and it never runs on the Journal', (await bar()) === null && (await wasm()) === 0)
  await h.keyboard.press('Escape'); await wait(400)

  // A piece of Writing with a planted mistake.
  const piece = await v('article:new')
  await v('item:save', piece, { title: 'On rivers', body: { type: 'doc', content: [para('Rivers keep going. This is is a planted mistake. They do not ask.')] } })
  await send('article', piece)
  await wait(1200)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap')?.focus())
  await h.keyboard.press('Shift+Meta+Enter'); await wait(500)
  await h.click('[data-report-ask]')
  await until(async () => /Grammar and style/.test(await h.locator('[data-prose-report]').innerText().catch(() => '')))
  const report = await h.locator('[data-prose-report]').innerText().catch(() => '')
  console.log('first load', await h.evaluate(() => window.qaGrammarLoad), 'ms')
  check('the Prose report says what the grammar check found', /Grammar and style: \d+ things? to look at/.test(report), report)
  for (const theme of ['light', 'dark']) {
    if (!shots) break
    await h.evaluate((one) => (document.documentElement.className = one === 'dark' ? 'dark' : ''), theme); await wait(300)
    await h.screenshot({ path: `${shots}/prose-report-${theme}.png` })
  }
  await h.click('[data-report-ask]'); await wait(300)
  await h.click('[data-proofread-ask]')
  check('Proofread shows one finding at a time with a plain reason', await until(async () => (await bar())?.state === 'one'), JSON.stringify(await bar()))
  const first = await bar()
  for (const theme of ['light', 'dark']) {
    if (!shots) break
    await h.evaluate((one) => (document.documentElement.className = one === 'dark' ? 'dark' : ''), theme); await wait(300)
    await h.screenshot({ path: `${shots}/proofread-${theme}.png` })
  }
  await h.evaluate(() => document.documentElement.classList.remove('dark'))
  // Skip what is not the planted one.
  let skipped = false
  for (let i = 0; i < 12 && !/is is/.test((await bar())?.text ?? ''); i++) {
    const was = (await bar())?.text
    await h.keyboard.press('Escape'); await wait(300)
    skipped ||= (await bar())?.text !== was
  }
  const planted = await bar()
  check('it finds the planted "is is", a repeated word', /is is/.test(planted?.text ?? '') && /repeated word/.test(planted?.reason ?? ''), JSON.stringify({ first, planted }))
  await h.keyboard.press('Tab'); await wait(1200)
  const after = await words(piece)
  check('Tab takes the fix', /This is a planted mistake/.test(after) && !/\bis is\b/.test(after), after)
  check('still in the writing room after Tab and Esc', (await h.locator('[data-room]').count()) === 1)
  for (let i = 0; i < 12 && (await bar())?.state === 'one'; i++) {
    const was = (await bar())?.text
    await h.keyboard.press('Escape'); await wait(300)
    skipped ||= (await bar())?.text !== was
  }
  check('Esc skips to the next', skipped || first?.text?.includes('is is'))
  check('it ends "Clean."', (await bar())?.state === 'clean' && /Clean\./.test((await bar())?.text ?? ''), JSON.stringify(await bar()))
  check('the checker loaded on first use', (await wasm()) >= 1 && (await h.evaluate(() => window.qaGrammarLoad)) > 0, `${await wasm()}`)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
