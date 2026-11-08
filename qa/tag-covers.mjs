// A tag's name in its page's head and in Often with's chips (the tag page has
// no cover now: a tag has none): a long name stays on one line inside the
// page, cut short with its whole name in the title, and never broken mid word;
// a short one shows whole. At 560, 900 and 1600 wide, paper and dark.
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
const NAMES = ['bug-report', 'reading-list', 'a-very-long-tag-name-for-the-whole-of-renaissance-florence', 'supercalifragilistic', 'go']
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** The head's name and every Often with chip: inside the page, on one line, its whole name said. */
const measure = () => h.evaluate(() => {
  const page = document.querySelector('[data-tag-page]')?.getBoundingClientRect()
  const title = document.querySelector('[data-tag-title]')
  const word = title?.querySelector('span')
  const chips = [...document.querySelectorAll('[data-often-tag]')]
  return {
    title: title ? { name: word.textContent, full: title.getAttribute('title'), right: title.getBoundingClientRect().right, lines: word.getClientRects().length, cut: word.scrollWidth > word.clientWidth } : null,
    page: page?.right ?? 0,
    chips: chips.map((one) => ({ name: one.dataset.oftenTag, right: one.getBoundingClientRect().right, tall: one.getBoundingClientRect().height, full: one.getAttribute('title') ?? '' }))
  }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  for (const name of NAMES) await h.evaluate((b) => window.api.captures.create({ body: b }), doc(`about #coverz and #${name}`))
  await h.reload(); await wait(2000)
  for (const look of ['paper', 'dark']) {
    await theme(look)
    for (const width of [560, 900, 1600]) {
      await size(width, 1000)
      for (const name of ['coverz', ...NAMES.slice(0, 4)]) {
        await c.send('tag', name); await wait(1300)
        const m = await measure()
        if (!m.title) { check(`${look} ${width}: #${name} shows its page`, false); continue }
        check(`${look} ${width}: #${name} in the head stays inside the page, on one line`, m.title.right <= m.page + 1 && m.title.lines === 1, `right ${Math.round(m.title.right)} of ${Math.round(m.page)}`)
        check(`${look} ${width}: #${name} keeps its whole name in the title`, m.title.full === `#${name}`)
        if (name === 'go') check(`${look} ${width}: a short name is never cut`, !m.title.cut)
        for (const one of m.chips) {
          check(`${look} ${width}: Often with #${one.name} stays inside, one line`, one.right <= m.page + 1 && one.tall <= 36, `right ${Math.round(one.right)}, ${Math.round(one.tall)}px tall`)
          check(`${look} ${width}: Often with #${one.name} says what its number counts`, new RegExp(`^#${one.name}: \\d+ notes? carr(y|ies) both$`).test(one.full), one.full)
        }
        if (SHOTS && name === 'coverz') await h.screenshot({ path: `${SHOTS}/${look}-${width}-coverz.png` })
      }
    }
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | ').slice(0, 300))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
