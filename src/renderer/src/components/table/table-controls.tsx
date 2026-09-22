import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { useEditorState, type Editor } from '@tiptap/react'

import { moveColumn, moveRow } from '@/lib/table'

/** Where each row and column sits, relative to the editor's own box. */
interface Geometry {
  top: number
  left: number
  width: number
  height: number
  rows: { top: number; height: number }[]
  columns: { left: number; width: number; col: number }[]
}

/**
 * Measure the table the cursor is in.
 *
 * The grips are an overlay rather than markup inside the table: a `<tr>` may
 * only contain cells, so there is nowhere in the table itself to hang them.
 */
function measure(editor: Editor): Geometry | null {
  const { state, view } = editor
  const { $from } = state.selection

  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== 'table') continue

    const dom = view.nodeDOM($from.before(depth))
    const table = (dom as HTMLElement | null)?.querySelector('table')
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

    return {
      top: box.top - origin.top + downBy,
      left: box.left - origin.left + acrossBy,
      width: box.width,
      height: box.height,
      rows,
      columns
    }
  }

  return null
}

/** Which row and column the pointer is over, or null when it has left. */
type Hover = { row: number; column: number } | null

/** The grips sit outside the table, so the pointer counts as near a little early. */
const MARGIN = 24

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

  // Re-measure on any transaction: typing in a cell resizes it.
  const version = useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber
  })

  useLayoutEffect(() => {
    if (!editor) return
    // The DOM has not been laid out yet on the transaction that changed it.
    const id = requestAnimationFrame(() => setGeometry(measure(editor)))
    return () => cancelAnimationFrame(id)
  }, [editor, version])

  // A wide table scrolls inside its own wrapper, which fires no transaction -
  // without this the grips stay put while the columns slide under them. Every
  // table has its own wrapper, so this listens at the root in the capture phase
  // rather than picking one: scroll does not bubble.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onScroll = (): void => setGeometry(measure(editor))
    dom.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => dom.removeEventListener('scroll', onScroll, { capture: true })
  }, [editor])

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
  const host = editor?.view.dom.parentElement ?? null

  useEffect(() => {
    if (!host || !geometry) return

    const onMove = (event: MouseEvent): void => {
      const origin = host.getBoundingClientRect()
      const x = event.clientX - origin.left + host.scrollLeft
      const y = event.clientY - origin.top + host.scrollTop
      const near =
        x >= geometry.left - MARGIN &&
        x <= geometry.left + geometry.width &&
        y >= geometry.top - MARGIN &&
        y <= geometry.top + geometry.height
      if (!near) return setHover(null)

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
    const onLeave = (): void => setHover(null)

    host.addEventListener('mousemove', onMove)
    host.addEventListener('mouseleave', onLeave)
    return () => {
      host.removeEventListener('mousemove', onMove)
      host.removeEventListener('mouseleave', onLeave)
    }
  }, [host, geometry])

  /** Which row or column the pointer is over, or -1 when it is outside. */
  const indexAt = useCallback(
    (axis: "row" | "column", event: React.PointerEvent): number => {
      if (!geometry || !host) return -1
      const origin = host.getBoundingClientRect()
      const x = event.clientX - origin.left + host.scrollLeft
      const y = event.clientY - origin.top + host.scrollTop
      return axis === "column"
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
  const [drag, setDrag] = useState<{ axis: "row" | "column"; from: number; to: number } | null>(
    null
  )

  // The overlay has to live in the same box its coordinates were measured
  // against, or it drifts as soon as the document scrolls. That box is the
  // editor's own container - positioned, and inside the scroller rather than
  // being it.
  if (!editor || !geometry || !host || !hover) return null

  const column = geometry.columns[hover.column]
  const row = geometry.rows[hover.row]

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
      title={`Select or move this ${axis}`}
      style={style}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag({ axis, from: index, to: index })
      }}
      onPointerMove={(event) => {
        // Capture means every move lands here until the button is released,
        // so this is also how we know a drag is under way.
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const to = indexAt(axis, event)
        setDrag((held) => (held && to >= 0 ? { ...held, to } : held))
      }}
      onPointerUp={() => {
        setDrag(null)
        if (!drag || !editor) return
        const pick = (at: number): number =>
          axis === "column" ? (geometry.columns[at]?.col ?? at) : at
        if (drag.from === drag.to) select(axis, pick(drag.from))
        else if (axis === "column") moveColumn(editor, pick(drag.from), pick(drag.to))
        else moveRow(editor, drag.from, drag.to)
      }}
    />
  )

  // The edge the dragged row or column would come to rest against. Nothing is
  // drawn until it would actually move, so a plain click stays quiet.
  // Where the row or column comes to rest, which is the far side of the target
  // when it is travelling forwards: moving one column right puts it after the
  // one it passed, so a line on that column's near side pointed at the gap it
  // came from rather than the one it is going to.
  const moving = drag && drag.from !== drag.to ? drag : null
  const onward = moving ? moving.to > moving.from : false
  const mark = !moving
    ? null
    : moving.axis === "column"
      ? geometry.columns[moving.to] && {
          left:
            geometry.columns[moving.to].left +
            (onward ? geometry.columns[moving.to].width : 0),
          top: geometry.top,
          height: geometry.height
        }
      : geometry.rows[moving.to] && {
          top:
            geometry.rows[moving.to].top +
            (onward ? geometry.rows[moving.to].height : 0),
          left: geometry.left,
          width: geometry.width
        }

  return createPortal(
    <div className="tiptap-table-controls">
      {moving && mark && (
        <div className={`tiptap-table-landing is-${moving.axis}`} style={mark} />
      )}
      {row && grip('row', hover.row, { top: row.top, left: geometry.left, height: row.height })}
      {column &&
        grip('column', column.col, {
          left: column.left,
          top: geometry.top,
          width: column.width
        })}
    </div>,
    host
  )
}
