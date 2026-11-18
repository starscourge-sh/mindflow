import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'

import {
  cellAt,
  clearColumn,
  clearRow,
  duplicateColumn,
  duplicateRow,
  isPlain,
  sortByColumn
} from '@/lib/table'
import { MenuGlyph } from '@/components/ui/menu-icon'
import { chime, type Cue } from '@/lib/sound'

/** Clear of the window's edges, and of the title bar at the top (context-menu.tsx). */
const MENU_ROOM = { top: 52, right: 12, bottom: 12, left: 12 }
/** Where the menu goes when there is no room above: below, then to either side. */
const AFTER_ABOVE: ('bottom-start' | 'right-start' | 'left-start')[] = ['bottom-start', 'right-start', 'left-start']

/**
 * Held still at module scope. Rebuilt each render it re-registers the menu's
 * ProseMirror plugin, which is what closed the slash menu mid typing once.
 *
 * The menu opens beside the row or column it acts on, never over it: above
 * it first, below it when there is no room above, and to the side when the
 * table is taller than the window. Hung under a column's top cell, it covered
 * the very column it was about to change.
 *
 * `size` keeps a long menu reachable: the window is short, a column offers
 * nine things, and without a cap the last of them sat past the edge.
 */
const POSITION = {
  placement: 'top-start',
  flip: { padding: MENU_ROOM, fallbackPlacements: AFTER_ABOVE, fallbackStrategy: 'bestFit' },
  shift: { padding: MENU_ROOM },
  offset: 6,
  size: {
    padding: MENU_ROOM,
    apply: ({
      elements,
      availableHeight
    }: {
      elements: { floating: HTMLElement }
      availableHeight: number
    }) => {
      elements.floating.style.maxHeight = `${Math.max(140, availableHeight)}px`
    }
  },
  // Its own soft cue each time it appears, as every menu in the app has.
  onShow: () => chime('open')
} as const

/** How far the grips stand off the table (haligtree-editor.scss, .tiptap-table-grip): the menu clears them too. */
const GRIP = 16

/**
 * The picked row or column as one box, with its grip: the menu is placed
 * against all of it, so none of it is hidden. Anything else (cells dragged
 * across) keeps the menu's own reckoning.
 */
function picked(this: { editor: Editor }): { getBoundingClientRect: () => DOMRect } | null {
  const { selection } = this.editor.state
  if (!(selection instanceof CellSelection)) return null
  const column = selection.isColSelection()
  const row = selection.isRowSelection()
  if (!column && !row) return null
  const cells: HTMLElement[] = []
  selection.forEachCell((_, pos) => {
    const dom = this.editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) cells.push(dom)
  })
  if (!cells.length) return null
  return {
    getBoundingClientRect: () => {
      const boxes = cells.map((cell) => cell.getBoundingClientRect())
      const top = Math.min(...boxes.map((b) => b.top)) - (column ? GRIP : 0)
      const left = Math.min(...boxes.map((b) => b.left)) - (row ? GRIP : 0)
      const right = Math.max(...boxes.map((b) => b.right))
      const bottom = Math.max(...boxes.map((b) => b.bottom))
      return new DOMRect(left, top, right - left, bottom - top)
    }
  }
}

/** A row of the menu and the cue it answers with, or a rule between groups. */
type Entry = [label: string, run: () => void, cue: Cue] | null

/**
 * What you can do to the row or column you picked.
 *
 * Which entries show depends on what is selected, because the grips select a
 * whole row or column and that is what these act on. Moving is not here: the
 * grip that selected it also drags it, and two ways to do one thing is one too
 * many. Neither is anything that belongs to the whole table - header rows,
 * fitting, deleting it - which live on the table's own handle instead.
 *
 * Words rather than symbols: every one of these is destructive or structural,
 * and a glyph nobody recognises is worse than a slightly wider menu.
 */
