import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { AllSelection, TextSelection, type EditorState } from '@tiptap/pm/state'
import { posToDOMRect } from '@tiptap/core'
import { EditorContext, useEditorState, type Editor } from '@tiptap/react'
import { domOf, useEditorDom } from '@/lib/editor-dom'
import { grownByKey } from '@/lib/grow-selection'

import { Toolbar } from '@/components/tiptap-ui-primitive/toolbar'

/** Room kept between the bar and the words, and between the bar and the edge of what is in sight. */
const GAP = 8
const EDGE = 8

/**
 * Every ancestor of the words that scrolls, and has more than it shows:
 * together with the window, they
 * say which part of the note is in sight. Filled in afresh before each
 * placing, into the same array the placing reads.
 */
function scrollers(dom: HTMLElement, into: HTMLElement[]): HTMLElement[] {
  into.length = 0
  for (let el = dom.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const style = getComputedStyle(el)
    const more = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
    if (more && /(auto|scroll)/.test(style.overflowY + style.overflowX)) into.push(el)
  }
  // Quick capture's drawn frame is all of it there is to see: the window is
  // cut to it (one line tall as the pill), whatever size the page thinks it is.
  const frame = dom.closest<HTMLElement>('.app-container')
  if (frame) into.push(frame)
  return into
}

/**
 * How far down the window's drag strips reach above these words. A strip is an
 * OS-level drag handle: a click over it moves the window whatever is drawn on
 * top, so the bar is kept off it and goes below the words instead.
 */
function stripFoot(left: number, right: number): number {
  let foot = 0
  for (const strip of document.querySelectorAll<HTMLElement>('[data-drag-strip]')) {
    const box = strip.getBoundingClientRect()
    if (box.top <= 1 && box.height > 0 && box.left < right && box.right > left) foot = Math.max(foot, box.bottom)
  }
  return foot
}

function inSight(clips: HTMLElement[]): { top: number; bottom: number; left: number; right: number } {
  let view = { top: 0, left: 0, bottom: innerHeight, right: innerWidth }
  for (const el of clips) {
    const box = el.getBoundingClientRect()
    view = { top: Math.max(view.top, box.top), left: Math.max(view.left, box.left), bottom: Math.min(view.bottom, box.bottom), right: Math.min(view.right, box.right) }
  }
  return view
}

/**
 * Whether a format bar is up anywhere in this window: while it is, nothing
 * else floats (the count of words picked, a tip), so there is one floating
 * thing at a time and none of it over the words.
 */
const barUp = { count: 0, listeners: new Set<() => void>() }
const tellBar = (by: number): void => {
  barUp.count = Math.max(0, barUp.count + by)
  for (const listener of barUp.listeners) listener()
}
export const formatBarShown = (): boolean => barUp.count > 0
export const useFormatBarShown = (): boolean =>
  useSyncExternalStore((listener) => (barUp.listeners.add(listener), () => void barUp.listeners.delete(listener)), formatBarShown)

/**
 * Whether the bar fits clear of the picked words, above or below them, inside
 * what is in sight. Where it does not (quick capture's one-line pill, a pick
 * that fills the whole box) it does not show: it would sit on the words being
 * picked. ⌘B, ⌘I and the right-click menu still format them.
 */
function roomFor(editor: Editor, held: { clips: HTMLElement[] }, tall: number): boolean {
  const { view, state } = editor
  const seen = inSight(scrollers(view.dom, held.clips))
  const words = posToDOMRect(view, state.selection.from, state.selection.to)
  seen.top = Math.max(seen.top, stripFoot(words.left, words.right))
  const need = tall + GAP + EDGE
  return words.top - seen.top >= need || seen.bottom - words.bottom >= need
}
/** The floating bar's height, before it has ever been drawn. */
const BAR_TALL = 40

/** True while the whole note is picked, as ⌘A picks it. */
const wholeNote = (state: EditorState): boolean =>
  state.selection instanceof AllSelection || (state.selection.from <= 1 && state.selection.to >= state.doc.content.size - 1)

/**
 * The bar floats on a layer of its own at the top of the window (or of the
 * dialog the note is in), placed by the window's own coordinates. Inside the
 * note's scroll it was clipped by that scroll, by the box's frame and by the
 * fade at the foot, and a pick taller than the note put it above the top,
 * out of sight. Here it goes above the words in sight, else below them, else
 * (the whole of what is in sight is picked) inside the top of it; it moves
 * with the words as they scroll and goes when they scroll out of sight.
 *
 * When the editor's own box is narrower than the bar (a large interface size
 * in a small window) its buttons drop their words and keep their icons.
 */
