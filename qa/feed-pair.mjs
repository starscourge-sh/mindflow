// "Two subjects, one thread": one post a day at most, two notes with no tag in common that share an unusual word,
// a source or an hour, each with its tags and each opening its note, and the reason in plain words.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-pair.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const SHOTS = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, errors } = c
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  for (const body of ['Heat death is a thermodynamic patience. #zphysics', 'A poem is a thermodynamic argument against forgetting. #zpoetry'])
    await h.evaluate((one) => window.api.captures.create({ kind: 'quote', body: one }), body)
  // Picked again under the switches as they were: today's set is made afresh, with the new notes in the book.
  await v('settings:set', { feedPictures: true }); await v('feed')
  await v('settings:set', { feedPictures: false })
  const posts = (await v('feed')).posts
  const pairs = posts.filter((one) => one.type === 'pair')
  check('one "Two subjects, one thread" post, no more', pairs.length === 1, String(pairs.length))
  const pair = pairs[0]?.pair
  const [a, b] = pair?.notes ?? []
  check('its two notes share no tag', a && b && !a.tags.some((tag) => b.tags.includes(tag)), JSON.stringify([a?.tags, b?.tags]))
  if (pair?.why.kind === 'word') check('the word is in both', [a, b].every((one) => `${one.title} ${one.text}`.toLowerCase().includes(pair.why.word)), pair.why.word)
  await go('feed'); await h.waitForTimeout(1400)
  const node = h.locator('[data-feed-post="pair"]')
  await node.scrollIntoViewIfNeeded()
  const why = await node.locator('[data-feed-pair-why]').innerText().catch(() => '')
  check('it says why in plain words, with both subjects', /^(Both say \S+|Both quote .+|Kept within the same hour)/.test(why) && (a.tags.length && b.tags.length ? /#\S+ and #\S+/.test(why) : true), why)
  check('the line over it says what it is', /Two subjects, one thread/.test(await node.locator('[data-feed-context]').innerText().catch(() => '')))
  check('each note shown, with its tags', (await node.locator('[data-feed-pair-note]').count()) === 2)
  await node.screenshot({ path: `${SHOTS}/feed-pair.png` })
  await c.look('dark'); await node.screenshot({ path: `${SHOTS}/feed-pair-dark.png` }); await c.look('light')
  await node.locator(`[data-feed-pair-note="${b.id}"] [data-feed-quoted]`).click(); await h.waitForTimeout(1500)
  // Its own tab is the one lit (a tab says what it holds: "nugget:<id>"), and its words are on the page. Which pair
  // the day finds is the book's to say: a study card's page shows its answer, its question naming the tab and its
  // row, so the page is matched by the note's name or by its words, whichever it is written in.
  const opened = await h.evaluate(() => ({ tab: document.querySelector('[data-tab][data-tab-on]')?.dataset.tabOpen ?? '', page: (document.querySelector('.ProseMirror')?.textContent ?? '').toLowerCase() }))
  const onPage = (words) => !!words && opened.page.includes(words.toLowerCase().slice(0, 20))
  check('a note in it opens that note', opened.tab.endsWith(`:${b.id}`) && (onPage(b.title) || onPage(b.text)), `${b.title.slice(0, 30)} :: tab ${opened.tab} :: ${opened.page.slice(0, 60)}`)
  check('no errors', !errors.length, errors.join('\n'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
