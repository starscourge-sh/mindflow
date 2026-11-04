// By default the Feed holds only what you chose to keep: gems, quotes, held questions and Journal days. An Inbox note
// with a screenshot in it never shows; with Settings' "Also show notes with pictures" on, pictured notes come, each
// saying why it is there and where the switch is.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/feed-kept-only.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const SHOTS = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, errors } = c
const loose = (posts) => posts.filter((one) => one.type === 'capture' && one.kind !== 'quote')
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: 'like obsidian, be able to open up to 4 splits? #bug-report\n\n![shot](haligtree://assets/zz-shot.png)' }))
  const before = (await v('feed')).posts
  check('by default, the pictured Inbox note is not in the Feed', !before.some((one) => one.id === id))
  check('by default, no plain note at all: only what you kept', loose(before).length === 0, loose(before).map((one) => one.title).join(' | '))
  check('the setting is off to start', (await v('settings')).feedPictures !== true)
  await go('settings'); await h.waitForTimeout(1000)
  await h.locator('text=What comes back to you').first().click(); await h.waitForTimeout(600)
  const setting = h.locator('text=Also show notes with pictures').first()
  check('Settings has "Also show notes with pictures"', (await setting.count()) === 1)
  await setting.scrollIntoViewIfNeeded().catch(() => {})
  await h.screenshot({ path: `${SHOTS}/feed-pictures-setting.png` })
  await v('settings:set', { feedPictures: true })
  const after = (await v('feed')).posts
  check('switched on, notes with pictures come into today\'s Feed', loose(after).length > 0, String(loose(after).length))
  await go('feed'); await h.waitForTimeout(1400)
  const one = loose(after)[0]
  const line = one ? await h.locator(`[data-feed-id="${one.id}"] [data-feed-context]`).innerText().catch(() => '') : ''
  check('each says why, and where the switch is', /A note (with a picture|you brought in)|From the archives/.test(line) && /Settings/.test(line), line)
  if (one) {
    const node = h.locator(`[data-feed-id="${one.id}"]`)
    await node.scrollIntoViewIfNeeded(); await node.screenshot({ path: `${SHOTS}/feed-pictured-reason.png` })
  }
  await v('settings:set', { feedPictures: false })
  check('off again, they go', loose((await v('feed')).posts).length === 0)
  check('no errors', !errors.length, errors.join('\n'))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
