import type { EditorView } from '@tiptap/pm/view'
import { chime } from './sound'
import { slotTicker } from './proximity'
import { still } from './motion'
import { detent } from './haptics'

/**
 * A block carried by its grip, the way rows are carried in the sidebar
 * (sortable.tsx): it lifts into a card that stays under the pointer where it
 * was grabbed, the place it left is dimmed rather than tinted, a drop line
 * says where it will land, and each new place is a soft tick and a trackpad
 * tap. Esc, or letting go anywhere it cannot land, puts it back.
 *
 * The move itself is still the editor's own (the drag handle and the drop in
 * haligtree-editor.tsx). This only draws it: Chromium's drag picture (a faded
 * copy pinned by its top left corner) is swapped for an empty one, and the
 * card is ours.
 */

/** Nothing: Chromium's own picture of the drag, made invisible. */
const NOTHING = (() => {
  const img = new Image()
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  return img
})()

type Carry = {
  view: EditorView
  card: HTMLElement
  sources: HTMLElement[]
  /** Where the grab sits on the card, so the card never jumps to the pointer's corner. */
  dx: number
  dy: number
  home: DOMRect
  origin: { x: number; y: number }
  twin: HTMLElement
  x: number
  y: number
  landed: boolean
  ticks: ReturnType<typeof slotTicker>
  line: DOMRect | null
}

let carry: Carry | null = null

/** The editor a grip belongs to: it sits beside the page it drags in. */
function viewOf(handle: HTMLElement): EditorView | null {
  for (let at = handle.parentElement; at; at = at.parentElement) {
    const root = at.querySelector<HTMLElement & { editor?: { view: EditorView } }>('.ProseMirror')
    if (root) return root.editor?.view ?? null
  }
  return null
}

/** The outermost blocks the selection the grip just made covers. */
function blocksOf(view: EditorView): HTMLElement[] {
  const { from, to } = view.state.selection
  const found: HTMLElement[] = []
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (pos < from || pos + node.nodeSize > to) return true
    const dom = view.nodeDOM(pos)
    if (dom instanceof HTMLElement) found.push(dom)
    return false
  })
  return found
}

/** The drop line, as the editor last drew it: its place is the slot a tick is heard for. */
function lineOf(view: EditorView): HTMLElement | null {
  const home = view.dom.offsetParent ?? document.body
  // Beside a block (a column) when that one shows, else between blocks.
  return home.querySelector<HTMLElement>('.mf-column-drop') ?? home.querySelector<HTMLElement>('.prosemirror-dropcursor-block, .prosemirror-dropcursor-inline')
}

/** The drop line drawn again over the card, the same size, place and colour. */
function twinOf(line: HTMLElement | null, box: DOMRect | undefined): void {
  if (!carry) return
  const twin = carry.twin
  if (!line || !box?.width || !box.height) return void (twin.style.display = 'none')
  twin.style.display = ''
  twin.style.translate = `${box.left - carry.origin.x}px ${box.top - carry.origin.y}px`
  twin.style.width = `${box.width}px`
  twin.style.height = `${box.height}px`
  twin.style.background = getComputedStyle(line).backgroundColor
}

/**
 * Marks put on the page's own blocks without the editor reading them as an
 * edit: left to see them, it redraws the block and the mark is gone.
 */
function quietly(view: EditorView, change: () => void): void {
  const observer = (view as unknown as { domObserver?: { stop(): void; start(): void } }).domObserver
  observer?.stop()
  change()
  observer?.start()
}

/** Set as each position arrives, not on the next frame: a window out of sight draws no frames. */
function place(): void {
  if (!carry) return
  carry.card.style.translate = `${carry.x - carry.dx - carry.origin.x}px ${carry.y - carry.dy - carry.origin.y}px`
}

