import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { useEditorState, type Editor } from '@tiptap/react'

import { cellAt, moveColumn, moveRow } from '@/lib/table'

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
    const origin = view.dom.parentElement?.getBoundingClientRect()
    if (!table || !origin) return null

    const box = table.getBoundingClientRect()
    const rows = [...table.rows].map((row) => {
      const rect = row.getBoundingClientRect()
      return { top: rect.top - origin.top, height: rect.height }
    })
    // A colspan fills several map columns with the same cell, so the map index
    // has to be carried rather than inferred from the DOM position.
    let col = 0
    const columns = [...(table.rows[0]?.cells ?? [])].map((cell) => {
      const rect = cell.getBoundingClientRect()
      const entry = { left: rect.left - origin.left, width: rect.width, col }
      col += cell.colSpan
      return entry
    })

    return {
      top: box.top - origin.top,
      left: box.left - origin.left,
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

        editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView())
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
      const x = event.clientX - origin.left
      const y = event.clientY - origin.top
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

  /**
   * Drop the grip on whichever row or column the pointer ended over.
   *
   * Where the drag started is read back from the selection rather than held:
   * pressing the grip selected that row or column, and a drag does not change
   * it. A press with no drag lands on the same index, which is no move at all.
   */
  const drop = useCallback(
    (axis: 'row' | 'column', event: React.PointerEvent): void => {
      const anchor = editor && cellAt(editor)
      if (!anchor || !editor || !geometry || !host) return
      const start = axis === 'column' ? anchor.column : anchor.row

      const origin = host.getBoundingClientRect()
      const x = event.clientX - origin.left
      const y = event.clientY - origin.top
      const to =
        axis === 'column'
          ? geometry.columns.findIndex((c) => x >= c.left && x < c.left + c.width)
          : geometry.rows.findIndex((r) => y >= r.top && y < r.top + r.height)
      // Dropped outside the table, which is a change of mind, not a move.
      if (to < 0) return

      const target = axis === 'column' ? geometry.columns[to].col : to
      if (axis === 'column') moveColumn(editor, start, target)
      else moveRow(editor, start, target)
    },
    [editor, geometry, host]
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
        select(axis, index)
      }}
      onPointerUp={(event) => drop(axis, event)}
    />
  )

  return createPortal(
    <div className="tiptap-table-controls">
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
