import { num } from '../../../main/dates'
import type { Editor } from '@tiptap/core'
import { step } from './sound'
import { refuse, toast } from '@/components/haligtree/ui'

/**
 * A note, or a few of its blocks, drawn as a picture: for a code block, a
 * table or a list of lined-up numbers sent in a chat, where pasted words lose
 * their alignment.
 *
 * Drawn by the page itself, not copied out of a screenshot: the blocks are
 * cloned into a frame of their own laid over the window, so every rule of the
 * editor's own styling applies (its fonts, code colours, lists, tables), the
 * window takes what it shows inside the frame (main 'picture-of-rect'), and the
 * frame goes again: on screen for two painted frames, over the blocks themselves
 * where they fit. Square, edge to edge. Being clones, they carry no caret, selection, handles or
 * spelling marks. A note taller than the window is taken a window's height at
 * a time and the pieces put together.
 */

const PAD = 32
/** The frame, made at twice the size it is laid out at, for a sharp picture on any screen. */
const SCALE = 2

/** Each of the editor's top-level blocks the selection touches, whole; inside one code block, that block. */
export function pickedBlocks(editor: Editor): HTMLElement[] {
  const { from, to } = editor.state.selection
  const blocks: HTMLElement[] = []
  editor.state.doc.nodesBetween(from, to, (_node, pos) => {
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) blocks.push(dom)
    return false
  })
  return blocks
}

/** The page of a note open in this window ("capture-…" or "item-…"), if it is. */
const notePage = (document: string): HTMLElement | null =>
  globalThis.document.querySelector<HTMLElement>(`[data-document="${CSS.escape(document)}"] .tiptap.ProseMirror`)

/** The first colour painted behind the page: the note's own background. */
function backgroundOf(element: HTMLElement): string {
  for (let at: HTMLElement | null = element; at; at = at.parentElement) {
    const colour = getComputedStyle(at).backgroundColor
    if (colour && colour !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(colour)) return colour
  }
  return getComputedStyle(document.body).backgroundColor
}

/** Marks of editing that the clones must not carry into the picture: taken out whole. */
const EDITING = '.ProseMirror-widget, .ProseMirror-gapcursor, [data-drag-handle], .drag-handle, .vim-block-cursor'
/** And marks laid on the words themselves (the kept selection, focus, a picked block): the words stay, the mark goes. */
const MARKS = ['selection', 'ProseMirror-selectednode', 'has-focus', 'mf-in-focus', 'vim-block-cursor']

/** A block's clone with only its words and their own styling. */
function cleanClone(block: HTMLElement): HTMLElement {
  const clone = block.cloneNode(true) as HTMLElement
  for (const mark of clone.querySelectorAll(EDITING)) mark.remove()
  for (const one of [clone, ...clone.querySelectorAll<HTMLElement>(MARKS.map((name) => `.${name}`).join(','))]) one.classList.remove(...MARKS)
  // An empty line's hint ("Write, or type / for commands…") is the editor speaking, not the note.
  for (const one of [clone, ...clone.querySelectorAll<HTMLElement>('[data-placeholder], .is-empty')]) (one.removeAttribute('data-placeholder'), one.classList.remove('is-empty', 'is-editor-empty'))
  // A grammar or spelling finding (proofread.tsx): its underline is a class of its own, named by the finding.
  for (const one of clone.querySelectorAll<HTMLElement>('[data-grammar]')) (one.removeAttribute('class'), one.removeAttribute('data-grammar'))
  return clone
}

