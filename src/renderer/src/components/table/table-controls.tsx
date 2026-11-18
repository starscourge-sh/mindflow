import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { TextSelection } from '@tiptap/pm/state'
import { useEditorState, type Editor } from '@tiptap/react'

import { grow, moveColumn, moveRow } from '@/lib/table'
import { useEditorDom } from '@/lib/editor-dom'
import { still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { slotTicker } from '@/lib/proximity'
import { DropLine } from '@/components/haligtree/carry'
import '@/lib/carry-cursor'

/** Where each row and column sits, relative to the editor's own box. */
interface Geometry {
  top: number
  left: number
  width: number
  height: number
  /**
   * The part of the table in sight, left and right: a wide table scrolled
   * sideways inside its wrapper runs past both edges. The grips, the bars and
   * the pointer's reach keep to it, so a row's grip stays at the edge where the
   * rows are seen and never slides out over the block handle.
   */
  seen: { left: number; right: number }
  rows: { top: number; height: number }[]
  columns: { left: number; width: number; col: number }[]
}

/** The table the caret is in, as drawn. */
function caretTable(editor: Editor): HTMLTableElement | null {
  const { state, view } = editor
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== 'table') continue
    return (view.nodeDOM($from.before(depth)) as HTMLElement | null)?.querySelector('table') ?? null
  }
  return null
}

/**
 * Put the caret in a cell of the table being pointed at, so the commands that
 * act on "the table the selection is in" act on this one. A cell is named by
 * its row and column; -1 means the last.
 */
function enter(editor: Editor, table: HTMLTableElement, row: number, column: number): void {
  if (caretTable(editor) === table) return
  const tr = table.rows[row < 0 ? table.rows.length - 1 : row]
  const cell = tr?.cells[column < 0 ? tr.cells.length - 1 : column]
  if (!cell) return
  const { view } = editor
  const at = view.state.doc.resolve(view.posAtDOM(cell, 0))
  view.dispatch(view.state.tr.setSelection(TextSelection.near(at)))
}

/**
 * Measure the table being pointed at, or else the one the caret is in.
 *
 * The grips are an overlay rather than markup inside the table: a `<tr>` may
 * only contain cells, so there is nowhere in the table itself to hang them.
 */
function measure(editor: Editor, pointed: HTMLTableElement | null): Geometry | null {
  const { view } = editor
  const table = pointed?.isConnected ? pointed : caretTable(editor)
  // The overlay is positioned against the editor's own container.
  // Everything below is in the scroller's own coordinates, not the window's.
  // The overlay is positioned inside that scroller and scrolls with it, so a
  // measurement taken against the window drifts by exactly how far down the
  // document is: the grips ended up near the top of the note, far from the
  // table they belong to.
  const host = view.dom.parentElement
  const origin = host?.getBoundingClientRect()
  if (!table || !host || !origin) return null
  const [downBy, acrossBy] = [host.scrollTop, host.scrollLeft]

  const box = table.getBoundingClientRect()
  const rows = [...table.rows].map((row) => {
    const rect = row.getBoundingClientRect()
    return { top: rect.top - origin.top + downBy, height: rect.height }
  })
  // A colspan fills several map columns with the same cell, so the map index
  // has to be carried rather than inferred from the DOM position.
  let col = 0
  const columns = [...(table.rows[0]?.cells ?? [])].map((cell) => {
    const rect = cell.getBoundingClientRect()
    const entry = { left: rect.left - origin.left + acrossBy, width: rect.width, col }
    col += cell.colSpan
    return entry
  })

  const wrapper = table.closest('.tableWrapper')
  const port = wrapper?.getBoundingClientRect()
  const pad = wrapper ? getComputedStyle(wrapper) : null
  const seenLeft = port && pad ? Math.max(box.left, port.left + wrapper!.clientLeft + parseFloat(pad.paddingLeft)) : box.left
  const seenRight = port && pad ? Math.min(box.right, port.left + wrapper!.clientLeft + wrapper!.clientWidth - parseFloat(pad.paddingRight)) : box.right

  return {
    top: box.top - origin.top + downBy,
    left: box.left - origin.left + acrossBy,
    seen: { left: seenLeft - origin.left + acrossBy, right: Math.max(seenLeft, seenRight) - origin.left + acrossBy },
    width: box.width,
    height: box.height,
    rows,
    columns
  }
}

