import { Extension } from "@tiptap/core"
import { canJoin } from "@tiptap/pm/transform"
import { Selection } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorState } from "@tiptap/pm/state"

// --- Lib ---
import { wordRangeAt } from "@/lib/word-range"

/**
 * Obsidian-style keyboard shortcuts.
 *
 * Bold (Mod-b), italic (Mod-i) and headings (Mod-Alt-1/2/3) already match
 * Obsidian out of the box, so they are not rebound here.
 *
 * The priority is raised so these win over the defaults they replace —
 * Mod-Alt-5/6 (headings 5 and 6) and Mod-Enter (exit code block). Commands
 * that return false still fall through to the original binding.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    obsidianShortcuts: {
      /** Make the block a checkbox, or flip the one already under the cursor. */
      toggleCheckbox: () => ReturnType
      /** Wrap the selection in inline math, or unwrap the math under the cursor. */
      toggleInlineMath: () => ReturnType
      /** Turn the selection into a math block. */
      insertMathBlock: () => ReturnType
      /** Toggle a mark over the whole word when nothing is selected. */
      toggleMarkOnWord: (type: string) => ReturnType
    }
  }
}

/** The item type each kind of list holds. */
const ITEM_OF: Record<string, string> = {
  bulletList: "listItem",
  orderedList: "listItem",
  taskList: "taskItem",
}

const ITEMS = ["listItem", "taskItem"]

/**
 * The word under a collapsed cursor, or null when there is a real selection.
 */
function selectedWordRange(
  state: EditorState
): { from: number; to: number } | null {
  const { empty, $from } = state.selection
  if (!empty) return null
  return wordRangeAt(state.doc, $from.pos)
}

/**
 * What a math command should turn into a formula: the selection, or the word
 * under the cursor. Math nodes cannot hold an empty formula and this project
 * has no inline editor for them, so an empty target gets a placeholder you can
 * toggle back into plain text and retype.
 */
function mathTarget(state: EditorState): {
  from: number
  to: number
  latex: string
} {
  const { from, to } = state.selection
  const range = selectedWordRange(state) ?? { from, to }
  return { ...range, latex: state.doc.textBetween(range.from, range.to) || "x" }
}

export interface ObsidianShortcutOptions {
  /** Mod-Alt-s. The panel belongs to the editor, so it only asks. */
  onToggleSource?: () => void
}