/** The blocks as a PNG; `blocks` are the page's own children, never moved or changed. */
async function drawBlocks(page: HTMLElement, blocks: HTMLElement[]): Promise<Uint8Array> {
  const pageStyle = getComputedStyle(page)
  const column = page.clientWidth - parseFloat(pageStyle.paddingLeft) - parseFloat(pageStyle.paddingRight)

  // The page's own ancestry, empty, so every rule written for the editor
  // where it lives ("…wrapper .tiptap pre") still finds the clones.
  const inner = page.cloneNode(false) as HTMLElement
  inner.removeAttribute('contenteditable')
  inner.setAttribute('spellcheck', 'false')
  inner.style.cssText = `display:flow-root;width:${column}px;max-width:none;min-height:0;margin:0;padding:0;outline:none`
  // The focus band dims every block but the one being written in.
  inner.removeAttribute('data-focus-band')
  for (const block of blocks) inner.append(cleanClone(block))

  let outer = inner
  for (let at = page.parentElement; at && at !== document.body; at = at.parentElement) {
    const shell = at.cloneNode(false) as HTMLElement
    shell.removeAttribute('id')
    shell.dataset.pictureShell = ''
    shell.style.cssText = 'display:block;position:static;width:auto;height:auto;min-height:0;max-height:none;margin:0;padding:0;border:0;overflow:visible;transform:none;background:none;box-shadow:none;opacity:1;filter:none'
    shell.append(outer)
    outer = shell
  }

  const frame = document.createElement('div')
  frame.setAttribute('aria-hidden', 'true')
  frame.dataset.pictureFrame = ''
  // Where the blocks' own words start on screen: the frame is put so its words land on them, and the flash moves nothing.
  const said = document.createRange()
  said.setStartBefore(blocks[0])
  said.setEndAfter(blocks.at(-1)!)
  const top = Math.max(0, said.getBoundingClientRect().top - PAD)
  // In the top layer, shown last: over every menu and bar, even one still fading out as this starts.
  frame.popover = 'manual'
  frame.style.cssText = `position:fixed;inset:auto;left:0;top:0;margin:0;border:0;height:auto;max-width:none;max-height:none;pointer-events:none;visibility:hidden;box-sizing:content-box;width:${column}px;padding:${PAD}px;overflow:hidden;background:${backgroundOf(page)};color:${pageStyle.color};zoom:${SCALE / devicePixelRatio}`
  // The ancestry's own layers are the window's, not the note's: the dark frame's grain (a ::before over the whole frame,
  // main.css data-frame-grain) laid itself over the picture's ground, a grey grain where the page's colour should be.
  const bare = document.createElement('style')
  bare.textContent = '[data-picture-shell]::before,[data-picture-shell]::after{content:none!important}'
  frame.append(bare, outer)
  document.body.append(frame)
  frame.showPopover()
  const pngs: Uint8Array[] = []
  try {
    await document.fonts.ready
    // The frame's padding is the only space around the blocks, even on every side: the first one's
    // space above and the last one's below (however deep in it they sit) are taken back.
    const words = document.createRange()
    words.selectNodeContents(inner)
    const drawn = words.getBoundingClientRect()
    const box = inner.getBoundingClientRect()
    const zoom = SCALE / devicePixelRatio
    inner.style.marginTop = `${-(drawn.top - box.top) / zoom}px`
    inner.style.marginBottom = `${-(box.bottom - drawn.bottom) / zoom}px`
    // Over the blocks themselves where it fits, so it shows as little as it can while it is taken.
    const size = frame.getBoundingClientRect()
    const left = Math.max(0, Math.min(page.getBoundingClientRect().left + parseFloat(pageStyle.paddingLeft) - PAD, innerWidth - size.width))
    const slices = Math.ceil(size.height / innerHeight)
    const y = slices > 1 ? 0 : Math.min(top, innerHeight - size.height)
    for (let slice = 0; slice < slices; slice++) {
      // CSS zoom scales the offsets too: they are written in the frame's own pixels.
      frame.style.left = `${left / zoom}px`
      frame.style.top = `${(y - slice * innerHeight) / zoom}px`
      // Shown only once it is in place: never a frame of it at the window's corner first.
      frame.style.visibility = 'visible'
      // Drawn on screen before it is taken: after the next frame has been painted.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      const height = Math.min(innerHeight, size.height - slice * innerHeight)
      const png = await window.api.pictureOfRect({ x: left, y: slice > 0 ? 0 : y, width: Math.min(size.width, innerWidth), height })
      if (!png) throw new Error('the window gave back no picture')
      pngs.push(png)
    }
  } finally {
    frame.remove()
  }
  // Put together, square: rounded corners had to be see-through, and mail (Outlook, Gmail) paints see-through white,
  // a white corner on a dark picture. Where it lands rounds it if it wants to (a chat bubble does).
  const pieces = await Promise.all(pngs.map((png) => createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }))))
  const canvas = document.createElement('canvas')
  canvas.width = pieces[0].width
  canvas.height = pieces.reduce((sum, one) => sum + one.height, 0)
  const ink = canvas.getContext('2d')!
  let at = 0
  for (const piece of pieces) (ink.drawImage(piece, 0, at), (at += piece.height), piece.close())
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'))
  if (!blob) throw new Error('its pieces could not be put together')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Copy the picture, or save it to a file, and say so. */
export async function sharePicture(page: HTMLElement | null, blocks: HTMLElement[] | null, { save, name = 'Note' }: { save?: boolean; name?: string } = {}): Promise<void> {
  if (!page) return refuse('Open the note to make a picture of it')
  // The whole note: its blocks, without what the editor lays among them (the Properties block) or the empty line it keeps at the end.
  const picked = blocks ?? ([...page.children] as HTMLElement[]).filter((one) => !one.classList.contains('ProseMirror-widget'))
  // Nor the empty lines at either end: an empty first line showed its "Write, or type / for commands…" in the picture.
  const empty = (one: HTMLElement): boolean => !one.textContent!.trim() && !one.querySelector('img, video, iframe, canvas, svg, hr')
  while (!blocks && picked.length && empty(picked.at(-1)!)) picked.pop()
  while (!blocks && picked.length && empty(picked[0])) picked.shift()
  if (!picked.length) return refuse('Nothing to make a picture of')
  try {
    const png = await drawBlocks(page, picked)
    if (save) {
      if (await window.api.savePicture(`${name.replace(/[/\\:\0]/g, ' ').trim().slice(0, 80) || 'Note'}.png`, png)) (step(2), toast('Saved as an image'))
      return
    }
    if (!(await window.api.copyPicture(png))) return refuse('Could not put the image on the clipboard', 'error')
    step(2)
    toast(blocks ? (blocks.length === 1 ? 'Copied the block as a picture' : `Copied ${num(blocks.length)} blocks as a picture`) : 'Copied the note as a picture')
  } catch (error) {
    refuse(`Could not make the image: ${(error as Error).message}`, 'error')
  }
}

/** A note's menu lines for its picture: the whole note, copied or saved. */
export const pictureItems = (document: string, name: string): { label: string; hint: string; can: () => boolean; run: () => void }[] => [
  { label: 'Copy as image', hint: 'The whole note as a picture, ready to paste', can: () => !!notePage(document), run: () => void sharePicture(notePage(document), null) },
  { label: 'Save as image…', hint: 'The whole note as a PNG file', can: () => !!notePage(document), run: () => void sharePicture(notePage(document), null, { save: true, name }) }
]