function useFloat(editor: Editor | null, reading = false, code = false) {
  const readingNow = useRef(reading)
  readingNow.current = reading
  const codeNow = useRef(code)
  codeNow.current = code
  const bar = useRef<HTMLDivElement>(null)
  const [tight, setTight] = useState(false)
  const full = useRef(0)
  // The editor's words once they are on the page (lib/editor-dom.ts): tiptap's view.dom throws before.
  const page = useEditorDom(editor ?? null)
  const box = page?.closest('.haligtree-editor-wrapper') as HTMLElement | null ?? null
  // Held for the editor's life: a new object each render would make the menu
  // reconfigure its plugin on every keystroke.
  const [held] = useState(() => {
    const clips: HTMLElement[] = []
    const layer = document.createElement('div')
    layer.setAttribute('data-selection-layer', '')
    const scrolled = new EventTarget()
    // Read by the placing on every update, and set afresh just before it: the
    // room kept at the top grows to clear a drag strip.
    const pad = { top: EDGE, bottom: EDGE, left: EDGE, right: EDGE }
    const lastKey = { at: 0 }
    const later = { timer: 0 }
    return { clips, layer, scrolled, lastKey, later, pad, up: false }
  })
  const options = useMemo(() => {
    return {
      strategy: 'fixed' as const,
      placement: 'top' as const,
      // The gap is in the words' own box, so nothing is moved after the bar is
      // kept in sight.
      offset: false,
      // With no room either side (everything in sight is picked), it keeps to
      // the top, where the eye starts.
      flip: { boundary: held.clips, padding: held.pad, fallbackStrategy: 'initialPlacement' as const },
      shift: { boundary: held.clips, padding: held.pad, crossAxis: true },
      hide: { strategy: 'referenceHidden' as const, boundary: held.clips },
      scrollTarget: held.scrolled as unknown as HTMLElement,
      onShow: () => held.up || ((held.up = true), tellBar(1)),
      onHide: () => held.up && ((held.up = false), tellBar(-1)),
    }
  }, [held])
  const reference = useMemo(() => () => {
    if (!editor || editor.isDestroyed) return null
    const { view, state } = editor
    const clips = scrollers(view.dom, held.clips)
    const seen = inSight(clips)
    const words = posToDOMRect(view, state.selection.from, state.selection.to)
    const strip = stripFoot(words.left, words.right)
    held.pad.top = Math.max(EDGE, strip + EDGE / 2 - seen.top)
    seen.top = Math.max(seen.top, strip)
    const top = Math.max(words.top - GAP, seen.top)
    const bottom = Math.min(words.bottom + GAP, seen.bottom)
    // Out of sight altogether: the true place, which the hide step then hides.
    const rect = bottom > top ? new DOMRect(words.left, top, words.width, bottom - top) : words
    return { getBoundingClientRect: () => rect, getClientRects: () => [rect] }
  }, [editor, held])
  const appendTo = useMemo(() => () => {
    const host = domOf(editor)?.closest('[role=dialog]') ?? document.body
    if (held.layer.parentElement !== host) host.appendChild(held.layer)
    return held.layer
  }, [editor, held])
  useEffect(() => () => {
    held.layer.remove()
    if (held.up) (held.up = false, tellBar(-1))
  }, [held])
  // Any scroll that moves the words moves the bar with them.
  useEffect(() => {
    const dom = page
    if (!dom) return
    const moved = (event: Event): void => {
      const target = event.target
      if (target === document || (target instanceof Node && target.contains(dom))) held.scrolled.dispatchEvent(new Event('scroll'))
    }
    const keyed = (): void => void (held.lastKey.at = performance.now())
    document.addEventListener('scroll', moved, { capture: true, passive: true })
    dom.addEventListener('keydown', keyed, true)
    return () => {
      document.removeEventListener('scroll', moved, { capture: true })
      dom.removeEventListener('keydown', keyed, true)
      clearTimeout(held.later.timer)
    }
  }, [page, held])
  // A selection ⌘A picked (a step of it, or the whole note) is offered the bar
  // once it has lasted a moment with no key since; ⌘A then ⌫ is gone before
  // then, and so is the step before the next ⌘A, so the bar never flashes up.
  const shouldShow = useMemo<BubbleMenuProps['shouldShow']>(() => (props) => {
    // Its timers can outlive the editor (a note closed or redrawn while the bar was waiting to show).
    if (props.editor.isDestroyed) return false
    const { editor: instance, state } = props
    // A whole-note pick, or a step ⌘A grew, waits before anything of the note or the page is read for it: ⌘A then
    // ⌫ in a long note read every word of it and laid the page out, for a bar that never showed.
    const since = performance.now() - held.lastKey.at
    const waiting = (wholeNote(state) || grownByKey(state.selection)) && since < SETTLE
    if (!waiting) return showFor(props, readingNow.current, codeNow.current) && roomFor(props.editor, held, bar.current?.offsetHeight || BAR_TALL)
    clearTimeout(held.later.timer)
    held.later.timer = window.setTimeout(() => {
      if (instance.isDestroyed || !showFor({ ...props, state: instance.state }, readingNow.current, codeNow.current) || !roomFor(instance, held, bar.current?.offsetHeight || BAR_TALL)) return
      if (performance.now() - held.lastKey.at < SETTLE) return
      instance.view.dispatch(instance.state.tr.setMeta('selectionMenu', 'show'))
      instance.view.dispatch(instance.state.tr.setMeta('selectionMenu', 'updatePosition'))
    }, SETTLE - since + 10)
    return false
  }, [held])
  useEffect(() => {
    const el = bar.current
    if (!el || !box) return
    const check = (): void => {
      // Measured with the words showing, so dropping them never makes it think it fits again.
      if (!el.hasAttribute('data-tight')) full.current = el.scrollWidth
      if (full.current) setTight(full.current > box.clientWidth - 2 * EDGE)
    }
    const watch = new ResizeObserver(check)
    watch.observe(el)
    watch.observe(box)
    return () => watch.disconnect()
  }, [box])
  // Dropping its words makes the bar narrower than when it was placed: placed
  // again, it centres over the pick instead of keeping the wide bar's left edge,
  // which hung it off to the left, over the sidebar.
  const wasTight = useRef(tight)
  useEffect(() => {
    if (wasTight.current === tight || !editor || editor.isDestroyed) return
    wasTight.current = tight
    editor.view.dispatch(editor.state.tr.setMeta('selectionMenu', 'updatePosition'))
  }, [editor, tight])
  return { bar, tight, options, reference, appendTo, shouldShow, up: () => held.up }
}

