import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { CellSelection, TableMap } from "@tiptap/pm/tables"
import { useEditorState, type Editor } from "@tiptap/react"

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
    if ($from.node(depth).type.name !== "table") continue

    const dom = view.nodeDOM($from.before(depth))
    const table = (dom as HTMLElement | null)?.querySelector("table")
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
      columns,
    }
  }

  return null
}

/**
 * Row and column grips around the table the cursor is in.
 *
 * Clicking a grip selects the whole row or column, which is what the table
 * menu then acts on; the `+` buttons on each axis append to it.
 */
export function TableControls({ editor }: { editor: Editor | null }) {
  const [geometry, setGeometry] = useState<Geometry | null>(null)

  // Re-measure on any transaction: typing in a cell resizes it.
  const version = useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
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
    const onScroll = () => setGeometry(measure(editor))
    dom.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => dom.removeEventListener("scroll", onScroll, { capture: true })
  }, [editor])

  /** Select a whole row or column by its index. */
  const select = useCallback(
    (axis: "row" | "column", index: number) => {
      if (!editor) return
      const { state } = editor
      const { $from } = state.selection

      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type.name !== "table") continue

        const start = $from.before(depth) + 1
        const map = TableMap.get(node)
        const cell = axis === "row" ? map.map[index * map.width] : map.map[index]

        const $cell = state.doc.resolve(start + cell)
        const selection =
          axis === "row"
            ? CellSelection.rowSelection($cell)
            : CellSelection.colSelection($cell)

        editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView())
        editor.view.focus()
        return
      }
    },
    [editor]
  )

  // The overlay has to live in the same box its coordinates were measured
  // against, or it drifts as soon as the document scrolls. That box is the
  // editor's own container - positioned, and inside the scroller rather than
  // being it.
  const host = editor?.view.dom.parentElement
  if (!editor || !geometry || !host) return null

  return createPortal(
    <div className="tiptap-table-controls" aria-hidden="true">
      {geometry.rows.map((row, index) => (
        <button
          key={`row-${index}`}
          type="button"
          className="tiptap-table-grip is-row"
          tabIndex={-1}
          title="Select this row"
          style={{ top: row.top, left: geometry.left, height: row.height }}
          onClick={() => select("row", index)}
        />
      ))}

      {geometry.columns.map((column, index) => (
        <button
          key={`column-${index}`}
          type="button"
          className="tiptap-table-grip is-column"
          tabIndex={-1}
          title="Select this column"
          style={{ left: column.left, top: geometry.top, width: column.width }}
          onClick={() => select("column", column.col)}
        />
      ))}

    </div>,
    host
  )
}
