// A tag's name on its cover, big and in Often with's tiles: it breaks only
// after a hyphen, never mid word, and a single long word shrinks to fit
// rather than running off the edge. At 900 and 1600 wide, paper and dark.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/tag-covers.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, size, theme } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const NAMES = ['bug-report', 'reading-list', 'a-very-long-tag-name', 'supercalifragilistic', 'go']
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** Each cover's name on screen: does any piece run past the edge, or break inside a word? */
const measure = () => h.evaluate(() => [...document.querySelectorAll('[data-cover-name]')].map((box) => {
  const edge = box.getBoundingClientRect()
  const pad = parseFloat(getComputedStyle(box).paddingRight)
  const parts = [...box.querySelectorAll('span.whitespace-nowrap')]
  const lines = new Set(parts.map((one) => Math.round(one.getBoundingClientRect().top)))
  return {
    name: box.textContent,
    size: parseFloat(getComputedStyle(box).fontSize),
    over: Math.max(0, ...parts.map((one) => one.getBoundingClientRect().right - (edge.right - pad / 2))),
    split: parts.some((one) => one.getClientRects().length > 1),
    lines: lines.size,
    tall: Math.max(0, ...parts.map((one) => edge.top + pad / 2 - one.getBoundingClientRect().top))
  }
}))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  for (const name of NAMES) await h.evaluate((b) => window.api.captures.create({ body: b }), doc(`about #coverz and #${name}`))
  await h.reload(); await wait(2000)
  for (const look of ['paper', 'dark']) {
    await theme(look)
    for (const width of [900, 1600]) {
      await size(width, 1000)
      for (const name of ['coverz', ...NAMES.slice(0, 4)]) {
        await c.send('tag', name); await wait(1300)
        await h.evaluate(() => document.querySelector('[class*="@container/page"] *')?.scrollTo?.(0, 0))
        const all = await measure()
        for (const one of all) {
          check(`${look} ${width}: ${one.name} stays inside`, one.over <= 1 && one.tall <= 1, `over ${one.over.toFixed(1)}px, ${one.size.toFixed(1)}px type`)
          check(`${look} ${width}: ${one.name} breaks only after a hyphen`, !one.split, `${one.lines} lines`)
        }
        if (SHOTS) {
          const band = h.locator('header.relative').first()
          await band.screenshot({ path: `${SHOTS}/${look}-${width}-${name}-cover.png` }).catch(() => {})
          if (name === 'coverz') {
            const often = h.locator('section:has(> h2:text("Often with")) > div.grid').first()
            await often.scrollIntoViewIfNeeded().catch(() => {})
            await wait(400)
            await often.screenshot({ path: `${SHOTS}/${look}-${width}-often-with.png` }).catch(() => {})
          }
        }
      }
    }
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | ').slice(0, 300))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