/** How long a whole-note pick must last, with no key since, before the bar offers itself. */
const SETTLE = 180

// A node selection - an image, a rule, a card - is not text to format,
// and a code block takes no marks: there it shows only what it holds for
// code (`code`), or nothing. ⌘A's pick of the whole note is words too.
// Locked for reading (`reading`), words can still be picked to keep.
const showFor = ({ editor: instance, state }: Parameters<NonNullable<BubbleMenuProps['shouldShow']>>[0], reading = false, code = false): boolean =>
  (state.selection instanceof TextSelection || (state.selection instanceof AllSelection && hasWords(state))) &&
  !state.selection.empty &&
  (instance.isEditable || reading) &&
  (code || !allCode(instance))

/** Whether the note has a word in it: looked for until the first. */
function hasWords(state: EditorState): boolean {
  let found = false
  state.doc.descendants((node) => (found ? false : void (found = node.isText && !!node.text?.trim())))
  return found
}

/**
 * Whether all that is picked is code, as `isActive('codeBlock')` says, without walking each block of a long note
 * for a pick that starts outside code (⌘A of a note that is not all code).
 */
function allCode(instance: Editor): boolean {
  const { selection, doc } = instance.state
  if (selection instanceof AllSelection) {
    let all = doc.childCount > 0
    doc.forEach((block) => void (all &&= block.type.name === 'codeBlock'))
    return all
  }
  return selection.$from.parent.type.name === 'codeBlock' && instance.isActive('codeBlock')
}

/**
 * The toolbar again, at the selection.
 *
 * Which controls it holds is the caller's business - a document wants the lot,
 * a title wants three marks - so they come in as children. That also stops a
 * title field importing the whole document toolbar in order to render none of
 * it.
 *
 * The context provider is what makes those children work: every `tiptap-ui`
 * control resolves its editor from `EditorContext`, and this menu gets rendered
 * outside any provider - the title editor has none at all - so it supplies its
 * own rather than inheriting whoever happens to be above it.
 */
export function SelectionMenu({
  editor,
  children,
  inCode,
  reading = false
}: {
  editor: Editor | null
  children: ReactNode
  /** What it holds for words picked inside a code block, where nothing else applies; left out, it does not show there. */
  inCode?: ReactNode
  /** Shown on a note locked for reading too: only keeping actions come in. */
  reading?: boolean
}) {
  const { bar, tight, options, reference, appendTo, shouldShow, up } = useFloat(editor, reading, !!inCode)
  // Its controls are drawn only while words are selected. Mounted all along
  // they redrew on every key, and each redraw while typing made React measure
  // the caret through the whole note.
  // A whole-note pick's only once the bar is up: drawn at once, each control asked whether its mark covered all of a
  // long note (⌘A then ⌫ walked the whole note some twenty times over, for a bar that never showed).
  const selecting = useEditorState({ editor, selector: ({ editor: instance }) => !!instance && !instance.state.selection.empty && (!wholeNote(instance.state) || up()) })
  const coding = useEditorState({ editor, selector: ({ editor: instance }) => !!instance && !instance.state.selection.empty && allCode(instance) })
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      // The table menu is a bubble too, and they would share the default key.
      pluginKey="selectionMenu"
      // Inline rather than a class: the title variant does not import the
      // editor's stylesheet, and this is the menu's only styling.
      style={{ zIndex: 40 }}
      options={options}
      appendTo={appendTo}
      getReferencedVirtualElement={reference}
      resizeDelay={0}
      shouldShow={shouldShow}
    >
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={bar}
          data-tight={tight || undefined}
          data-selection-bar=""
          variant="floating"
          // Silent on hover: it appears under the pointer whenever words are selected.
          data-silent=""
          // The accent on its own reads as a lit panel sitting on the page.
          // Mixed back towards the page it keeps the hue and loses the glare.
          style={{ background: "color-mix(in srgb, var(--accent) 55%, var(--background))" }}
        >
          {selecting && (coding ? inCode : children)}
        </Toolbar>
      </EditorContext.Provider>
    </BubbleMenu>
  )
}
