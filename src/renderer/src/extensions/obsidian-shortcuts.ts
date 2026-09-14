import { Extension } from "@tiptap/core"
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

export const ObsidianShortcuts = Extension.create({
  name: "obsidianShortcuts",

  priority: 1000,

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
    return {
      "Mod-Alt-4": () => this.editor.commands.toggleCheckbox(),
      "Mod-Alt-5": () => this.editor.commands.toggleBulletList(),
      "Mod-Alt-6": () => this.editor.commands.toggleOrderedList(),
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
    }
  },
})
