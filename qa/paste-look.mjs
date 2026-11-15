// How a long paste looks as it lands, light and dark: frames of a fresh page from just before the paste until all of
// it is in, to read by eye beside the page's siblings. Landed in one piece, the frames show the page before and after;
// coming in stretches, they show the app's one loader ("Pasting the rest…") where the words land. Run on a copy of
// the seeded sandbox:
//
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<folder> node qa/paste-look.mjs
//
// The paste is a paste event with its words on it (qa/pasteboard.mjs `paste`): the Mac's clipboard is never touched.
import { mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { paste } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = join(process.env.QA_SHOTS ?? '/tmp', 'paste-look')
mkdirSync(shots, { recursive: true })
const wait = (ms) => new Promise((next) => setTimeout(next, ms))
// Some 600,000 characters of Markdown: headings, paragraphs and lists, as a long note pasted from Obsidian is.
const words = Array.from({ length: 800 }, (_, i) => `## Part ${i + 1}\n\nIt was on a dreary night of November that I beheld the accomplishment of my toils, and the rain pattered dismally against the panes. ${'The candle was nearly burnt out, and by its glimmer I saw the dull yellow eye of the creature open. '.repeat(4)}\n\n- one thing to keep\n- another thing to keep\n`).join('\n')
const EDITOR = '[data-open] .tiptap'

const c = await sandbox({ width: 1300, height: 900 })
const h = c.h
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    // A fresh page of its own, made and opened as qa/paste-shapes.mjs makes one, its caret at its end.
    const id = await c.v('article:new')
    await c.v('item:save', id, { title: `Pasted ${theme}`, body: { type: 'doc', content: [{ type: 'paragraph' }] } })
    await c.send('article', id)
    const open = await h.waitForFunction((sel) => !!document.querySelector(sel)?.editor, EDITOR, { timeout: 20000 }).then(() => true).catch(() => false)
    if (!check(`${theme}: a fresh page opens to paste into`, open)) continue
    await wait(1200)
    await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), EDITOR)
    await h.screenshot({ path: join(shots, `${theme}-0-before.png`) })
    // Frames from the moment of the paste until all of it is in, as fast as the window gives them.
    const pasting = paste(h, words, EDITOR)
    let n = 0
    let loader = ''
    const started = Date.now()
    while (Date.now() - started < 15000) {
      const now = await h.evaluate((sel) => {
        const ed = document.querySelector(sel)
        const el = ed?.querySelector('[data-paste-loader]')
        return { loader: el ? el.textContent.trim() : '', blocks: ed?.editor?.state.doc.childCount ?? 0 }
      }, EDITOR)
      loader ||= now.loader
      await h.screenshot({ path: join(shots, `${theme}-${String(++n).padStart(2, '0')}${now.loader ? '-coming' : ''}.png`) })
      if (!now.loader && now.blocks > 100) break
    }
    await pasting
    await wait(800)
    await h.screenshot({ path: join(shots, `${theme}-after.png`) })
    const blocks = await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.childCount, EDITOR)
    check(`${theme}: all of the paste is on the page`, blocks >= 2400, `${blocks} blocks, ${n} frames${loader ? `, the loader saying "${loader}"` : ', no loader (it came in one piece)'}`)
  }
  console.log(`(frames in ${shots})`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
done()