function lift(event: DragEvent): void {
  const handle = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('.tiptap-drag-handle')
  if (!handle || !event.dataTransfer) return
  const view = viewOf(handle)
  if (!view?.dragging) return
  const sources = blocksOf(view)
  if (!sources.length) return
  end(false)

  event.dataTransfer.setDragImage(NOTHING, 0, 0)
  const home = sources[0].getBoundingClientRect()
  const width = Math.max(...sources.map((one) => one.getBoundingClientRect().width))
  const card = document.createElement('div')
  card.className = 'mf-block-carried'
  card.dataset.lifted = ''
  // Its words keep the page's look: the card is drawn inside a copy of the editor's class.
  const page = document.createElement('div')
  page.className = view.dom.className
  page.removeAttribute('contenteditable')
  for (const one of sources) {
    const copy = one.cloneNode(true) as HTMLElement
    // Without the grip's selection: the card is the block as it reads, not as it is picked.
    for (const picked of [copy, ...copy.querySelectorAll('.ProseMirror-selectednode, .ProseMirror-selectednoderange')]) {
      picked.classList.remove('ProseMirror-selectednode', 'ProseMirror-selectednoderange')
    }
    copy.style.margin = '0'
    page.append(copy)
  }
  card.append(page)
  card.style.width = `${width + 24}px`
  // A wide block's card is cut at 20rem (its stylesheet), as every carried card is.
  // In the page's body, so no scroller's edge fades or cuts it; the drop line
  // is drawn again over it (`twin`), since the editor's own sits under it.
  document.body.append(card)
  // Where `fixed` counts from (an ancestor eased in would move it), so the card's place is the window's.
  const zero = card.getBoundingClientRect()
  const origin = { x: zero.left, y: zero.top }
  const twin = document.createElement('div')
  twin.className = 'mf-block-carried-line'
  twin.style.display = 'none'
  document.body.append(twin)
  card.classList.toggle('is-long', card.scrollHeight > card.clientHeight)

  // The grab stays where it was on the block: the card opens 12px and 8px out round it.
  const dx = event.clientX - home.left + 12
  const dy = event.clientY - home.top + 8
  carry = { view, card, sources, dx, dy, home, origin, twin, x: event.clientX, y: event.clientY, landed: false, ticks: slotTicker(), line: null }
  place()
  quietly(view, () => {
    for (const one of sources) one.dataset.carried = ''
    view.dom.dataset.carrying = ''
  })
  document.documentElement.dataset.dragging = ''
  // Lifts in the way every carried card in the app does (carry.tsx CarriedCard): from a touch smaller, fading in.
  if (!still()) card.animate([{ opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1 }], { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'backwards' })
  chime('lift')
  detent()
}

function follow(event: DragEvent): void {
  if (!carry) return
  // The last dragover outside the window says 0, 0: the card stays where it was seen.
  if (event.clientX === 0 && event.clientY === 0) return
  carry.x = event.clientX
  carry.y = event.clientY
  place()
  const line = lineOf(carry.view)
  const box = line?.getBoundingClientRect()
  if (box && box.width) carry.line = box
  twinOf(line, box)
  carry.ticks(box && box.width ? `${Math.round(box.left)}:${Math.round(box.top)}` : null)
}

function dropped(event: DragEvent): void {
  if (carry && carry.view.dom.contains(event.target as Node)) carry.landed = true
}

/** Lets go: onto the line it was shown (a move), or back where it came from (Esc, or nowhere to land). */
function end(sound = true): void {
  if (!carry) return
  const { card, sources, view, landed, line, home, origin, twin } = carry
  carry = null
  twin.remove()
  quietly(view, () => {
    for (const one of sources) delete one.dataset.carried
    delete view.dom.dataset.carrying
  })
  delete document.documentElement.dataset.dragging
  if (sound) {
    if (landed) chime('shift')
    else chime('stay')
  }
  if (!sound || still()) return card.remove()
  // Home again, or down onto the line it was dropped on, then gone: the block itself is already there.
  const [x, y] = card.style.translate.split(' ').map((n) => parseFloat(n))
  const to = landed ? { x, y: line ? line.top - 8 - origin.y : y } : { x: home.left - 12 - origin.x, y: home.top - 8 - origin.y }
  const settle = card.animate(
    [{ translate: `${x}px ${y}px`, opacity: 1 }, { translate: `${to.x}px ${to.y}px`, opacity: 0 }],
    { duration: landed ? 140 : 220, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }
  )
  settle.onfinish = () => card.remove()
  settle.oncancel = () => card.remove()
}

let installed = false
/** Once for the whole page: every editor's grip is carried the same way. */
export function installBlockCarry(): void {
  if (installed) return
  installed = true
  // Bubbling, so it runs after the grip's own dragstart has picked the blocks.
  document.addEventListener('dragstart', lift)
  // Both: the block's own `drag` comes with each move of the pointer, and
  // `dragover` keeps coming while it is held still.
  document.addEventListener('drag', follow)
  document.addEventListener('dragover', follow)
  document.addEventListener('drop', dropped, true)
  document.addEventListener('dragend', () => end())
}
