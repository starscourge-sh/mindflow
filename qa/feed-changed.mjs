// "Changed my mind", in a post's ⋯: opens "Say it again" already started with "I used to think this. Now: ". Kept,
// the old note is marked changed, and wherever it shows (its Feed post, the note opened) one quiet line,
// "You changed your mind, 4 Nov", opens the new note. Undo takes the mark away with the new note. The heart is untouched.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-changed.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const SHOTS = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, errors } = c
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await go('feed'); await h.waitForTimeout(1200)
  const gem = (await v('feed')).posts.find((one) => one.type === 'nugget' && one.kind !== 'quote')
  const post = h.locator(`[data-feed-id="${gem.id}"]`).first()
  await post.scrollIntoViewIfNeeded()
  await post.locator('[data-feed-actions] [data-menu="post"]').click(); await h.waitForTimeout(300)
  await h.locator('[role="menu"] [data-menu-item="changed"]').click(); await h.waitForTimeout(500)
  const started = await h.evaluate(() => document.activeElement?.closest('[data-feed-composer]') ? [document.activeElement.value, document.activeElement.selectionStart] : null)
  check('"Changed my mind" opens "Say it again" started with "I used to think this. Now: "', started?.[0] === 'I used to think this. Now: ', JSON.stringify(started))
  check('the caret waits after it', started?.[1] === 'I used to think this. Now: '.length)
  check('it cannot be kept with nothing added', await post.locator('[data-feed-restack-save]').isDisabled())
  await h.keyboard.type('it only works on small things.', { delay: 5 })
  await post.screenshot({ path: `${SHOTS}/feed-changed-composer.png` })
  await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(1200)
  const mark = (await v('feed')).posts.find((one) => one.id === gem.id)?.changedTo
  check('kept: the old note is marked changed, with the date and the new note', !!mark?.id && !!mark?.at, JSON.stringify(mark))
  const fresh = mark && (await v('item', mark.id))
  check('the new note says it in your words', /I used to think this\. Now: it only works on small things\./.test(fresh?.title ?? ''), fresh?.title)
  const line = post.locator('[data-changed-mind]')
  check('the post carries one quiet line: "You changed your mind, <date>"', (await line.count()) === 1 && /^You changed your mind, \d{1,2} [A-Z][a-z]{2}/.test((await line.innerText()).trim()), await line.innerText().catch(() => ''))
  await post.screenshot({ path: `${SHOTS}/feed-changed-line.png` })
  await c.look('dark'); await post.screenshot({ path: `${SHOTS}/feed-changed-line-dark.png` }); await c.look('light')
  check('the heart is untouched', (await v('feed')).posts.find((one) => one.id === gem.id)?.liked === gem.liked)
  // Opened, the old note says it too, and the line opens the new one.
  await c.send('nugget', gem.id); await h.waitForTimeout(1500)
  const opened = h.locator('[data-changed-mind]').first()
  check('opened, the old note carries the same line', (await opened.count()) === 1)
  await h.screenshot({ path: `${SHOTS}/feed-changed-note.png` })
  await opened.click(); await h.waitForTimeout(1500)
  const title = await h.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? '')
  check('the line opens the new note', title.includes('it only works on small things'), title.slice(0, 80))
  // Undo, from the Feed: the new note goes, and the mark with it.
  await v('feed:unrestack', mark.id)
  check('the new note taken back, the old one is no longer marked', !(await v('feed')).posts.find((one) => one.id === gem.id)?.changedTo)
  check('no errors', !errors.length, errors.join('\n'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
