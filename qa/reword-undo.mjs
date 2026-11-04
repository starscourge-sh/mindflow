// ⌘Z and ⇧⌘Z in the "Capture · As selected" card (the user: "why can't i undo?"): typed words, a word deleted,
// all replaced, each taken back and done again, as in any Mac text box; then Save, and Undo on its notice takes the
// capture away. Also ⌘Z in the app's other small text boxes (a rename, "Why keep this?", the Display search).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/reword-undo.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const SOURCE = 'The quick brown fox jumps over the lazy dog. Second sentence about rivers.'
const source = await h.evaluate((body) => window.api.captures.create({ body }), SOURCE)
const select = (phrase) => h.evaluate((phrase) => {
  const dom = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes(phrase))
  const editor = dom?.editor
  if (!editor) return false
  let at = -1
  editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.includes(phrase)) at = pos + node.text.indexOf(phrase) })
  editor.chain().focus().setTextSelection({ from: at, to: at + phrase.length }).run()
  return at >= 0
}, phrase)
const value = () => h.evaluate(() => document.querySelector('[data-reword] textarea')?.value ?? null)
const press = async (keys) => (await h.keyboard.press(keys), wait(150))

try {
  // A plain text box with no app code on it, as the Mac's own: how far ⌘Z goes back there is what the card should match.
  await h.evaluate(() => { const t = document.createElement('textarea'); t.id = 'qa-plain'; t.style.cssText = 'position:fixed;left:0;top:0;z-index:99999'; document.body.append(t); t.focus() })
  await h.keyboard.type('quick brown fox runs', { delay: 30 })
  await press('Meta+z')
  const plain = await h.evaluate(() => document.querySelector('#qa-plain').value)
  console.log(`a plain text box after ⌘Z: "${plain}"`)
  await h.evaluate(() => document.querySelector('#qa-plain').remove())
  await c.send('capture', source)
  await wait(1500)
  check('the source note is open and its words picked', await select('quick brown fox'))
  await wait(300)
  await h.locator('[aria-label="Capture"]:visible').first().click()
  await wait(400)
  check('the card opens as selected', (await value()) === 'quick brown fox', await value())
  await h.keyboard.type(' runs', { delay: 30 })
  await wait(200)
  const typed = await value()
  await press('Meta+z')
  const once = await value()
  check('⌘Z takes the typed words back', once === 'quick brown fox', `${typed} → ${once}`)
  await press('Meta+Shift+z')
  check('⇧⌘Z puts them back', (await value()) === 'quick brown fox runs', await value())
  await press('Alt+Backspace')
  check('⌥⌫ deletes a word', (await value()) === 'quick brown fox ', await value())
  await press('Meta+z')
  check('⌘Z brings the deleted word back', (await value()) === 'quick brown fox runs', await value())
  await press('Meta+a'); await h.keyboard.type('fast fox', { delay: 20 }); await wait(150)
  await press('Meta+z')
  check('⌘Z after all is replaced brings the old words back', (await value()) === 'quick brown fox runs', await value())
  // The note under the card is untouched by the card's undo.
  const note = await h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes('lazy dog'))?.textContent ?? '')
  check("the card's ⌘Z leaves the note's words alone", note.includes('The quick brown fox jumps'), note.slice(0, 60))
  await press('Meta+Enter')
  await wait(800)
  const saved = (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').trim() === 'quick brown fox runs')
  check('Save keeps the capture', !!saved)
  const undo = h.locator('button:has-text("Undo"):visible').last()
  const has = await undo.isVisible().catch(() => false)
  check('its notice offers Undo', has)
  if (has) await undo.click()
  await wait(800)
  const after = (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').trim() === 'quick brown fox runs')
  check('Undo on the notice takes the capture away', !after || after.status === 'discarded', JSON.stringify(after?.status))
  // Again, taken back by ⌘Z this time: nothing typed since the notice came up, so the key is the notice's.
  check('the words picked again', await select('lazy dog'))
  await wait(300)
  await h.locator('[aria-label="Capture"]:visible').first().click()
  await wait(400)
  await press('Meta+Enter')
  await wait(800)
  const second = (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').trim() === 'lazy dog')
  await press('Meta+z')
  await wait(800)
  const gone = (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').trim() === 'lazy dog')
  check('⌘Z after Save takes the capture away', !!second && (!gone || gone.status === 'discarded'), `${!!second} ${gone?.status}`)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
