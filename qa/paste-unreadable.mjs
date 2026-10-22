// A paste from Apple Notes: text, HTML and a picture whose File cannot be read
// (a pointer into Notes' own folder). The words must land, the browser's long
// "could not be read" error must never show, the clipboard's own picture is
// taken instead, and only when there is no picture anywhere is a short notice said.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-paste/main/index.js HALIGTREE_QA_AWAY=1 node qa/paste-unreadable.mjs
import { open, checks } from './harness.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const qa = await open()
const { page, electron } = qa
const wait = (ms) => page.waitForTimeout(ms)

// The person's own clipboard text, put back at the end.
const before = await electron.evaluate(({ clipboard }) => clipboard.readText().catch(() => ''))

try {
  if (!(await page.evaluate(() => window.api.haligtree('onboarding:state').then((s) => !!s?.welcomed))))
    await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false }))

  // Everything said, and a File that fails the way a Notes pointer does.
  await page.evaluate(() => {
    window.__said = []
    addEventListener('haligtree:said', (e) => window.__said.push(e.detail.text))
    const read = Blob.prototype.arrayBuffer
    File.prototype.arrayBuffer = function () {
      if (this.name === 'notes-pointer.png')
        return Promise.reject(new DOMException('The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.', 'NotReadableError'))
      return read.call(this)
    }
  })
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(40, 30)
    const g = canvas.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 40, 30)
    return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())]
  })

  const setClipboardPicture = (on) => electron.evaluate(async ({ clipboard, ClipboardItem }, [on, bytes]) => {
    if (on) await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Uint8Array.from(bytes)], { type: 'image/png' }) })])
    else await clipboard.writeText('')
  }, [on, png])

  /** A fresh box, then a paste of the given words and files. */
  const paste = async ({ words, html, file }) => {
    await page.evaluate(() => window.api.showPrompt())
    await wait(300)
    await page.keyboard.press('Meta+n')
    await wait(300)
    await page.click(EDITOR)
    await page.evaluate(([words, html, file, png, EDITOR]) => {
      window.__said = []
      const data = new DataTransfer()
      data.setData('text/plain', words)
      if (html) data.setData('text/html', html)
      if (file) data.items.add(new File([Uint8Array.from(png)], file, { type: 'image/png' }))
      document.querySelector(EDITOR).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, [words, html, file, png, EDITOR])
    await wait(1500)
    return page.evaluate((EDITOR) => {
      const editor = document.querySelector(EDITOR)
      return { text: editor.textContent, pictures: [...editor.querySelectorAll('img')].map((img) => img.getAttribute('src')), said: window.__said }
    }, EDITOR)
  }
  const raw = (said) => said.some((line) => /could not be read, typically|Not added/i.test(line))
  const LOST = 'The picture could not be copied from the other app. Drag it in instead.'
  const words = 'The Silk Road ran from Chang an to Antioch.'
  const html = `<meta charset="utf-8"><div>${words}</div><div><br></div>`

  // 1. Unreadable file, but the picture is on the clipboard: words and picture both land, nothing said.
  await setClipboardPicture(true)
  let got = await paste({ words, html, file: 'notes-pointer.png' })
  check('clipboard picture: the words land', got.text.includes('Silk Road'), got.text)
  check('clipboard picture: the clipboard picture is used', got.pictures.length === 1 && got.pictures[0]?.startsWith('haligtree://'), got.pictures)
  check('clipboard picture: no notice', got.said.length === 0, got.said)

  // 2. Unreadable file and no picture anywhere: the words land, the short notice, never the raw error.
  await setClipboardPicture(false)
  got = await paste({ words, html, file: 'notes-pointer.png' })
  check('no picture: the words land', got.text.includes('Silk Road'), got.text)
  check('no picture: no picture is added', got.pictures.length === 0, got.pictures)
  check('no picture: no raw "could not be read" notice', !raw(got.said), got.said)
  check('no picture: the short notice is said', got.said.length === 1 && got.said[0] === LOST, got.said)

  // 3. Plain text only (no HTML) with the unreadable file: words still land.
  got = await paste({ words, html: '', file: 'notes-pointer.png' })
  check('plain text only: the words land', got.text.includes('Silk Road'), got.text)
  check('plain text only: no raw notice', !raw(got.said), got.said)

  // 4. A readable picture still pastes as before, with nothing said.
  got = await paste({ words, html, file: 'map.png' })
  check('readable file: the words land', got.text.includes('Silk Road'), got.text)
  check('readable file: the picture lands', got.pictures.length === 1 && got.pictures[0]?.startsWith('haligtree://'), got.pictures)
  check('readable file: no notice', got.said.length === 0, got.said)
} finally {
  await electron.evaluate(({ clipboard }, text) => clipboard.writeText(text), before).catch(() => {})
  try { await qa.close?.() } catch {}
  try { electron.process().kill('SIGKILL') } catch {}
}
done()
