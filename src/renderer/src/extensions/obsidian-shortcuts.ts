import { Extension, InputRule } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorState } from "@tiptap/pm/state"

// --- Lib ---
import { retypeList, toggleChecks } from "@/lib/retype-list"
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
 * What a math command should turn into a formula: the selection, and only the
 * selection. With nothing selected it starts a new one just past the word the
 * cursor is in, rather than taking that word: ⌥⌘9 sits beside ⌥⌘8, and a
 * slip turned "tldr", "20" and "500" into formulas that copied as nothing.
 * Math nodes cannot hold an empty formula and this project has no inline
 * editor for them, so the new one holds a placeholder you can toggle back
 * into plain text and retype.
 */
function mathTarget(state: EditorState): {
  from: number
  to: number
  latex: string
} {
  const { from, to, empty } = state.selection
  if (!empty) return { from, to, latex: state.doc.textBetween(from, to) || "x" }
  const at = selectedWordRange(state)?.to ?? from
  return { from: at, to: at, latex: "x" }
}

export interface ObsidianShortcutOptions {
  /** Mod-e, Obsidian's key for source view (⌥⌘S is safe mode, held system-wide). The panel belongs to the editor, so it only asks. */
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

  /**
   * A list's mark typed at the start of a list item changes that item's kind,
   * as in Notion: `- ` in a numbered item makes it a bullet, `[ ] ` a
   * checkbox. Left to the list's own rule it nested a new list inside the
   * item instead, under an empty numbered line.
   */
  addInputRules() {
    const { editor } = this
    const retype = (find: RegExp, list: string): InputRule =>
      new InputRule({
        find,
        handler: ({ state, range, match, commands }) => {
          const $from = state.doc.resolve(range.from)
          const item = $from.depth > 2 ? $from.node(-1) : null
          if (!item || !["listItem", "taskItem"].includes(item.type.name) || $from.index(-1) !== 0) return null
          if ($from.node(-2).type.name === list) return null
          commands.deleteRange(range)
          // Once the mark is gone, on the document as it then is: inside the
          // rule's own step the rebuilt list lost the caret. Moments apart,
          // the two are still one undo.
          queueMicrotask(() => {
            if (!retypeList(editor, list)) return
            if (list === "taskList" && /x/i.test(match[0])) editor.commands.updateAttributes("taskItem", { checked: true })
          })
          return undefined
        },
      })
    return [
      retype(/^\s*([-+*])\s$/, "bulletList"),
      retype(/^(\d+)\.\s$/, "orderedList"),
      retype(/^\s*\[([( |x])?\]\s$/i, "taskList"),
    ]
  },

  addKeyboardShortcuts() {
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
        // Only when there is nothing selected. With a run selected, "already a
        // checklist" is true the moment the *first* line is one, and bailing
        // here left the rest of the selection as bullets.
        if (editor.state.selection.empty && editor.isActive(list)) return true
        // Already in a list of the other kind: retype this line only.
        return retypeList(editor, list) || editor.commands[command]()
      }

    return {
      // Already a checkbox: tick it. Otherwise make this line one.
      // On checkboxes it ticks them; anywhere else it makes them. One line or
      // ten, and `toggleChecks` stands down for a selection that is not all
      // checkboxes, which is what makes the fall-through the conversion.
      "Mod-Alt-4": () =>
        toggleChecks(this.editor) || turnInto("toggleTaskList", "taskList")(),
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
      "Mod-e": () => {
        this.options.onToggleSource?.()
        return true
      },
    }
  },
})
