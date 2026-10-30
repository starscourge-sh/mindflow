// Copying a list out of a note gives plain-text apps (WhatsApp) a list that reads as one: "- " bullets, numbers,
// checkboxes and nested lines indented, one line each, not every marker dropped with a blank line between items.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/copy-plain.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { page, electron } = c
try {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(900)
  await page.evaluate(() => {
    const ed = document.querySelector('.tiptap.ProseMirror').editor
    ed.commands.setContent('<ul><li><p>milk</p><ul><li><p>oat</p></li></ul></li><li><p>bread</p></li></ul><ol><li><p>first</p></li><li><p>second</p></li></ol>')
    ed.commands.focus(); ed.commands.selectAll()
  })
  await page.keyboard.press('Meta+c'); await page.waitForTimeout(300)
  const text = await electron.evaluate(({ clipboard }) => clipboard.readText())
  console.log(JSON.stringify(text))
  check('bullets keep their "- " and the nested line its indent', /^- milk\n\s{2,}- oat\n- bread/m.test(text), text)
  check('numbers keep their "1." "2."', /1\. first\n2\. second/.test(text), text)
  check('no blank line between items of one list', !/milk\n\n/.test(text), text)
  await page.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
