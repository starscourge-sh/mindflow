// Trying to break the app as a hostile person would: the same thing pressed
// twice, odd words (emoji, right-to-left, <script>, ../../etc, quotes,
// 5,000 letters) typed where the page asks for few, Esc halfway through.
// Each check is a bug found this way, or a guard it held, and passes once fixed.
//   npx electron-vite build --outDir out-b && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-b/main/index.js HALIGTREE_QA_AWAY=1 node qa/break-it.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, send, errors } = c
const startList = async (name) => {
  await h.keyboard.press('Escape')
  await h.locator('button[aria-label="Gems"][data-side-row]').click({ button: 'right' })
  await h.getByRole('menuitem', { name: 'Start a list' }).hover()
  await h.waitForTimeout(300)
  await h.getByRole('menuitem', { name: new RegExp(name) }).click()
  await h.waitForTimeout(900)
}
try {
  await v('settings:set', { sounds: false, motion: false, hintRate: 0 })

  // Today's lines with odd words: an emoji typed into a line was dropped from
  // the task (the editor holds it as its own node, which the line's reader skipped).
  // Written straight into Today's list ("Write out my day").
  await c.go('today'); await h.waitForTimeout(1500)
  const before = new Set((await v('tasks')).map((one) => one.id))
  await h.locator('[data-write-day]').click(); await h.waitForTimeout(400)
  for (const line of ['🎉 שלום party', 'x 🎉 y', '<script>alert(1)</script> #123', '#daily tomorrow 5pm']) {
    await h.keyboard.insertText(line); await h.keyboard.press('Enter'); await h.waitForTimeout(700)
  }
  // An empty line ends the writing; the Enters after it open rows, which Escape puts away.
  await h.keyboard.press('Enter'); await h.waitForTimeout(300)
  await h.waitForTimeout(800)
  const made = (await v('tasks')).filter((one) => !before.has(one.id)).map((one) => one.title)
  check('an emoji typed in a Today line stays in the task', made.includes('🎉 שלום party') && made.includes('x 🎉 y'), made.join(' | '))
  check('tags, odd words and a #tag of digits are kept as written', made.includes('<script>alert(1)</script> #123') && made.includes('#daily'), made.join(' | '))
  check('Enter on an empty line makes nothing', made.length === 4, made.length)
  await h.keyboard.press('Escape')

  // "Start a list" on a list already started opens it: a second press made a
  // second folder of the same name beside it.
  await startList('Overheard')
  await startList('Overheard')
  const named = (await v('groups', 'nugget')).filter((one) => one.name === 'Overheard')
  check('"Start a list" twice keeps one "Overheard"', named.length === 1, named.length)

  // A gem's page number, typed with far too much and with odd words.
  const all = await v('sources')
  let gem = null
  for (const one of all.filter((x) => x.field === 'medium')) {
    gem = (await v('source', 'medium', one.name)).items.find((item) => item.type === 'nugget')
    if (gem) break
  }
  await send('nugget', gem.id)
  await h.waitForSelector('[data-page-number] input', { timeout: 10000 })
  const typeIn = async (selector, words) => {
    await h.click(selector)
    await h.keyboard.press('Meta+A')
    await h.keyboard.insertText(words)
    await h.keyboard.press('Enter')
    await h.waitForTimeout(700)
  }
  const field = async () => (await h.evaluate(([id]) => window.api.haligtree('notes:fields', 'nuggets', id), [gem.id])).location
  await typeIn('[data-page-number] input', '<script>alert(1)</script>' + 'x'.repeat(5000))
  const long = await field()
  check('a page typed far too long is kept short', String(long ?? '').length <= 40, String(long).length)
  await typeIn('[data-page-number] input', '   ')
  check('a page of spaces takes the page off', (await field()) == null, await field())

  // A source's Kind, Year and Via: Esc puts back what was there, as the page
  // number beside them does; it kept the half-typed words.
  const source = (await v('sources')).find((x) => x.field === 'medium').name
  await v('source:facts', 'medium', source, { via: 'a friend' })
  await h.evaluate((name) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `medium:${name}` })), source)
  await h.waitForSelector('input[data-fact="Via"]', { timeout: 10000 })
  await h.click('input[data-fact="Via"]')
  await h.keyboard.press('Meta+A')
  await h.keyboard.insertText('../../etc "quoted" \\ back')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(700)
  const via = (await v('source', 'medium', source)).via
  check('Esc in a source\'s Via puts back what was there', via === 'a friend', via)
  const shown = await h.evaluate(() => { const el = document.querySelector('input[data-fact="Via"]'); return el && `${el.value}${document.activeElement === el ? ' (still typing)' : ''}` })
  check('and the field shows it again, let go of', shown === 'a friend', shown)
  await typeIn('input[data-fact="Via"]', '../../etc "quoted" \\ back')
  check('odd words in Via are kept as typed', (await v('source', 'medium', source)).via === '../../etc "quoted" \\ back')

  await h.keyboard.press('Escape')
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
