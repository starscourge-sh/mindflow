// ⌘K's line under a result reads as words, not raw Markdown: a note kept as
// Markdown ("- [ ] Can use numbers from [GitHub - …](https://…)") shows
// "Can use numbers from GitHub - …", with the searched word marked.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/search-snippet-clean.mjs [shots]
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.argv[2]
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, go, both } = c
const BODY = [
  'Pomodoro/tempus #project',
  '',
  '- [ ] Can use numbers from [GitHub - 100+ abstract shapes](https://github.com/x/shapes)',
  '  - [x] **Bolded** zarquon idea with `inline` and [[Wiki page|wiki words]]',
  '> a quoted quillfeather thought',
  '### Heading of marrowstone',
  '1. ![cover](haligtree://assets/none.png) numbered *tilted* vellichor step'
].join('\n')
// Each search, the word to mark, and the words the line must read as.
const SEARCHES = [
  ['abstract', 'Can use numbers from GitHub - 100+ abstract shapes'],
  ['zarquon', 'Bolded zarquon idea with inline and wiki words'],
  ['quillfeather', 'a quoted quillfeather thought'],
  ['marrowstone', 'Heading of marrowstone'],
  ['vellichor', 'numbered tilted vellichor step']
]
const RAW = /\[ \]|\[x\]|\]\(|\*\*|`|\[\[|\]\]|^…?\s*(?:#+|[-*>]|\d+\.)\s|(?:^|\s)[*_]\S|!\[/i
try {
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), BODY)
  // A card's few lines (notes:glance, the grid's cards) read the same way.
  const glance = (await v('notes:glance', 'captures'))[id] ?? ''
  check('a card\'s lines have no raw Markdown', glance.split('\n').every((line) => !RAW.test(line)), JSON.stringify(glance))
  for (const [word, reads] of SEARCHES) {
    await go('home')
    await h.keyboard.press('Meta+k')
    await h.waitForTimeout(500)
    await h.keyboard.type(word)
    await h.waitForTimeout(900)
    const got = await h.evaluate(() => {
      const line = document.querySelector('div[aria-label="Search"] [data-found-line]')
      return line ? { text: line.innerText.trim(), marks: [...line.querySelectorAll('mark')].map((one) => one.textContent) } : null
    })
    check(`"${word}": the result has a line under its name`, !!got, JSON.stringify(got))
    if (!got) { await h.keyboard.press('Escape'); continue }
    check(`"${word}": the line has no raw Markdown`, !RAW.test(got.text), JSON.stringify(got.text))
    check(`"${word}": the line reads "${reads}"`, got.text === reads, JSON.stringify(got.text))
    check(`"${word}": the mark sits on the searched word`, got.marks.length === 1 && got.marks[0].toLowerCase() === word, JSON.stringify(got.marks))
    if (shots && word === 'abstract') await both(`${shots}/search-snippet`)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
  }
  check('no page errors', !c.errors.filter((e) => /PAGEERROR/.test(e)).length, c.errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
  done()
}