/**
 * A row or column held by its grip: drawn indices, where it began (`base`,
 * `size`), where the pointer took it (`grab`, from its start edge), and where
 * the pointer is now (`at`), all along the axis it moves on.
 */
interface Drag {
  axis: 'row' | 'column'
  from: number
  to: number
  base: number
  size: number
  grab: number
  start: number
  at: number
  lifted: boolean
}

/**
 * A copy of one row or column as its own small table, to carry under the
 * pointer. Built from the drawn cells, so it looks exactly like what was
 * picked up; styled by the same rules as the table (haligtree-editor.scss).
 */
function carry(table: HTMLTableElement, axis: 'row' | 'column', index: number): HTMLElement {
  const copy = document.createElement('table')
  const look = getComputedStyle(table)
  // In the words' own face and size: the note sets its reading face on its lines, not on the table, so the copy in
  // the hand came in the system's face, smaller than the row it was taken from.
  copy.style.font = getComputedStyle(table.querySelector('td p') ?? table.querySelector('th p') ?? table).font
  copy.style.color = look.color
  const body = document.createElement('tbody')
  if (axis === 'row') {
    const row = table.rows[index]
    // Each column as wide as it is drawn: the table's own column list has no widths until one is
    // dragged, and without them the copy spaced its columns its own way, off the table's.
    if (row) {
      const cols = document.createElement('colgroup')
      for (const cell of row.cells) {
        for (let at = 0; at < cell.colSpan; at++) {
          const col = document.createElement('col')
          col.style.width = `${cell.getBoundingClientRect().width / cell.colSpan}px`
          cols.append(col)
        }
      }
      copy.append(cols)
      copy.style.width = `${row.getBoundingClientRect().width}px`
      body.append(row.cloneNode(true))
    }
  } else {
    for (const row of table.rows) {
      const line = document.createElement('tr')
      line.style.height = `${row.getBoundingClientRect().height}px`
      const cell = row.cells[index]
      if (cell) line.append(cell.cloneNode(true))
      body.append(line)
    }
  }
  copy.append(body)
  // The picked wash and the resize line belong to the table, not the copy.
  copy.querySelectorAll('.selectedCell').forEach((cell) => cell.classList.remove('selectedCell'))
  copy.querySelectorAll('.column-resize-handle').forEach((handle) => handle.remove())
  return copy
}

/**
 * The lifted copy: follows the pointer one to one while held, then glides to
 * where it landed and goes. Its own element, never one inside the editor.
 */
function Carried({
  copy,
  gliding,
  style,
  onLanded
}: {
  copy: HTMLElement | null
  gliding: boolean
  style: React.CSSProperties
  onLanded: () => void
}): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const at = holder.current
    if (!at || !copy) return
    at.replaceChildren(copy)
  }, [copy])
  return (
    <div
      ref={holder}
      className="tiptap-table-carried"
      data-gliding={gliding || undefined}
      style={style}
      onTransitionEnd={(event) => event.propertyName === 'transform' && gliding && onLanded()}
    />
  )
}

/** Which row and column the pointer is over, or null when it has left. */
type Hover = { row: number; column: number } | null

/** The grips sit outside the table, so the pointer counts as near a little early. */
const MARGIN = 24

/**
 * How long the grips and "+" bars stay once the pointer has left the table and
 * its margin: long enough to travel out to one of them on a slant, or to
 * overshoot it a little, before they go. Back in time, they never left.
 */
export const TABLE_GRACE_MS = 350

/**
 * One row grip and one column grip, following the pointer.
 *
 * One of each rather than one per row and column: a table of ten columns does
 * not want ten handles standing over it, and the only one that matters is the
 * one being pointed at. Taking hold of a grip selects that row or column, which
 * is what the table menu then acts on, and dragging it moves it.
 */
