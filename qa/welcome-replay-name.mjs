// The welcome, played again from your own book, opens in the sandbox: "Name it" still starts on your book's name and
// card (the user, 6 Nov: "once again, replaying the welcome loses what my book name already was"), and saves nothing.
//   D=$(mktemp -d); mkdir -p $D/sandbox; QA_ARGS=--sandbox QA_DATA=$D QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-replay-name.mjs [shots]
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const NAME = 'Garden of Loose Ends'
mkdirSync(join(process.env.QA_DATA, 'sandbox'), { recursive: true })
writeFileSync(join(process.env.QA_DATA, 'sandbox', 'carry.json'), JSON.stringify({ local: {}, settings: {}, book: { name: NAME, seed: 12345 }, welcome: { at: Date.now() } }))
const c = await sandbox({ width: 1280, height: 800 })
const { h } = c
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const next = async () => { const skip = await h.$('footer button:has-text("Skip trying it")'); await h.click(skip ? 'footer button:has-text("Skip trying it")' : 'footer button:has-text("Next"), footer button:has-text("Show me")', { timeout: 2500 }) }
try {
  // Asked for on the way in, as “Replay the welcome” does: it plays once the examples are set out.
  await h.waitForSelector('.mf-welcome', { timeout: 60000 })
  for (let i = 0; i < 60 && !(await chapter()).includes('Name it'); i++) (await next().catch(() => undefined), await h.waitForTimeout(600))
  await h.waitForSelector('[data-welcome-book-name]', { timeout: 4000 })
  await h.waitForTimeout(1600)
  const value = await h.inputValue('[data-welcome-book-name]')
  check('the field starts on your book\'s name', value === NAME, value)
  check('the card shows it too', (await h.textContent('.mf-welcome [data-reader-name]'))?.includes('Garden'))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'welcome-name.png') })
  const pose = () => h.evaluate(() => {
    const el = [...document.querySelectorAll('.mf-welcome [data-reader-hold] *')].find((one) => one.style?.transform?.includes('rotateY'))
    return Number(/rotateY\((-?[\d.]+)deg\)/.exec(el?.style.transform ?? '')?.[1] ?? NaN)
  })
  await h.mouse.move(20, 400, { steps: 6 }); await h.waitForTimeout(1200)
  const left = await pose()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'book-pointer-left.png') })
  await h.mouse.move(1260, 400, { steps: 6 }); await h.waitForTimeout(1200)
  const right = await pose()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'book-pointer-right.png') })
  check('the book follows the pointer from one side of the page to the other', right - left >= 4, `${left.toFixed(1)}° to ${right.toFixed(1)}°`)
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
