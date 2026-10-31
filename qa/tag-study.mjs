// Study one tag: its cards and those of the tags under it (#astrophysics brings #astrophysics-holes, as an Anki
// deck's levels come in), in Review, graded as any review is. From the tag's page ("Study") and from ⌘K
// ("Study #astrophysics"). A tag under it studied alone brings only its own.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/tag-study.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const tagsOf = (card) => `${card.title ?? ''} ${card.prompt ?? ''} ${JSON.stringify(card.body ?? '')}`
const roundLine = () => h.evaluate(() => [...document.querySelectorAll('p')].find((one) => /^Studying #/.test(one.textContent ?? ''))?.textContent ?? '')
try {
  // A card under #astrophysics, one level down.
  await call('cards:list', [{ term: 'What is an event horizon?', meaning: 'The edge past which nothing comes back #astrophysics-holes' }])
  const whole = await call('review:round', '#astrophysics')
  check('a tag\'s round holds its cards', whole.length > 1 && whole.every((one) => /#astrophysics/.test(tagsOf(one))), `${whole.length}`)
  check('and the cards of the tags under it', whole.some((one) => one.prompt === 'What is an event horizon?'))
  const under = await call('review:round', '#astrophysics-holes')
  check('a tag under it studied alone brings only its own', under.length === 1 && under[0].prompt === 'What is an event horizon?', under.map((one) => one.prompt).join(' | '))
  check('⌘K knows the tags on cards', (await call('cards:tags')).includes('astrophysics'))

  // From the tag's page.
  await h.evaluate(() => window.api.openInHome('tag', 'astrophysics'))
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-tag]')))
  await h.evaluate(() => document.querySelector('[data-study-tag]').click())
  check('"Study" on the tag\'s page opens Review on that tag', await waitFor(async () => /^Studying #astrophysics\./.test(await roundLine())), await roundLine())
  if (shots) await h.screenshot({ path: join(shots, 'tag-study.png') })
  const asked = await h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
  check('the card in front is one of the tag\'s', whole.some((one) => asked.includes((one.prompt ?? '').slice(0, 20))), asked)
  // Back to today's cards.
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => /today’s cards/.test(one.textContent ?? ''))?.click())
  check('"Back to today’s cards" leaves the tag', await waitFor(async () => !(await roundLine())))

  // From ⌘K.
  await c.go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('Study #astrophysics-holes', { delay: 15 })
  await h.waitForTimeout(600)
  await h.keyboard.press('Enter')
  check('⌘K "Study #tag" opens Review on that tag', await waitFor(async () => /^Studying #astrophysics-holes\./.test(await roundLine())), await roundLine())
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
