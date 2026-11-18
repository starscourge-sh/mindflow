import { Extension, InputRule } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { findWrapping } from "@tiptap/pm/transform"
import { AllSelection, Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"

// --- Lib ---
import { grow, markGrown } from "@/lib/grow-selection"
import { retypeList, toggleChecks } from "@/lib/retype-list"
import { wordRangeAt } from "@/lib/word-range"
import { vimPluginKey } from "@/extensions/vim-mode"

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

interface ObsidianShortcutOptions {
  /** Mod-e, Obsidian's key for source view (⌥⌘S is safe mode, the menu bar's). The panel belongs to the editor, so it only asks. */
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
    const inItem = (state: EditorState, at: number): boolean => {
      const $from = state.doc.resolve(at)
      const item = $from.depth > 2 ? $from.node(-1) : null
      return !!item && ["listItem", "taskItem"].includes(item.type.name) && $from.index(-1) === 0
    }
    // A mark typed one letter at a time leaves its start in the document, and deleting that is a real step.
    // The whole mark arriving together (`# ` pasted, or inserted at once) matches a range that is still empty,
    // and an empty delete is not a step, so the letters land and the line changes around them.
    const dropMark = (tr: Transaction, range: { from: number; to: number }): void => {
      if (range.from < range.to) tr.delete(range.from, range.to)
      else tr.insertText("\u200b", range.from).delete(range.from, range.from + 1)
    }
    // The mark is taken off in this step. The line changes on the next one, once that delete has landed:
    // doing both here rebuilt the list and then lost the caret.
    const retype = (find: RegExp, list: string): InputRule =>
      new InputRule({
        find,
        handler: ({ state, range, match }) => {
          if (!inItem(state, range.from)) return null
          const $from = state.doc.resolve(range.from)
          // The same mark again (`- ` on a bullet) only removes itself. Left for the list's own rule, it nested another list.
          if ($from.node(-2).type.name === list) {
            dropMark(state.tr, range)
            return
          }
          dropMark(state.tr, range)
          queueMicrotask(() => {
            if (!retypeList(editor, list)) return
            if (list === "taskList" && /x/i.test(match[0])) editor.commands.updateAttributes("taskItem", { checked: true })
          })
          return undefined
        },
      })
    // A mark on a plain line. The list's own rule is what a list line uses; this one is for a line that is not in a list,
    // and it only deletes the mark once the wrap is possible, so a failed wrap never eats the letters.
    const wrapPlain = (find: RegExp, list: string): InputRule =>
      new InputRule({
        find,
        handler: ({ state, range }) => {
          if (inItem(state, range.from)) return null
          const type = state.schema.nodes[list]
          if (!type) return null
          const tr = state.tr.delete(range.from, range.to)
          const block = tr.doc.resolve(range.from).blockRange()
          const wrapping = block && findWrapping(block, type)
          if (!wrapping || !block) return null
          tr.wrap(block, wrapping)
          return undefined
        },
      })
    // `# ` and `> ` at the start of a line, including a list line. On a list line the ordinary rule cannot
    // replace the paragraph, so the mark stayed as words and the bullet stayed with them.
    const leave = (): void => {
      const item = editor.isActive("taskItem") ? "taskItem" : editor.isActive("listItem") ? "listItem" : null
      if (item) editor.chain().focus().liftListItem(item).run()
    }
    const marked = (find: RegExp, apply: () => void): InputRule =>
      new InputRule({
        find,
        handler: ({ state, range }) => {
          dropMark(state.tr, range)
          queueMicrotask(() => {
            leave()
            apply()
            const { $from } = editor.state.selection
            const parent = $from.parent
            if (!parent.isTextblock) return
            const lead = /^(?:#{1,3} |>)\s/.exec(parent.textContent)
            if (!lead || lead.index !== 0) return
            const from = $from.start()
            editor.commands.deleteRange({ from, to: from + lead[0].length })
          })
        },
      })
    return [
      retype(/^\s*([-+*])\s$/, "bulletList"),
      retype(/^(\d+)\.\s$/, "orderedList"),
      retype(/^\s*\[([( |x])?\]\s$/i, "taskList"),
      wrapPlain(/^\s*([-+*])\s$/, "bulletList"),
      wrapPlain(/^(\d+)\.\s$/, "orderedList"),
      wrapPlain(/^\s*\[([( |x])?\]\s$/i, "taskList"),
      marked(/^(#{1})\s$/, () => editor.chain().focus().setHeading({ level: 1 }).run()),
      marked(/^(#{2})\s$/, () => editor.chain().focus().setHeading({ level: 2 }).run()),
      marked(/^(#{3})\s$/, () => editor.chain().focus().setHeading({ level: 3 }).run()),
      marked(/^>\s$/, () => editor.chain().focus().toggleBlockquote().run()),
    ]
  },

  addProseMirrorPlugins() {
    // A new line starts plain, as in Obsidian: Enter at the end of italic (or bold, or any mark) kept it for the next
    // letters, so a new list line typed italic (16 Nov). Only an empty line just made: a split inside a marked word still
    // carries its mark, and ⌘I pressed on an empty line still holds, since pressing it changes no words.
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!state.storedMarks?.length || !transactions.some((tr) => tr.docChanged)) return null
          const { $from, empty } = state.selection
          if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0 || $from.parent.type.spec.code) return null
          return state.tr.setStoredMarks([])
        },
      }),
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
      // Each press picks the next range round the caret, as Obsidian's does: the line's words, its block, its
      // list, its section, then the whole note (lib/grow-selection.ts). With Vim on too, in every mode; Vim's
      // own ⌃A is its own. Taken here, the key never reaches the menu bar's Select All, which picks it all.
      "Mod-a": ({ editor }) => {
        const { state, view } = editor
        const next = grow(state)
        if (!next) return true
        // The bars over what was picked (components/selection/selection-menu.tsx, components/table/table-menu.tsx) go
        // at once: left a moment where they were, they sat on the line the step had just taken in. Each comes back
        // over the new pick once the keys rest.
        const tr = state.tr.setSelection(markGrown(next)).setMeta("selectionMenu", "hide").setMeta("tableMenu", "hide")
        // Vim's visual mode keeps its own ends for y, d and c: told the new ones, they take what ⌘A picked. A pick
        // that is not words (blocks, cells, the note) is left in normal mode, as ⌘A always left it there, where d, x,
        // y and c take blocks picked whole (extensions/vim-mode.ts).
        const vim = vimPluginKey.getState(state)
        if (vim?.enabled && (vim.mode === "visual" || vim.mode === "visualLine"))
          tr.setMeta(vimPluginKey, next instanceof TextSelection ? { mode: "visual", visualAnchor: next.from, visualHead: next.to - 1 } : { mode: "normal", visualAnchor: null, visualHead: null })
        view.dispatch(tr)
        return true
      },
    }
  },

  /**
   * Edit > Select All clicked in the menu bar picks the note whole at once: whoever reaches for the menu wants it
   * all, and the key is the one that steps. Taken from the browser's own select-all (src/preload), which picked
   * from the first words to the last and left out a picture at either end, and in a long note put the ends among
   * blocks not drawn, where the browser looked through every hidden block for where to show them.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          const pickAll = (event: Event): void => {
            if (event.defaultPrevented || !view.hasFocus()) return
            event.preventDefault()
            view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
          }
          window.addEventListener("haligtree:select-all", pickAll)
          return { destroy: () => window.removeEventListener("haligtree:select-all", pickAll) }
        },
      }),
    ]
  },
})
