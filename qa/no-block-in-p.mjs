// No block inside a line of words: every place in the sandbox, and the first row of each list opened, searched for a
// <div>, list, heading or section inside a <p> (React's "<div> cannot be a descendant of <p>" in dev, which an
// animated icon's wrapper once caused in "Still wondering" on Home and "Not what you were after?" on a lookup).
// Run on a development build too, so React's own nesting warnings are heard:
//   a copy of electron.vite.config.ts with renderer `define: { 'process.env.NODE_ENV': '"development"' }`, built with -c
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/no-block-in-p.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, electron } = c
const warned = []
h.on('console', (m) => { const t = m.text(); if (/cannot be a descendant|cannot contain a nested|validateDOMNesting/i.test(t)) warned.push(t.slice(0, 400)) })
const bad = () => h.evaluate(() => [...document.querySelectorAll('p :is(div,ul,ol,section,header,footer,p,table,figure,h1,h2,h3,h4,blockquote,pre,form,nav,aside)')]
  .map((el) => { const p = el.parentElement.closest('p'); return `<${el.tagName.toLowerCase()}> in <p> "${p.textContent.trim().slice(0, 50)}"` }))
const found = new Set()
const scan = async (where) => { for (const one of await bad()) found.add(`${where}: ${one}`) }
try {
  for (const place of (process.env.PLACES ?? 'home inbox settings review today articles day calendar media feed nuggets all stats goals sources discarded upcoming map powers week tags questions matrix weekpage monthpage queue yearpage later captures lookups routines practices archived alltasks whatsnew tasks writing ideas gems').split(' ')) {
    await go(place); await h.waitForTimeout(800)
    await scan(place)
    const row = h.locator('[role="main"] [data-row]').first()
    if (await row.count()) { await row.click().catch(() => {}); await h.waitForTimeout(1200); await scan(`${place}, first row open`); await h.keyboard.press('Escape') }
  }
  check('no block inside a <p> on any page or open row', !found.size, [...found].slice(0, 6).join(' | '))
  check('React warns of no bad nesting (heard on a development build)', !warned.length, warned.slice(0, 3).join(' | '))
} finally { await electron.close() }
done()
