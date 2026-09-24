import { TextSelection } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'

/** Rows of cells. Everything here works on one of these and hands it back. */
type Grid = ProseMirrorNode[][]

const CELLS = ['tableCell', 'tableHeader']

/** The table the cursor is in, and where it starts. */
function tableAt(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'table') return { node, pos: $from.before(depth) }
  }
  return null
}

/**
 * The table as plain rows of cells, or null if any cell is merged.
 *
 * A merged cell covers ground in more than one row or column, so there is no
 * single answer to what moving or sorting should do to it. The menu hides these
 * entries rather than guessing.
 */
function read(node: ProseMirrorNode): Grid | null {
  const grid: Grid = []
  for (let r = 0; r < node.childCount; r++) {
    const row = node.child(r)
    const cells: ProseMirrorNode[] = []
    for (let c = 0; c < row.childCount; c++) {
      const cell = row.child(c)
      if ((cell.attrs.colspan ?? 1) > 1 || (cell.attrs.rowspan ?? 1) > 1) return null
      cells.push(cell)
    }
    grid.push(cells)
  }
  return grid
}

/** Reshape the table, or do nothing if the change does not apply. */
function reshape(editor: Editor, change: (grid: Grid) => Grid | null): boolean {
  const found = tableAt(editor)
  const before = found && read(found.node)
  const after = before && change(before)
  if (!found || !after) return false

  const rows = after.map((cells, index) => {
    // Rows past the original count are copies, so they borrow the last row's
    // type and attributes rather than inventing any.
    const template = found.node.child(Math.min(index, found.node.childCount - 1))
    return template.type.create(template.attrs, cells)
  })

  const table = found.node.type.create(found.node.attrs, rows)
  const tr = editor.state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, table)
  // Replacing the table leaves the selection pointing at ground that no longer
  // exists, and it lands outside. Put it back in the first cell, or the grips
  // have no table to measure and the menu closes on its own first action.
  tr.setSelection(TextSelection.near(tr.doc.resolve(found.pos + 1)))

  editor.view.dispatch(tr)
  editor.view.focus()
  return true
}

/** Which row and column the cursor sits in. */
export function cellAt(editor: Editor): { row: number; column: number } | null {
  const found = tableAt(editor)
  if (!found) return null

  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if (!CELLS.includes($from.node(depth).type.name)) continue
    const map = TableMap.get(found.node)
    const { top, left } = map.findCell($from.before(depth) - found.pos - 1)
    return { row: top, column: left }
  }
  return null
}

/** Can this table be moved and sorted, or does a merged cell stand in the way? */
export const isPlain = (editor: Editor): boolean => {
  const found = tableAt(editor)
  return Boolean(found && read(found.node))
}

/** A header row is not data, so sorting leaves it where it is. */
const headerRows = (grid: Grid): number =>
  grid[0]?.every((cell) => cell.type.name === 'tableHeader') ? 1 : 0

const lift = <T>(list: T[], from: number, to: number): T[] | null => {
  if (from === to || to < 0 || to >= list.length) return null
  const out = [...list]
  out.splice(to, 0, ...out.splice(from, 1))
  return out
}

const blank = (cell: ProseMirrorNode): ProseMirrorNode =>
  cell.type.create(cell.attrs, cell.type.schema.nodes.paragraph.create())

export const moveColumn = (editor: Editor, from: number, to: number): boolean =>
  reshape(editor, (grid) => {
    const moved = grid.map((row) => lift(row, from, to))
    return moved.every(Boolean) ? (moved as Grid) : null
  })

export const moveRow = (editor: Editor, from: number, to: number): boolean =>
  reshape(editor, (grid) => {
    // The header stays first, so it neither moves nor is moved into.
    const head = headerRows(grid)
    return from < head || to < head ? null : lift(grid, from, to)
  })

export const duplicateColumn = (editor: Editor, at: number): boolean =>
  reshape(editor, (grid) =>
    grid.map((row) => [...row.slice(0, at + 1), row[at], ...row.slice(at + 1)])
  )

export const duplicateRow = (editor: Editor, at: number): boolean =>
  reshape(editor, (grid) =>
    at < headerRows(grid) ? null : [...grid.slice(0, at + 1), grid[at], ...grid.slice(at + 1)]
  )

export const clearColumn = (editor: Editor, at: number): boolean =>
  reshape(editor, (grid) => {
    const head = headerRows(grid)
    return grid.map((row, index) =>
      index < head ? row : row.map((cell, c) => (c === at ? blank(cell) : cell))
    )
  })

export const clearRow = (editor: Editor, at: number): boolean =>
  reshape(editor, (grid) => grid.map((row, index) => (index === at ? row.map(blank) : row)))

export const sortByColumn = (editor: Editor, at: number, up: boolean): boolean =>
  reshape(editor, (grid) => {
    const head = headerRows(grid)
    const body = grid.slice(head).sort((a, b) =>
      (a[at]?.textContent ?? '').localeCompare(b[at]?.textContent ?? '', undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    )
    return [...grid.slice(0, head), ...(up ? body : body.reverse())]
  })

/**
 * Add a row at the bottom or a column at the right, or take the last one away.
 *
 * This is what the `+` bars along the edges of the table do. One at a time, so
 * a drag can call it repeatedly and stop the moment the table runs out: the
 * last row or column is never taken, because a table with none is not a table.
 */
export function grow(editor: Editor, axis: 'row' | 'column', add: boolean): boolean {
  const found = tableAt(editor)
  if (!found) return false

  const map = TableMap.get(found.node)
  const size = axis === 'row' ? map.height : map.width
  if (!add && size < 2) return false

  // A cell in the last row, or in the last column. Inserting and deleting both
  // act on whatever the selection is in, so this is how the edge is named.
  const index = axis === 'row' ? (map.height - 1) * map.width : map.width - 1
  const chain = editor.chain().setTextSelection(found.pos + 2 + map.map[index])

  if (axis === 'row') return add ? chain.addRowAfter().run() : chain.deleteRow().run()
  return add ? chain.addColumnAfter().run() : chain.deleteColumn().run()
}

/**
 * Drop every column width, so the table goes back to filling the page.
 *
 * Dragging a column border pins that column to a pixel width, and a table left
 * with a few pinned columns no longer fits the note when the window changes.
 */
export function fitToWidth(editor: Editor): boolean {
  const found = tableAt(editor)
  if (!found) return false

  const tr = editor.state.tr
  found.node.descendants((node, pos) => {
    if (!CELLS.includes(node.type.name)) return true
    tr.setNodeMarkup(found.pos + 1 + pos, undefined, { ...node.attrs, colwidth: null })
    return false
  })

  editor.view.dispatch(tr)
  return true
}
