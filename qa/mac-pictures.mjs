// Text in pictures and handwriting from photos (Apple's Vision, every Mac): a photo of a
// notebook page kept in a note is found by ⌘K by the words written on it, the result shows
// the picture; right-clicking it, in the note and in Media, offers the same lines ("Copy text
// from image", "Make it a note", "Find this in my notes", and "Translate the text" only on
// macOS 26), and each does what it says. Run again as a macOS 15 Mac: no Translate line.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-pictures.mjs
// SHOT=<folder> keeps the ⌘K result and the menu, light and dark.
import { readFileSync } from 'fs'
import { join } from 'path'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const page = [...readFileSync(join(import.meta.dirname, 'fixtures/notebook-page.png'))]
const LINES = ['Copy text from image', 'Make it a note', 'Find this in my notes']

async function run(level) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1100, height: 800, at: CALM_HOUR })
  const { h, electron, send, both } = c
  const wait = (ms) => h.waitForTimeout(ms)
  const kept = await electron.evaluate(({ clipboard }) => clipboard.readText())
  try {
    const src = await h.evaluate((bytes) => window.api.saveImage('image/png', new Uint8Array(bytes)), page)
    const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('Lecture photo'), { type: 'image', attrs: { src } }] })
    const translate = level !== 'macos15'

    if (level === 'macos26') {
      // Search reads the picture in the background the first time it meets it.
      let found = null
      for (let i = 0; i < 60 && !found?.picture; i++) {
        const all = await h.evaluate(() => window.api.captures.find('judgements'))
        found = all.find((one) => one.id === id) ?? null
        if (!found?.picture) await wait(500)
      }
      check('search finds the note by a word written in its picture', !!found, JSON.stringify(found)?.slice(0, 200))
      check('the result says the line was in a picture, and brings the picture', found?.picture === src && /judgements are up to us/i.test(found?.line ?? ''), `${found?.line} ${found?.picture?.slice(-20)}`)
      // ⌘K, as a person: the row shows the picture beside the line.
      await h.keyboard.press('Meta+k')
      await wait(500)
      await h.keyboard.type('judgements', { delay: 30 })
      await wait(1200)
      const row = await h.evaluate(() => {
        const one = document.querySelector('[data-found-picture]')
        return one ? { text: one.textContent, img: !!one.querySelector('img')?.naturalWidth } : null
      })
      check('⌘K shows “In a picture:” with the picture beside it', row?.img && /In a picture: .*judgements/i.test(row.text), JSON.stringify(row))
      if (process.env.SHOT) await both(`${process.env.SHOT}/pictures-search`)
      await h.keyboard.press('Escape')
      await wait(400)
    }

    await send('capture', id)
    await wait(1800)
    const menu = async () => {
      await h.locator(`.ProseMirror img[src="${src}"]`).first().click({ button: 'right' })
      await wait(500)
      return h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((row) => ({ text: row.textContent.trim(), icon: !!row.querySelector('svg'), hand: getComputedStyle(row).cursor })))
    }
    let rows = await menu()
    const has = (label) => rows.some((one) => one.text.startsWith(label))
    check(`${level}: a picture in a note offers ${LINES.join(', ')}`, LINES.every(has), rows.map((one) => one.text).join(' / '))
    check(`${level}: “Translate the text” is offered ${translate ? 'on this Mac' : 'nowhere (it needs macOS 26)'}`, has('Translate the text') === translate)
    check(`${level}: each line has an icon and the hand`, rows.filter((one) => [...LINES, 'Translate the text'].some((label) => one.text.startsWith(label))).every((one) => one.icon && one.hand === 'pointer'))
    if (process.env.SHOT && level === 'macos26') await both(`${process.env.SHOT}/pictures-menu`)

    if (level === 'macos26') {
      await h.getByRole('menuitem', { name: /^Copy text from image/ }).click()
      let copied = ''
      for (let i = 0; i < 40 && !/Marcus Aurelius/.test(copied); i++) (await wait(250), (copied = await electron.evaluate(({ clipboard }) => clipboard.readText())))
      check('“Copy text from image” copies the handwriting, line by line, in order', /^Lecture 4: the Stoics\nMarcus Aurelius kept a notebook\nonly our judgements are up to us\nread Meditations/.test(copied), JSON.stringify(copied.slice(0, 90)))

      rows = await menu()
      const before = await h.evaluate(() => window.api.captures.list().then((all) => all.length))
      await h.getByRole('menuitem', { name: /^Make it a note/ }).click()
      let made = null
      for (let i = 0; i < 20 && !made; i++) {
        await wait(300)
        made = await h.evaluate(async (was) => { const all = await window.api.captures.list(); return all.length > was ? all.find((one) => /Lecture 4/.test(one.title ?? '') || /Lecture 4/.test(JSON.stringify(one))) ?? null : null }, before)
      }
      const notice = await h.evaluate(() => document.body.innerText.match(/Made a note of its \d+ lines/)?.[0] ?? '')
      check('“Make it a note” makes one note with the picture and its words typed out, and says so', !!made && !!notice, `${notice} ${made?.id ?? ''}`)

      rows = await menu()
      await h.getByRole('menuitem', { name: /^Find this in my notes/ }).click()
      await wait(1200)
      const asked = await h.evaluate(() => document.querySelector('[role="dialog"] input, [cmdk-input], input[placeholder*="Search"]')?.value ?? '')
      check('“Find this in my notes” opens search on the picture’s words', /judgements|Meditations|Marcus|Aurelius/i.test(asked), asked)
      const typing = await h.evaluate(() => document.activeElement?.tagName === 'INPUT' && !!document.activeElement.closest('[role="dialog"]'))
      check('search opens ready to type, so Esc closes it', typing)
      await h.keyboard.press('Escape')
      await wait(300)

      // Media: the same lines on the picture's tile.
      await h.keyboard.press('Escape')
      await c.go('media')
      await wait(1500)
      const tile = h.locator(`[data-media="picture"][data-src="${src}"]`).first()
      await tile.scrollIntoViewIfNeeded()
      await tile.click({ button: 'right' })
      await wait(500)
      // Its copy lines sit together under “Copy”, as on every row.
      await h.getByRole('menuitem', { name: /^Copy$/ }).hover().catch(() => {})
      await wait(500)
      const media = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent.trim()))
      check('Media offers the same lines on the picture', [...LINES, 'Translate the text'].every((label) => media.some((one) => one.startsWith(label))), media.join(' / '))
      await h.keyboard.press('Escape')
    }
    check(`${level}: no page errors`, !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } finally {
    await electron.evaluate(({ clipboard }, text) => clipboard.writeText(text), kept).catch(() => {})
    await c.close()
  }
}

await run('macos26')
await run('macos15')
done()
