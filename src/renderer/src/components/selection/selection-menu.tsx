import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { AllSelection, TextSelection, type EditorState } from '@tiptap/pm/state'
import { posToDOMRect } from '@tiptap/core'
import { EditorContext, useEditorState, type Editor } from '@tiptap/react'

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
function useFloat(editor: Editor | null) {
  const bar = useRef<HTMLDivElement>(null)
  const [tight, setTight] = useState(false)
  const full = useRef(0)
  const box = editor && !editor.isDestroyed ? (editor.view.dom.closest('.mindflow-editor-wrapper') as HTMLElement | null) : null
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
    return { clips, layer, scrolled, lastKey, later, pad }
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
    const host = (editor && !editor.isDestroyed ? editor.view.dom.closest('[role=dialog]') : null) ?? document.body
    if (held.layer.parentElement !== host) host.appendChild(held.layer)
    return held.layer
  }, [editor, held])
  useEffect(() => () => void held.layer.remove(), [held])
  // Any scroll that moves the words moves the bar with them.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom
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
  }, [editor, held])
  // A selection is offered the bar once it has lasted a moment with no key
  // since; ⌘A then ⌫ is gone before then, so the bar never flashes up.
  const shouldShow = useMemo<BubbleMenuProps['shouldShow']>(() => (props) => {
    if (!showFor(props)) return false
    const { editor: instance, state } = props
    if (!wholeNote(state)) return true
    const since = performance.now() - held.lastKey.at
    if (since >= SETTLE) return true
    clearTimeout(held.later.timer)
    held.later.timer = window.setTimeout(() => {
      if (instance.isDestroyed || !showFor({ ...props, state: instance.state })) return
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
  return { bar, tight, options, reference, appendTo, shouldShow }
}

/** How long a whole-note pick must last, with no key since, before the bar offers itself. */
const SETTLE = 180

// A node selection - an image, a rule, a card - is not text to format,
// and a code block takes no marks. ⌘A's pick of the whole note is words too.
const showFor = ({ editor: instance, state }: Parameters<NonNullable<BubbleMenuProps['shouldShow']>>[0]): boolean =>
  (state.selection instanceof TextSelection || (state.selection instanceof AllSelection && state.doc.textContent.trim().length > 0)) &&
  !state.selection.empty &&
  instance.isEditable &&
  !instance.isActive('codeBlock')

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
  children
}: {
  editor: Editor | null
  children: ReactNode
}) {
  const { bar, tight, options, reference, appendTo, shouldShow } = useFloat(editor)
  // Its controls are drawn only while words are selected. Mounted all along
  // they redrew on every key, and each redraw while typing made React measure
  // the caret through the whole note.
  const selecting = useEditorState({ editor, selector: ({ editor: instance }) => !!instance && !instance.state.selection.empty })
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
          variant="floating"
          // Silent on hover: it appears under the pointer whenever words are selected.
          data-silent=""
          // The accent on its own reads as a lit panel sitting on the page.
          // Mixed back towards the page it keeps the hue and loses the glare.
          style={{ background: "color-mix(in srgb, var(--accent) 55%, var(--background))" }}
        >
          {selecting && children}
        </Toolbar>
      </EditorContext.Provider>
    </BubbleMenu>
  )
}
