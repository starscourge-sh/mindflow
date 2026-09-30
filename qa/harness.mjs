/**
 * Drive the real app and report what it does.
 *
 * Playwright's Electron driver launches the built app, so this is the same
 * code a user runs - not jsdom, and not the extensions in isolation. Structure
 * is read back as the editor's own HTML, which says everything these checks
 * need (what is nested in what) without a test hook in the shipped code.
 *
 *   npm run build && node qa/harness.mjs
 */
import { _electron as electron } from 'playwright'

const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
/** Every line of the document, in the order they are read. */
const LINES = `${EDITOR} li > p, ${EDITOR} li > div > p, ${EDITOR} > p, ${EDITOR} > h1, ${EDITOR} > h2`

export async function open() {
  const app = await electron.launch({ args: ['.'] })
  const page = await app.firstWindow()
  const logs = []
  page.on('console', (message) => logs.push(message.text()))
  page.on('pageerror', (error) => logs.push(`PAGE ERROR: ${error.message}`))
  await page.waitForSelector(EDITOR, { timeout: 15000 })

  const api = {
    page,
    logs,
    /** Console output since the last call, for debugging a case. */
    drain() {
      return logs.splice(0, logs.length)
    },

    /** Empty the document and leave the caret in it, ready to type. */
    async reset() {
      // The app restores a draft, so without this each case starts on the last
      // one's leftovers.
      await page.evaluate(() => localStorage.clear())
      // Collapse whatever the last case left selected: the selection toolbar
      // floats over the text, and the click below lands on it instead.
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(120)
      await page.click(EDITOR)
      // Vim follows the page switch, so it may or may not be on. Insert mode
      // is where typing works either way.
      if (await page.locator(`${EDITOR}[data-vim-mode="normal"]`).count()) {
        await page.keyboard.press('i')
      }
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.press('Backspace')

      // Wait until it is genuinely empty. Without this a case starts typing
      // into the tail of the last one and its text arrives interleaved.
      await page.waitForFunction(
        (selector) => (document.querySelector(selector)?.textContent ?? '').trim() === '',
        EDITOR,
        { timeout: 5000 }
      )
    },

    /** Type lines, pressing Enter between them. */
    async type(lines) {
      for (let i = 0; i < lines.length; i++) {
        if (i) await page.keyboard.press('Enter')
        // Slowly enough that the input rules keep up. At a few milliseconds
        // the characters and the rule that turns "- " into a bullet arrive out
        // of order, and a letter lands in the middle of the word before.
        await page.keyboard.type(lines[i], { delay: 30 })
      }
      await page.waitForTimeout(80)
    },

    /**
     * Paste text, the way a real note arrives.
     *
     * Typing exercises the input rules; pasting exercises the markdown parser,
     * and the two build different documents from the same characters.
     */
    async paste(text) {
      await page.evaluate(async (value) => {
        const target = document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
        target?.focus()
        const data = new DataTransfer()
        data.setData('text/plain', value)
        target?.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
        )
      }, text)
      await page.waitForTimeout(300)
    },

    /**
     * Drag the block on one line onto another, by its handle.
     *
     * Hovering the line is what reveals the handle, so that comes first, and
     * the drop aims at the half of the target the block should end up on.
     */
    async drag(fromIndex, toIndex, { alt = false } = {}) {
      const lines = page.locator(LINES)
      await lines.nth(fromIndex).hover()
      await page.waitForTimeout(150)

      const grip = page.locator('.tiptap-drag-handle-grip')
      await grip.waitFor({ state: 'visible', timeout: 4000 })

      const target = await lines.nth(toIndex).boundingBox()
      const from = await grip.boundingBox()
      if (!target || !from) throw new Error('no box to drag between')

      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      if (alt) await page.keyboard.down('Alt')
      await page.mouse.down()
      // Which half of the target decides which side of it the block lands, so
      // a drag upwards aims high and a drag downwards aims low. Several steps
      // because one jump is not a drag - the handle needs movement to start one.
      const edge = toIndex < fromIndex ? 0.2 : 0.8
      await page.mouse.move(target.x + 40, target.y + target.height * edge, { steps: 12 })
      await page.waitForTimeout(120)
      await page.mouse.up()
      if (alt) await page.keyboard.up('Alt')
      await page.waitForTimeout(250)
    },

    /**
     * Drag a block to somewhere off-screen, holding at the edge so the
     * document scrolls under it. This is the move a long note needs and the
     * one that cannot be done with a single jump.
     */
    async dragToEdge(fromIndex, { up = false, hold = 1500 } = {}) {
      const lines = page.locator(LINES)
      await lines.nth(fromIndex).hover()
      await page.waitForTimeout(150)

      const grip = page.locator('.tiptap-drag-handle-grip')
      await grip.waitFor({ state: 'visible', timeout: 4000 })
      const from = await grip.boundingBox()
      const box = await page.locator('.mindflow-editor-content').boundingBox()
      if (!from || !box) throw new Error('no box to drag in')

      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      const edge = up ? box.y + 20 : box.y + box.height - 20
      await page.mouse.move(box.x + 60, edge, { steps: 10 })

      // Held at the edge, nudging, because the scroll runs off dragover.
      const until = Date.now() + hold
      while (Date.now() < until) {
        await page.mouse.move(box.x + 60, edge + (Date.now() % 2 ? 1 : -1))
        await page.waitForTimeout(30)
      }
      // Back inside before letting go: on the very edge the pointer is over
      // the scroll boundary rather than over a line to drop against.
      await page.mouse.move(box.x + 60, up ? box.y + 80 : box.y + box.height - 80, { steps: 5 })
      await page.waitForTimeout(120)
      await page.mouse.up()
      await page.waitForTimeout(250)
    },

    /** How far the document has scrolled. */
    scrollTop() {
      return page.$eval('.mindflow-editor-content', (box) => box.scrollTop)
    },

    async press(...keys) {
      for (const key of keys) {
        await page.keyboard.press(key)
        // A command re-renders the document; clicking or pressing again before
        // that settles acts on the shape that was there a moment ago.
        await page.waitForTimeout(140)
      }
    },

    /** Click the nth line of the document, the way a person would. */
    async line(index) {
      const lines = page.locator(LINES)
      await lines.nth(index).click()
      // The click and the selection it causes are not the same tick: press a
      // key too soon and it lands wherever the caret was before.
      await page.waitForTimeout(120)
    },

    /**
     * The document, as a shape that is easy to read in a report.
     *
     * A task item is reported as one line rather than the label, checkbox,
     * span and div it is really made of: what these checks are about is which
     * list holds what, and that detail buries it.
     */
    async shape() {
      return page.$eval(EDITOR, (root) => {
        const walk = (element, depth) => {
          const out = []
          for (const child of element.children) {
            const pad = '  '.repeat(depth)
            const kind = child.getAttribute('data-type')

            // A task item is an `li` holding a checkbox; nothing marks it with
            // a data-type, so that is what it is recognised by.
            if (child.tagName === 'LI' && child.querySelector(':scope > label > input')) {
              const ticked = child.querySelector(':scope > label > input')?.checked
              const body = child.querySelector(':scope > div')
              const text = body?.querySelector(':scope > p')?.textContent?.trim() ?? ''
              out.push(`${pad}[${ticked ? 'x' : ' '}] "${text}"`)
              // Everything else under the item - which is where a broken
              // convert hides a whole list.
              if (body) {
                for (const part of body.children) {
                  if (part.tagName === 'P') continue
                  out.push(...walk({ children: [part] }, depth + 1))
                }
              }
              continue
            }

            const tag = child.tagName.toLowerCase()
            const name = kind ? `${tag}[${kind}]` : tag
            const text = child.firstElementChild ? '' : ` "${(child.textContent ?? '').trim()}"`
            out.push(`${pad}${name}${text}`)
            out.push(...walk(child, depth + 1))
          }
          return out
        }
        return walk(root, 0).join('\n')
      })
    },

    /** Where the caret is, as the text of the line it is on. */
    async caretLine() {
      return page.evaluate(() => {
        const node = window.getSelection()?.anchorNode
        const element = node?.nodeType === 3 ? node.parentElement : node
        return element?.closest('li, p, h1, h2, h3')?.textContent?.trim() ?? null
      })
    },

    async close() {
      // Electron can sit on the close; the harness should not hang a test run.
      await Promise.race([app.close(), new Promise((done) => setTimeout(done, 4000))])
    }
  }

  return api
}