function entries(editor: Editor): Entry[] {
  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const at = cellAt(editor)
  // Checked, not cast: this runs on every render, including the ones where the
  // selection is ordinary text and there is no menu to show yet.
  const selection = editor.state.selection
  const cells = selection instanceof CellSelection ? selection : null

  // Sorting and duplicating rebuild the table from its cells, and a merged cell
  // covers ground in more than one row, so there is no single answer to where
  // it should land.
  const plain = isPlain(editor)
  /** Only offered on a plain table, and typed here so the lists need no casts. */
  const whenPlain = (rows: Entry[]): Entry[] => (plain ? rows : [])

  if (at && cells?.isColSelection()) {
    const { column } = at
    return [
      ['Insert column left', () => chain().addColumnBefore().run(), 'added'],
      ['Insert column right', () => chain().addColumnAfter().run(), 'added'],
      null,
      ...whenPlain([
        ['Sort column A to Z', () => sortByColumn(editor, column, true), 'shift'],
        ['Sort column Z to A', () => sortByColumn(editor, column, false), 'shift'],
        null,
        ['Duplicate column', () => duplicateColumn(editor, column), 'copy'],
        ['Clear column contents', () => clearColumn(editor, column), 'away']
      ]),
      ['Delete column', () => chain().deleteColumn().run(), 'away']
    ]
  }

  if (at && cells?.isRowSelection()) {
    const { row } = at
    return [
      ['Insert row above', () => chain().addRowBefore().run(), 'added'],
      ['Insert row below', () => chain().addRowAfter().run(), 'added'],
      null,
      ...whenPlain([
        ['Duplicate row', () => duplicateRow(editor, row), 'copy'],
        ['Clear row contents', () => clearRow(editor, row), 'away']
      ]),
      ['Delete row', () => chain().deleteRow().run(), 'away']
    ]
  }

  // Cells picked by dragging across them, which is neither a row nor a column.
  return [['Merge or split cells', () => chain().mergeOrSplit().run(), 'gather']]
}

/**
 * Every cell of a table of several rows and columns picked (a drag across them
 * all; ⌘A's step after a row picks the table as a block): no one row or column
 * is meant, and the column's menu it showed ("Delete column", "Sort column A to
 * Z") said otherwise.
 */
const wholeTable = (cells: CellSelection): boolean => {
  const map = TableMap.get(cells.$anchorCell.node(-1))
  return map.width > 1 && map.height > 1 && cells.isRowSelection() && cells.isColSelection()
}

// Only once a grip has been used, or cells dragged across. A cursor resting
// in a cell is someone typing, not someone asking for a menu. Not while the
// table is being dragged: the drag starts from a cell selection and leaves it
// in place, so the menu floated over the drag. One function for good: a new
// one each render made the menu reconfigure on every keystroke.
const showForCells: BubbleMenuProps['shouldShow'] = ({ editor: view, state }) =>
  state.selection instanceof CellSelection && !view.view.dragging && !wholeTable(state.selection)

export function TableMenu({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  // The bubble re-renders when it is shown or hidden, not when the selection
  // moves inside it, so picking a different column left the old column's
  // entries on screen. Listening for the selection rather than for every
  // transaction: the wider subscription re-entered its own render and React
  // gave up on the depth.
  const [, recompute] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!editor) return
    // Only while cells are picked, or just were: redrawing on every key typed
    // anywhere else cost a long note a measure of the whole page each time.
    let was = false
    const moved = (): void => {
      const cells = editor.state.selection instanceof CellSelection
      if (cells || was) recompute()
      was = cells
    }
    editor.on('selectionUpdate', moved)
    return () => {
      editor.off('selectionUpdate', moved)
    }
  }, [editor])

  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      // Shares the default key with the selection menu otherwise.
      pluginKey="tableMenu"
      shouldShow={showForCells}
      getReferencedVirtualElement={picked}
      options={POSITION}
      className="tiptap-table-menu"
    >
      {entries(editor).map((entry, index) =>
        entry ? (
          <button key={entry[0]} type="button" onClick={() => (chime(entry[2]), entry[1]())} data-danger={/^delete/i.test(entry[0]) || undefined}>
            <MenuGlyph label={entry[0]} small />
            {entry[0]}
          </button>
        ) : (
          <hr key={`rule-${index}`} />
        )
      )}
    </BubbleMenu>
  )
}
