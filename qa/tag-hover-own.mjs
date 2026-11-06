// A #tag inside a row lights in its own colour and underlines under the pointer, so it never
// reads as the row's own highlight (they open different things). Today's task rows and Home's
// "More from #tag" heading, light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/tag-hover-own.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const { h, go } = c
const shot = process.env.SHOT ?? '/tmp/tag-hover-own'
const look = (sel) => h.evaluate((sel) => {
  const el = document.querySelector(sel)
  const style = getComputedStyle(el)
  return { bg: style.backgroundColor, line: style.textDecorationLine }
}, sel)
try {
  await h.waitForTimeout(1500)
  await c.v('task:add', 'Water the plants #daily', undefined, true)
  await go('today')
  await h.waitForTimeout(1200)
  const tag = h.locator('[data-tag-go]').first()
  check('a task row carries a tag', await tag.count() > 0)
  await tag.scrollIntoViewIfNeeded()
  const box = await tag.boundingBox()
  // On the row first: the tag stays plain.
  await h.mouse.move(box.x - 60, box.y + box.height / 2)
  await h.waitForTimeout(300)
  const rest = await look('[data-tag-go]')
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await h.waitForTimeout(300)
  const over = await look('[data-tag-go]')
  check('row hover: the tag is plain', rest.line === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(rest.bg), JSON.stringify(rest))
  check('tag hover: its own tint and an underline', over.line === 'underline' && over.bg !== rest.bg, JSON.stringify(over))
  await c.both(`${shot}-today`)

  await go('home')
  await h.waitForTimeout(1500)
  const heading = h.locator('[data-home-tag]').first()
  if (await heading.count()) {
    await heading.scrollIntoViewIfNeeded()
    const at = await heading.boundingBox()
    await h.mouse.move(at.x + at.width / 2, at.y + at.height / 2, { steps: 6 })
    await h.waitForTimeout(300)
    const home = await look('[data-home-tag]')
    check('Home "More from #tag": the tag is a link, tinted and underlined under the pointer', home.line === 'underline', JSON.stringify(home))
    check('Home "More from #tag": the hand cursor', await heading.evaluate((el) => getComputedStyle(el).cursor) === 'pointer')
    await c.both(`${shot}-home`)
    await heading.click()
    await h.waitForTimeout(800)
    check('clicking it opens the tag', await h.evaluate(() => location.hash + document.title).then((s) => s.length > 0))
  } else console.log('note: no "More from" row in the seeded book')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