export const ObsidianShortcuts = Extension.create<ObsidianShortcutOptions>({
  name: "obsidianShortcuts",

  priority: 1000,

  addOptions() {
    return { onToggleSource: undefined }
  },

  addCommands() {
    return {
      toggleCheckbox:
        () =>
        ({ state, dispatch, commands }) => {
          const { $from } = state.selection

          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name !== "taskItem") continue

            if (dispatch) {
              dispatch(
                state.tr.setNodeMarkup($from.before(depth), undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                })
              )
            }
            return true
          }

          // Not a checkbox yet - make one. Returning true either way keeps this
          // from falling through to the heading-4 binding on Mod-Alt-4.
          commands.toggleTaskList()
          return true
        },

      toggleInlineMath:
        () =>
        ({ state, chain }) => {
          const { from, to } = state.selection

          // Cursor sits on (or next to) an existing node - unwrap it back to text.
          let mathNode: ProseMirrorNode | null = null
          let mathPos = -1
          state.doc.nodesBetween(Math.max(0, from - 1), to + 1, (node, pos) => {
            if (mathNode) return false
            if (node.type.name === "inlineMath") {
              mathNode = node
              mathPos = pos
            }
            return true
          })

          if (mathNode) {
            const node: ProseMirrorNode = mathNode
            return chain()
              .insertContentAt(
                { from: mathPos, to: mathPos + node.nodeSize },
                String(node.attrs.latex ?? "")
              )
              .run()
          }

          // With nothing selected, take the word under the cursor - the same
          // fallback the mark toggles use.
          const { latex, ...range } = mathTarget(state)
          return chain()
            .deleteRange(range)
            .insertInlineMath({ latex, pos: range.from })
            .run()
        },

      insertMathBlock:
        () =>
        ({ state, chain }) => {
          const { latex, ...range } = mathTarget(state)
          return chain()
            .deleteRange(range)
            .insertBlockMath({ latex, pos: range.from })
            .run()
        },

      toggleMarkOnWord:
        (type: string) =>
        ({ state, chain }) => {
          const word = selectedWordRange(state)
          if (!word) return chain().focus().toggleMark(type).run()

          // Marks never change the document length, so the original cursor
          // position is still valid afterwards.
          const { from, to } = state.selection
          return chain()
            .focus()
            .setTextSelection(word)
            .toggleMark(type)
            .setTextSelection({ from, to })
            .run()
        },

    }
  },

  addKeyboardShortcuts() {
    /**
     * Retype just the item the cursor is on, leaving the rest of the list alone.
     *
     * TipTap's own `toggleList` calls `setNodeMarkup` on the whole list node, so
     * one bullet in a run of twenty turns all twenty into numbers. Splitting the
     * list around the item and retyping the single-item list left in the middle
     * changes only that line - and unlike lifting the item out, its indented
     * children come with it instead of being orphaned beside it.
     */
    const retypeItem = (list: string): boolean =>
      this.editor.commands.command(({ state, tr, dispatch }) => {
        const type = state.schema.nodes[list]
        // A checklist holds `taskItem` and the other two hold `listItem`, so
        // the item has to change type along with the list around it.
        const item = state.schema.nodes[ITEM_OF[list]]
        const { $from } = state.selection
        const depth = $from.depth - 1
        if (!type || !item || depth < 1) return false
        if (!ITEMS.includes($from.node(depth).type.name)) return false

        const parent = $from.node(depth - 1)
        const index = $from.index(depth - 1)
        // Later edge first throughout, here and in the joins below: cutting the
        // earlier one would move every position after it.
        if (index < parent.childCount - 1) tr.split($from.after(depth), 1)
        if (index > 0) tr.split($from.before(depth), 1)

        const at = tr.mapping.map($from.before(depth)) - 1
        const was = tr.doc.nodeAt(at)
        if (!was || was.type === type) return false

        // Rebuilt in one step, not retyped in two: a list is only ever valid
        // holding its own kind of item, so changing the list and then the item
        // passes through a state the schema rejects and the whole thing throws.
        const items: ProseMirrorNode[] = []
        was.forEach((child) =>
          items.push(child.type === item ? child : item.create(null, child.content))
        )
        const next = type.create(was.attrs, items)
        tr.replaceWith(at, at + was.nodeSize, next)
        // The rebuilt item holds the same content, so the same offset inside it
        // is the same spot. Left to itself the caret maps into the list that
        // follows, and the next press converts the wrong line.
        tr.setSelection(
          Selection.near(tr.doc.resolve(at + 1 + ($from.pos - $from.before(depth))))
        )

        // Two lists of the SAME kind side by side are one list, or converting a
        // line and converting it back would leave the run cut in three where
        // the split was. The type test is not redundant: `canJoin` only asks
        // whether the content matches, and every list holds `listItem+`, so it
        // would happily merge the numbered line straight back in.
        const joinable = (pos: number): boolean =>
          canJoin(tr.doc, pos) &&
          tr.doc.resolve(pos).nodeBefore?.type ===
            tr.doc.resolve(pos).nodeAfter?.type

        if (joinable(at + next.nodeSize)) tr.join(at + next.nodeSize)
        if (joinable(at)) tr.join(at)

        if (dispatch) dispatch(tr.scrollIntoView())
        return true
      })

    /**
     * Turn the line into a list of this kind.
     *
     * Inside a toggle it unfolds first: the item already sits in a list, so
     * "make this a bullet" means undoing the fold, not lifting the whole thing
     * out and splitting the list in two behind it.
     */
    const turnInto =
      (
        command: "toggleBulletList" | "toggleOrderedList" | "toggleTaskList",
        list: string
      ) =>
      (): boolean => {
        const { editor } = this
        if (editor.isActive("details")) editor.commands.toggleHeadingSection()
        if (editor.isActive(list)) return true
        // Already in a list of the other kind: retype this line only.
        return retypeItem(list) || editor.commands[command]()
      }

    return {
      // Already a checkbox: tick it. Otherwise make this line one.
      "Mod-Alt-4": () =>
        this.editor.isActive("taskItem")
          ? this.editor.commands.toggleCheckbox()
          : turnInto("toggleTaskList", "taskList")(),
      "Mod-Alt-5": turnInto("toggleBulletList", "bulletList"),
      "Mod-Alt-6": turnInto("toggleOrderedList", "orderedList"),
      // Notion's numbering: 4 to-do, 5 bulleted, 6 numbered, 7 toggle.
      "Mod-Alt-7": () => this.editor.commands.toggleHeadingSection(),
      "Mod-b": () => this.editor.commands.toggleMarkOnWord("bold"),
      "Mod-i": () => this.editor.commands.toggleMarkOnWord("italic"),
      "Mod-u": () => this.editor.commands.toggleMarkOnWord("underline"),
      "Mod-Shift-s": () => this.editor.commands.toggleMarkOnWord("strike"),
      "Mod-Alt-8": () => this.editor.commands.toggleMarkOnWord("code"),
      "Mod-Alt-9": () => this.editor.commands.toggleInlineMath(),
      "Mod-Alt-t": () =>
        this.editor.commands.insertTable({
          rows: 3,
          cols: 3,
          withHeaderRow: true,
        }),
      "Mod-Alt-0": () => this.editor.commands.insertMathBlock(),
      // Show what the editor is actually holding. The panel belongs to the
      // editor, the same way the find bar does.
      "Mod-Alt-s": () => {
        this.options.onToggleSource?.()
        return true
      },
    }
  },
})
