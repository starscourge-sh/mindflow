// A tip never only repeats words already showing in full (the outline's headings had one each); cut-off words still get one.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/title-tips-repeat.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await h.waitForTimeout(1000)
  await h.evaluate(() => {
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;left:300px;top:300px;z-index:200;display:flex;flex-direction:column;gap:20px;background:#888;padding:10px'
    box.innerHTML = `
      <button id="qa-whole" class="tiptap-toc-item" title="How to Run"><span class="tiptap-toc-rule"></span><span class="tiptap-toc-text">How to Run</span></button>
      <button id="qa-cut" title="3. PROJECT 1: Movie Recommender System" style="width:120px"><span style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">3. PROJECT 1: Movie Recommender System</span></button>
      <button id="qa-more" title="Opens the note in a window of its own">Open</button>`
    document.body.append(box)
  })
  const tipOn = async (id) => {
    const b = await h.locator(`#${id}`).boundingBox()
    await h.mouse.move(10, 10)
    await h.waitForTimeout(200)
    await h.mouse.move(b.x + 10, b.y + b.height / 2, { steps: 3 })
    await h.waitForTimeout(1000)
    return h.locator('[data-title-tips]').textContent({ timeout: 100 }).catch(() => null)
  }
  const whole = await tipOn('qa-whole')
  check('a heading shown in full gets no tip', whole === null, String(whole))
  const cut = await tipOn('qa-cut')
  check('a heading cut short gets its whole name as a tip', cut === '3. PROJECT 1: Movie Recommender System', String(cut))
  const more = await tipOn('qa-more')
  check('a tip that says something new still shows', more === 'Opens the note in a window of its own', String(more))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
