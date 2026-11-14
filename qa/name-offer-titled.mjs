// A page with a title of its own is never offered a name, whatever its first line holds; and a shell comment in a code
// block is never drawn as a tag. The user's own case (14 Nov, a picture of "Git Deep Dive"): its first line is 164
// characters of an episode's format notes, so it was read as having no name and offered "Fast History Story"; and its
// code's "#git" and "#you" (shell comments) were drawn as tags. Run on a COPY of the user's book, with the stand-in
// model (main/write.ts) so the offer would show if the note were taken for unnamed:
//   QA_ARGS= QA_DATA=<copy of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_CAPS=ai node qa/name-offer-titled.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
process.env.HALIGTREE_QA_CAPS ??= 'ai'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, send } = c
const PAGE = 'f68c25d7-d040-4ae7-8a91-82823a641ac2'
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await send('article', PAGE)
  await h.waitForSelector('.tiptap.ProseMirror', { timeout: 30000 })
  // Long enough for every offer the note would get to have come (the stand-in answers at once).
  let offer = null
  for (let t = 0; t < 12000; t += 400) {
    await h.waitForTimeout(400)
    offer = await h.evaluate(() => document.querySelector('[data-note-offer="name"]')?.textContent ?? null)
    if (offer) break
  }
  const title = await h.evaluate(() => document.querySelector('[data-tab-on]')?.textContent?.trim() ?? '')
  check('"Git Deep Dive", a page with a title of its own, is offered no name', offer === null && /Git Deep Dive/.test(title), JSON.stringify({ offer, title }))
  // The code blocks' shell comments: no tag drawn inside code.
  const inCode = await h.evaluate(() => [...document.querySelectorAll('.tiptap pre, .tiptap [data-code-block], .tiptap code')].flatMap((one) => [...one.querySelectorAll('[data-token="tag"]')].map((tag) => tag.textContent)))
  check('a shell comment in a code block ("#git", "#you") is not drawn as a tag', inCode.length === 0, JSON.stringify(inCode.slice(0, 6)))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