export function TableControls({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  // The table under the pointer, so its edges answer before anyone clicks in
  // it: the "+" bars and grips show on hover, as Notion's do, with the caret
  // anywhere in the note. Null leaves them to the table the caret is in.
  const [pointed, setPointed] = useState<HTMLTableElement | null>(null)
  // Where the pointer last was, so a table measured after the pointer arrived
  // shows its grips at once rather than at the next move.
  const pointer = useRef<{ clientX: number; clientY: number } | null>(null)

  // Re-measure on any transaction while in a table: typing in a cell resizes
  // it. Elsewhere once, on the way out: redrawing on every key typed outside
  // a table cost a long note a measure of the whole page each time.
  const version = useEditorState({
    editor,
    selector: ({ editor: instance, transactionNumber }) => {
      const $from = instance?.state.selection.$from
      if (!$from) return -1
      for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type.name === 'table') return transactionNumber
      return -1
    }
  })

  useLayoutEffect(() => {
    if (!editor) return
    // The DOM has not been laid out yet on the transaction that changed it.
    const id = requestAnimationFrame(() => setGeometry(measure(editor, pointed)))
    return () => cancelAnimationFrame(id)
  }, [editor, version, pointed])

  // A wide table scrolls inside its own wrapper, which fires no transaction -
  // without this the grips stay put while the columns slide under them. Every
  // table has its own wrapper, so this listens at the root in the capture phase
  // rather than picking one: scroll does not bubble.
  // The editor's words once on the page: tiptap's view.dom throws before (lib/editor-dom.ts).
  const page = useEditorDom(editor ?? null)
  useEffect(() => {
    if (!editor) return
    const dom = page
    if (!dom) return
    const onScroll = (): void => setGeometry(measure(editor, pointed))
    dom.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => dom.removeEventListener('scroll', onScroll, { capture: true })
  }, [page, editor, pointed])

  /** Select a whole row or column by its index. */
  const select = useCallback(
    (axis: 'row' | 'column', index: number) => {
      if (!editor) return
      const { state } = editor
      const { $from } = state.selection

      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type.name !== 'table') continue

        const start = $from.before(depth) + 1
        const map = TableMap.get(node)
        const cell = axis === 'row' ? map.map[index * map.width] : map.map[index]

        const $cell = state.doc.resolve(start + cell)
        const selection =
          axis === 'row' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell)

        // No scrollIntoView. A column selection ends at the bottom of the
        // table, so asking for it to be shown scrolled the page down to there,
        // away from the grip that was just pressed.
        editor.view.dispatch(state.tr.setSelection(selection))
        editor.view.focus()
        return
      }
    },
    [editor]
  )

  // Which row and column the pointer is over. Measured against the same box the
  // geometry was, so the two agree.
  const [hover, setHover] = useState<Hover>(null)
  const host = page?.parentElement ?? null

  // Leaving is not gone at once: the controls fade over the grace and only then
  // let go, so the pointer can still reach them (TABLE_GRACE_MS). Shown at once
  // on the way back in.
  const [leaving, setLeaving] = useState(false)
  const graceTimer = useRef(0)
  const shown = useRef(false)
  shown.current = hover !== null || pointed !== null
  const stay = useCallback((): void => {
    if (!graceTimer.current) return
    clearTimeout(graceTimer.current)
    graceTimer.current = 0
    setLeaving(false)
  }, [])
  const letGo = useCallback((): void => {
    if (graceTimer.current || !shown.current) return
    setLeaving(true)
    graceTimer.current = window.setTimeout(() => {
      graceTimer.current = 0
      setLeaving(false)
      setPointed(null)
      setHover(null)
    }, TABLE_GRACE_MS)
  }, [])
  useEffect(() => () => clearTimeout(graceTimer.current), [])

  // Which table the pointer is over. Kept while the pointer goes out to the
  // grips and bars, which sit outside the table; let go once it is clear of
  // them (below). A table in a note shown inside this one belongs to that
  // note's own editor, so only this page's tables count.
  useEffect(() => {
    if (!host || !page) return
    const onMove = (event: MouseEvent): void => {
      pointer.current = { clientX: event.clientX, clientY: event.clientY }
      const table = (event.target as Element | null)?.closest?.('.tableWrapper')?.querySelector('table') ?? null
      if (table && table.closest('.ProseMirror') === page) setPointed((was) => (was === table ? was : table))
    }
    const onLeave = (): void => {
      pointer.current = null
      letGo()
    }
    host.addEventListener('mousemove', onMove)
    host.addEventListener('mouseleave', onLeave)
    return () => {
      host.removeEventListener('mousemove', onMove)
      host.removeEventListener('mouseleave', onLeave)
    }
  }, [host, page, letGo])

  useEffect(() => {
    if (!host || !geometry) return

    const onMove = (event: { clientX: number; clientY: number }): void => {
      const origin = host.getBoundingClientRect()
      const x = event.clientX - origin.left + host.scrollLeft
      const y = event.clientY - origin.top + host.scrollTop
      const near =
        x >= geometry.seen.left - MARGIN &&
        x <= geometry.seen.right + MARGIN &&
        y >= geometry.top - MARGIN &&
        y <= geometry.top + geometry.height + MARGIN
      if (!near) return letGo()
      stay()

      // Past the last edge means the margin outside the table, which is where
      // the grips themselves sit, so that counts as the last row or column.
      const pick = (edges: number[], at: number): number => {
        const index = edges.findIndex((edge) => at < edge)
        return index < 0 ? edges.length - 1 : index
      }
      setHover({
        column: pick(
          geometry.columns.map((c) => c.left + c.width),
          x
        ),
        row: pick(
          geometry.rows.map((r) => r.top + r.height),
          y
        )
      })
    }
    const onLeave = (): void => letGo()

    if (pointer.current) onMove(pointer.current)
    host.addEventListener('mousemove', onMove)
    host.addEventListener('mouseleave', onLeave)
    return () => {
      host.removeEventListener('mousemove', onMove)
      host.removeEventListener('mouseleave', onLeave)
    }
  }, [host, geometry, letGo, stay])

  /** Which row or column the pointer is over, or -1 when it is outside. */
  const indexAt = useCallback(
    (axis: 'row' | 'column', event: React.PointerEvent): number => {
      if (!geometry || !host) return -1
      const origin = host.getBoundingClientRect()
      const x = event.clientX - origin.left + host.scrollLeft
      const y = event.clientY - origin.top + host.scrollTop
      return axis === 'column'
        ? geometry.columns.findIndex((c) => x >= c.left && x < c.left + c.width)
        : geometry.rows.findIndex((r) => y >= r.top && y < r.top + r.height)
    },
    [geometry, host]
  )

  /**
   * The grip being held, where it started and where it would land.
   *
   * Only set while the pointer is down, so the extra renders stop the moment
   * the drag does. Holding the start here rather than reading it back from the
   * selection is what lets a press stay undecided: a click picks the row or
   * column, a drag moves it, and only the click leaves a selection for the menu
   * to attach to. Selecting on the way down opened the menu over the very table
   * being dragged.
   */
  const [drag, setDrag] = useState<Drag | null>(null)
  // The same, read and written at once by the handlers: two moves inside one
  // frame both saw the state from before either, and lifted twice.
  const held = useRef<Drag | null>(null)
  // A tick at each new place it would land, as every carry in the app has (carry.tsx).
  const ticks = useRef(slotTicker()).current
  const hold = (next: Drag | null): void => {
    held.current = next
    setDrag(next)
  }
  // The lifted copy of the row or column, built once as it is picked up: the
  // table under it changes on the drop, and the copy settles in after that.
  const lifted = useRef<HTMLElement | null>(null)
  // Where the copy is gliding to once let go; cleared when it has arrived.
  const [settle, setSettle] = useState<{ axis: 'row' | 'column'; base: number; size: number; to: number } | null>(null)

  // Lifted, the page is carrying, as with every carry (carry.tsx): the block's grip and hover lights stand down.
  const inHand = !!drag?.lifted
  useEffect(() => {
    if (!inHand) return
    document.documentElement.dataset.dragging = ''
    return () => void delete document.documentElement.dataset.dragging
  }, [inHand])

  // Esc puts it back where it was, as every drag in the app does. Caught
  // before the editor and the window: Esc there would close the note too.
  useEffect(() => {
    if (!drag) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      const was = held.current
      hold(null)
      if (!was?.lifted) return
      chime('stay')
      land(was, was.base)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // `land` reads only its arguments and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  /** The copy glides from where it was let go to `to`, then goes; with motion off it goes at once. */
  function land(was: Drag, to: number): void {
    if (still() || Math.abs(was.at - was.grab - to) < 0.5) return setSettle(null)
    setSettle({ axis: was.axis, base: was.base, size: was.size, to })
  }

  // How far the add bar has been dragged, and how many rows or columns that
  // has already put on the table. Refs, not state: the table itself is the
  // thing that changes, and re-rendering per step would fight the pointer.
  const from = useRef(0)
  const added = useRef(0)

  // The overlay has to live in the same box its coordinates were measured
  // against, or it drifts as soon as the document scrolls. That box is the
  // editor's own container - positioned, and inside the scroller rather than
  // being it.
  // Kept while a row or column is carried or settling, wherever the pointer is.
  if (!editor || !geometry || !host || (!hover && !drag && !settle)) return null

  const column = hover ? geometry.columns[hover.column] : undefined
  const row = hover ? geometry.rows[hover.row] : undefined

  /** The pointer along the axis being dragged, in the overlay's own coordinates. */
  const along = (axis: 'row' | 'column', event: { clientX: number; clientY: number }): number => {
    const origin = host.getBoundingClientRect()
    return axis === 'row' ? event.clientY - origin.top + host.scrollTop : event.clientX - origin.left + host.scrollLeft
  }

  /** Both grips behave the same way; only the axis and the placing differ. */
  const grip = (
    axis: 'row' | 'column',
    index: number,
    style: React.CSSProperties
  ): React.JSX.Element => (
    <button
      type="button"
      className={`tiptap-table-grip is-${axis}`}
      tabIndex={-1}
      aria-label={`Select or move this ${axis}`}
      style={style}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        const table = pointed ?? caretTable(editor)
        if (table && hover) enter(editor, table, axis === 'row' ? hover.row : 0, axis === 'row' ? 0 : hover.column)
        // `index` is the map column for a column; the drag counts drawn ones.
        const drawn = axis === 'row' ? index : (hover?.column ?? 0)
        const slot = axis === 'row' ? geometry.rows[drawn] : geometry.columns[drawn]
        if (!slot) return
        const base = 'top' in slot ? slot.top : slot.left
        const size = 'height' in slot ? slot.height : slot.width
        const at = along(axis, event)
        lifted.current = table ? carry(table, axis, drawn) : null
        setSettle(null)
        hold({ axis, from: drawn, to: drawn, base, size, grab: at - base, start: at, at, lifted: false })
      }}
      onPointerMove={(event) => {
        // Capture means every move lands here until the button is released,
        // so this is also how we know a drag is under way.
        const was = held.current
        if (!was || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        const at = along(axis, event)
        // Past 6px it is a drag, not a click: the row or column lifts.
        const lift = was.lifted || Math.abs(at - was.start) > 6
        if (lift && !was.lifted) (chime('lift'), ticks.start(was.from))
        const to = indexAt(axis, event)
        if (lift && to >= 0) ticks(to)
        hold({ ...was, at, lifted: lift, to: to >= 0 ? to : was.to })
      }}
      onPointerUp={() => {
        const was = held.current
        hold(null)
        if (!was || !editor) return
        const pick = (at: number): number =>
          axis === 'column' ? (geometry.columns[at]?.col ?? at) : at
        if (!was.lifted) return select(axis, pick(was.from))
        const slots = axis === 'row' ? geometry.rows.map((r) => [r.top, r.height]) : geometry.columns.map((c) => [c.left, c.width])
        const moved =
          was.from !== was.to &&
          (axis === 'column' ? moveColumn(editor, pick(was.from), pick(was.to)) : moveRow(editor, was.from, was.to))
        chime(moved ? 'shift' : 'stay')
        // Where it comes to rest: the far side of the one it passed when going
        // forwards, the near side going back, or home when it did not move.
        const [start, length] = slots[was.to] ?? [was.base, was.size]
        land(was, !moved ? was.base : was.to > was.from ? start + length - was.size : start)
      }}
    />
  )

  /**
   * The `+` bars along the bottom and right edges.
   *
   * Click adds one; drag adds or takes away as many as the pointer passes,
   * which is the only way to take several off at once. The table changes as
   * you drag rather than on release, so you are choosing against the real
   * thing instead of against a preview of it.
   */
  const bar = (axis: 'row' | 'column', style: React.CSSProperties): React.JSX.Element => (
    <button
      type="button"
      className={`tiptap-table-add is-${axis}`}
      tabIndex={-1}
      aria-label={`Add a ${axis}. Drag to add or remove ${axis}s.`}
      style={style}
      onPointerDown={(event) => {
        // Keeps the caret in the table: without focus there is no table to
        // measure, and the bars would vanish under the pointer.
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const table = pointed ?? caretTable(editor)
        if (table) enter(editor, table, -1, -1)
        from.current = axis === 'row' ? event.clientY : event.clientX
        added.current = 0
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const step = axis === 'row' ? (row?.height ?? 24) : (column?.width ?? 96)
        const at = axis === 'row' ? event.clientY : event.clientX
        const want = Math.round((at - from.current) / step)

        // `grow` refuses to take the last one, which also ends the loop.
        while (added.current < want && grow(editor, axis, true)) added.current += 1
        while (added.current > want && grow(editor, axis, false)) added.current -= 1
      }}
      onPointerUp={() => {
        // One cue for the whole gesture: added for a click or rows dragged on,
        // away for rows dragged off.
        if (!added.current) chime(grow(editor, axis, true) ? 'added' : 'nope')
        else chime(added.current > 0 ? 'added' : 'away')
      }}
    >
      +
    </button>
  )

  // The edge the dragged row or column would come to rest against. Nothing is
  // drawn until it would actually move, so a plain click stays quiet.
  // Where the row or column comes to rest, which is the far side of the target
  // when it is travelling forwards: moving one column right puts it after the
  // one it passed, so a line on that column's near side pointed at the gap it
  // came from rather than the one it is going to.
  const moving = drag?.lifted && drag.from !== drag.to ? drag : null
  const onward = moving ? moving.to > moving.from : false
  const mark = !moving
    ? null
    : moving.axis === 'column'
      ? geometry.columns[moving.to] && {
          left: geometry.columns[moving.to].left + (onward ? geometry.columns[moving.to].width : 0),
          top: geometry.top,
          height: geometry.height
        }
      : geometry.rows[moving.to] && {
          top: geometry.rows[moving.to].top + (onward ? geometry.rows[moving.to].height : 0),
          left: geometry.seen.left,
          width: geometry.seen.right - geometry.seen.left
        }

  // The copy in hand, or gliding home: one element throughout, so letting go
  // is the same thing carrying on rather than a second one appearing.
  const flight = drag?.lifted
    ? { axis: drag.axis, base: drag.base, size: drag.size, offset: drag.at - drag.grab - drag.base, gliding: false }
    : settle && { axis: settle.axis, base: settle.base, size: settle.size, offset: settle.to - settle.base, gliding: true }
  const span = (axis: 'row' | 'column', base: number, size: number): React.CSSProperties =>
    axis === 'row'
      ? // A row of a table scrolled sideways is cut to the part in sight, as the table itself is.
        { top: base, height: size, left: geometry.left, width: geometry.width, clipPath: `inset(0 ${geometry.left + geometry.width - geometry.seen.right}px 0 ${geometry.seen.left - geometry.left}px)` }
      : { left: base, width: size, top: geometry.top, height: geometry.height }

  return createPortal(
    <div className="tiptap-table-controls" data-carrying={drag?.lifted || undefined} data-leaving={(leaving && !drag && !settle) || undefined}>
      {/* The place it was taken from, faded while it is in the air. */}
      {drag?.lifted && <div className="tiptap-table-vacated" style={span(drag.axis, drag.base, drag.size)} />}
      {/* Where it lands: the line every carry draws (carry.tsx), its dot at its start, upright between columns. */}
      {moving && mark && <DropLine how={`table-${moving.axis}:${moving.to}`} upright={moving.axis === 'column'} style={mark} />}
      {flight && (
        <Carried
          copy={lifted.current}
          gliding={flight.gliding}
          style={{
            ...span(flight.axis, flight.base, flight.size),
            transform: flight.axis === 'row' ? `translateY(${flight.offset}px)` : `translateX(${flight.offset}px)`
          }}
          onLanded={() => setSettle(null)}
        />
      )}
      {row && hover && grip('row', hover.row, { top: row.top, left: geometry.seen.left, height: row.height })}
      {hover && bar('row', {
        top: geometry.top + geometry.height + 4,
        left: geometry.seen.left,
        width: geometry.seen.right - geometry.seen.left
      })}
      {hover && bar('column', {
        left: geometry.seen.right + 4,
        top: geometry.top,
        height: geometry.height
      })}
      {column &&
        grip('column', column.col, {
          // Only the part of the column in sight, so a column half scrolled away has its grip over what is seen.
          left: Math.max(column.left, geometry.seen.left),
          top: geometry.top,
          width: Math.max(0, Math.min(column.left + column.width, geometry.seen.right) - Math.max(column.left, geometry.seen.left))
        })}
    </div>,
    host
  )
}
