// Every action on a post says what it is for, in a newcomer's words: "Add a thought" (no one to reply to in a private
// Feed), "Say it again" (not Restack) with its purpose in its tip, and one line under the first post, the first time
// only, saying what the row does. Every post says why it is there in its top line.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-words.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const SHOTS = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, errors } = c
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await go('feed'); await h.waitForTimeout(1400)
  const text = await h.locator('[data-feed]').innerText()
  check('no "Reply", "Restack" or "seen N times" anywhere in the Feed', !/\bReply\b|\bRestack|\bseen \d+ times/i.test(text), (text.match(/.{0,30}(Reply|Restack|seen \d+ times).{0,30}/i) ?? [''])[0])
  const row = await h.locator('[data-feed-actions]').first().innerText()
  check('the row says "Add a thought" and "Say it again"', /Add a thought/.test(row) && /Say it again/.test(row), row)
  const explain = h.locator('[data-feed-explain]')
  check('the first time, one line under the first post says what the row is for', (await explain.count()) === 1 && /Add a thought.*Say it again.*Read later/.test(await explain.innerText().catch(() => '')))
  await h.locator('[data-feed-post]').first().screenshot({ path: `${SHOTS}/feed-words-first.png` })
  await c.look('dark'); await h.locator('[data-feed-post]').first().screenshot({ path: `${SHOTS}/feed-words-first-dark.png` }); await c.look('light')
  await h.locator('[data-feed-restack]').first().hover(); await h.waitForTimeout(900)
  const tip = await h.locator('[role="tooltip"]').first().innerText().catch(() => '')
  check('"Say it again" says why in its tip', /saying it again is how it sticks/i.test(tip), tip)
  await h.mouse.move(5, 5)
  const plain = (await v('feed')).posts.filter((one) => !one.poll && !one.quiz).length
  const said = await h.locator('[data-feed-post] [data-feed-context]').allInnerTexts()
  check('every post says why it is there, in its top line', said.length === plain && said.every((one) => one.trim().length > 6), `${said.length} of ${plain}: ${said.slice(0, 4).join(' | ')}`)
  await h.locator('[data-feed-restack]').first().click(); await h.waitForTimeout(300)
  const composer = await h.locator('[data-feed-composer]').innerText().catch(() => '')
  check('the composer\'s button says "Say it again"', /Say it again/.test(composer) && !/Restack/.test(composer), composer)
  await h.keyboard.press('Escape')
  await h.reload(); await h.waitForTimeout(1500)
  await go('feed'); await h.waitForTimeout(1200)
  check('then never again', (await h.locator('[data-feed-explain]').count()) === 0)
  check('no errors', !errors.length, errors.join('\n'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
