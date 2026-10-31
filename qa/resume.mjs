// Pick up where you left off: a note reopens at its scroll; a reload (as a launch) reopens the page that was open,
// at the same place; ⇧⌘T brings back the note just left; Home's "Continue reading" offers a Review sitting put down,
// a quick capture draft and an article part read; after a long absence Home's top line names what you were last in.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/resume.mjs
import { join } from 'path'
import { tmpdir } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? tmpdir()
const c = await sandbox({ width: 1300, height: 850 })
const { h, v, go, send, both } = c
const wait = (ms) => h.waitForTimeout(ms)
// The note's scroller and how far down it is.
const scrolled = () => h.evaluate(() => {
  const dom = document.querySelector('[data-document^="item-"] .ProseMirror, .ProseMirror')
  for (let at = dom?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return Math.round(at.scrollTop)
  return -1
})
const scrollTo = (top) => h.evaluate((top) => {
  const dom = document.querySelector('.ProseMirror')
  for (let at = dom?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return void (at.scrollTop = top, at.dispatchEvent(new Event('scroll')))
}, top)
const openNote = () => h.evaluate(() => document.querySelector('[data-document]')?.getAttribute('data-document') ?? '')
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  // The longest piece of Writing, made longer so it scrolls well past one screen.
  const articles = await v('items', 'article')
  const long = articles.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0]
  const filler = Array.from({ length: 60 }, (_, at) => `Paragraph ${at + 1}: the light came in sideways and nobody moved.`).join('\n\n')
  await v('item:save', long.id, { body: filler })
  await send('article', long.id); await wait(2000)
  const id = `item-${long.id}`
  check('the note opened', (await openNote()) === id, await openNote())
  await scrollTo(900); await wait(400)
  const was = await scrolled()
  // Left for the Inbox, and opened again: where it was, not the top.
  await go('inbox'); await wait(800)
  await send('article', long.id); await wait(2000)
  const back = await scrolled()
  check('(2) a note opened again lands where you were in it', Math.abs(back - was) < 40 && was > 300, `was ${was}, back at ${back}`)
  // ⇧⌘T after leaving it: the note comes back.
  await go('inbox'); await wait(800)
  await h.keyboard.press('Meta+Shift+T'); await wait(1500)
  check('(4) ⇧⌘T reopens the note just left', (await openNote()) === id, await openNote())
  // A reload, as a launch: the same page, the same note, the same place.
  await scrollTo(1200); await wait(400)
  const before = await scrolled()
  await h.reload(); await h.waitForLoadState('domcontentloaded'); await wait(4000)
  check('(1) launch reopens the note that was open (one pane)', (await openNote()) === id, await openNote())
  const after = await scrolled()
  check('(1) at the same scroll', Math.abs(after - before) < 40, `before ${before}, after ${after}`)
  // Things left part way, for Home's "Continue reading".
  await h.evaluate(() => {
    localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ring the framer about the Rothko print' }] }] }))
    localStorage.setItem('web-places', JSON.stringify({ 'https://example.com/long-read': { top: 2400, share: 0.42, at: Date.now(), title: 'The Long Read About Bridges' } }))
  })
  const queue = await v('review:queue')
  if (queue[0]) await v('review:grade', queue[0].id, 3, 4000)
  await go('home'); await wait(2500)
  const cards = await h.evaluate(() => [...document.querySelectorAll('[data-resume]')].map((one) => `${one.getAttribute('data-resume')}: ${one.textContent}`))
  console.log(cards.join('\n'))
  check('(3) Continue reading offers the Review sitting left today', cards.some((one) => /^review: \d+ cards? left from this (morning|afternoon|evening)/.test(one)), cards.join(' | '))
  check('(3) and the quick capture draft', cards.some((one) => /^draft: Ring the framer/.test(one)))
  check('(3) and the article part read', cards.some((one) => /^article: The Long Read About Bridges42% read/.test(one)))
  await both(join(shots, 'resume-home'))
  // Back after a long absence: the top line names what you were last in.
  // Leaving marks the time seen, so the gap is set as the page starts again.
  await h.addInitScript(() => localStorage.setItem('last-seen', String(Date.now() - 9 * 3600 * 1000)))
  await h.reload(); await h.waitForLoadState('domcontentloaded'); await wait(3000)
  await go('home'); await wait(2500)
  const line = await h.evaluate(() => document.querySelector('[data-welcome-back]')?.textContent ?? '')
  check('(5) after a long absence Home names the last thing you were in', /^You were in .+\.Pick up where you left off/.test(line), line)
  await both(join(shots, 'resume-welcome'))
  await h.evaluate(() => document.querySelector('[data-welcome-back] button')?.click()); await wait(2000)
  check('(5) one click takes you back to it', (await openNote()) === id, await openNote())
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
