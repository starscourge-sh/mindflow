import { Extension } from "@tiptap/core"
import { AllSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

import { headingRank } from "@/extensions/toggle-heading"
import { cue } from "@/lib/cues"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingFold: {
      /** Fold or unfold the section the caret is in, or the heading at `pos`. */
      toggleFold: (pos?: number) => ReturnType
      /** Fold every heading that has something under it, or unfold them all. */
      foldAll: (fold: boolean) => ReturnType
    }
  }
}

/**
 * Headings that fold, the way Obsidian's do.
 *
 * Folding is only how the note is shown: the hidden blocks get a class, and
 * the document, its Markdown and its undo history never hear about it. Which
 * headings are folded is remembered per note in this window's storage.
 *
 * The caret can't stay inside a folded section: whatever puts it there (the
 * outline, find, a click on a link) unfolds the section first, so nothing can
 * be typed where it can't be seen. The arrow keys step over a folded section
 * instead. Return at the end of a folded heading opens it: any line under a
 * heading belongs to its section, so there is nowhere outside it to write.
 */

/** A heading, and where everything under it ends. */
type Section = { pos: number; node: ProseMirrorNode; body: number; end: number }

type FoldState = { folded: number[]; sections: Section[]; decorations: DecorationSet }

type Meta = { toggle?: number; set?: number[]; redraw?: true }

const key = new PluginKey<FoldState>("headingFold")

let on = true
const views = new Set<EditorView>()
/** The document editor typed in last, for ⌘K's fold all. */
let last: EditorView | null = null

/** Whether headings fold, for every editor on the page at once. */
export function setFoldHeadings(enabled: boolean): void {
  if (on === enabled) return
  on = enabled
  for (const view of views) view.dispatch(view.state.tr.setMeta(key, { redraw: true }))
}

/** Fold or unfold every heading in the note last written in. False with none open. */
export function foldEverything(fold: boolean): boolean {
  const view = last && views.has(last) ? last : [...views].at(-1)
  if (!view || !on) return false
  view.dispatch(view.state.tr.setMeta(key, { set: fold ? foldable(key.getState(view.state)!.sections) : [] }))
  cue(fold ? "fold" : "unfold")
  return true
}

/** Blocks that can hold a heading, so the walk skips the rest. */
const HOLDERS = new Set(["doc", "details", "detailsContent", "blockquote", "callout", "listItem", "taskItem", "bulletList", "orderedList", "taskList"])

/** Every heading, with the blocks it owns: the rest of its parent, up to the next heading of the same rank or higher. */
function sectionsOf(doc: ProseMirrorNode): Section[] {
  const found: Section[] = []
  const walk = (parent: ProseMirrorNode, start: number): void => {
    let pos = start
    parent.forEach((node, offset, index) => {
      pos = start + offset
      if (node.type.name === "heading") {
        const body = pos + node.nodeSize
        let end = body
        for (let i = index + 1; i < parent.childCount; i++) {
          const rank = headingRank(parent.child(i))
          if (rank !== null && rank <= node.attrs.level) break
          end += parent.child(i).nodeSize
        }
        found.push({ pos, node, body, end })
      } else if (HOLDERS.has(node.type.name)) walk(node, pos + 1)
    })
  }
  walk(doc, 0)
  return found
}

/** The headings with something under them to fold. */
const foldable = (sections: Section[]): number[] => sections.filter((one) => one.end > one.body).map((one) => one.pos)

/** What the gutter and the folded heading show. */
function draw(doc: ProseMirrorNode, sections: Section[], folded: number[]): DecorationSet {
  if (!on) return DecorationSet.empty
  const shut = new Set(folded)
  const decorations: Decoration[] = []
  for (const section of sections) {
    if (section.end <= section.body) continue
    const isShut = shut.has(section.pos)
    decorations.push(
      Decoration.widget(section.pos + 1, (view, getPos) => toggle(view, () => (getPos() ?? 1) - 1, section.node.attrs.level, isShut), {
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
        key: `fold-${section.node.attrs.level}-${isShut}`,
      })
    )
    if (!isShut) continue
    decorations.push(
      Decoration.node(section.pos, section.body, { class: "mf-folded" }),
      Decoration.widget(section.body - 1, (view, getPos) => more(view, () => (getPos() ?? 0) + 1), {
        side: 1,
        ignoreSelection: true,
        stopEvent: () => true,
        key: "fold-more",
      })
    )
    doc.nodesBetween(section.body, section.end, (node, pos) => {
      if (pos >= section.body && pos + node.nodeSize <= section.end) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "mf-fold-hidden" }))
      return false
    })
  }
  return DecorationSet.create(doc, decorations)
}

/** Fold or unfold the heading at `pos`, as a click would. */
function flip(view: EditorView, pos: number): void {
  const folded = key.getState(view.state)?.folded.includes(pos)
  view.dispatch(view.state.tr.setMeta(key, { toggle: pos }))
  cue(folded ? "unfold" : "fold")
}

/** The chevron in the gutter, with the heading's level beside it. */
function toggle(view: EditorView, at: () => number, level: number, folded: boolean): HTMLElement {
  const button = document.createElement("span")
  button.className = `mf-fold${folded ? " is-folded" : ""}`
  button.contentEditable = "false"
  button.setAttribute("role", "button")
  button.setAttribute("aria-label", folded ? "Unfold this section" : "Fold this section")
  button.innerHTML = `<span class="mf-fold-level">H${level}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  button.addEventListener("mousedown", (event) => {
    // Down, not click: the caret must not move to the heading on the way.
    event.preventDefault()
    event.stopPropagation()
    flip(view, at())
  })
  return button
}

/** The quiet dots after a folded heading: what is hidden, and a way back to it. */
function more(view: EditorView, body: () => number): HTMLElement {
  const dots = document.createElement("span")
  dots.className = "mf-fold-more"
  dots.contentEditable = "false"
  dots.setAttribute("role", "button")
  dots.setAttribute("aria-label", "Unfold this section")
  // Centred on the line, where "…" sits on its foot.
  dots.textContent = "⋯"
  dots.addEventListener("mousedown", (event) => {
    event.preventDefault()
    event.stopPropagation()
    // The dots sit at the heading's end, one before where its section starts.
    const section = key.getState(view.state)?.sections.find((one) => one.body === body())
    if (section) flip(view, section.pos)
  })
  return dots
}

/** The folded sections hiding `pos`. */
const hiding = (fold: FoldState, pos: number): Section[] =>
  fold.sections.filter((one) => fold.folded.includes(one.pos) && pos >= one.body && pos < one.end)

/** Folds as words, so they still find their headings after the note changes elsewhere. */
const names = (sections: Section[], folded: number[]): string[] =>
  sections.filter((one) => folded.includes(one.pos)).map((one) => `${one.node.attrs.level} ${one.node.textContent.trim()}`)

function remembered(id: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`mf-folds:${id}`) ?? "[]") as string[]
  } catch {
    return []
  }
}

function remember(id: string, folds: string[]): void {
  try {
    if (folds.length) localStorage.setItem(`mf-folds:${id}`, JSON.stringify(folds))
    else localStorage.removeItem(`mf-folds:${id}`)
  } catch {
    // Forgotten next time; folding still works now.
  }
}

/** The headings these words name, each used once, in order. */
function find(sections: Section[], folds: string[]): number[] {
  const left = [...folds]
  return foldable(sections).filter((pos) => {
    const section = sections.find((one) => one.pos === pos)!
    const at = left.indexOf(`${section.node.attrs.level} ${section.node.textContent.trim()}`)
    if (at < 0) return false
    left.splice(at, 1)
    return true
  })
}

export const HeadingFold = Extension.create<{ id: string | null }>({
  name: "headingFold",

  addOptions() {
    return { id: null }
  },

  addCommands() {
    return {
      toggleFold:
        (pos) =>
        ({ state, dispatch }) => {
          const fold = key.getState(state)
          if (!fold || !on) return false
          const at = state.selection.head
          // The heading asked for; else the innermost section around the caret.
          const section =
            pos !== undefined
              ? fold.sections.find((one) => one.pos === pos)
              : fold.sections.filter((one) => at > one.pos && at < one.end).at(-1)
          if (!section || section.end <= section.body) return false
          if (dispatch) {
            const tr = state.tr.setMeta(key, { toggle: section.pos })
            // Folding from inside the section: the caret goes up to its heading.
            if (at >= section.body) tr.setSelection(Selection.near(tr.doc.resolve(section.body - 1), -1))
            dispatch(tr.scrollIntoView())
            cue(fold.folded.includes(section.pos) ? "unfold" : "fold")
          }
          return true
        },
      foldAll:
        (fold) =>
        ({ state, dispatch }) => {
          const now = key.getState(state)
          if (!now || !on) return false
          if (dispatch) {
            const tr = state.tr.setMeta(key, { set: fold ? foldable(now.sections) : [] })
            // Out of what is about to be hidden, up to the heading over it.
            const over = fold ? now.sections.filter((one) => state.selection.head >= one.body && state.selection.head < one.end && one.end > one.body)[0] : null
            if (over) tr.setSelection(Selection.near(tr.doc.resolve(over.body - 1), -1))
            dispatch(tr)
            cue(fold ? "fold" : "unfold")
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    // ⌥⌘[ as in VS Code; ⌘[ alone is Back.
    return { "Mod-Alt-[": () => this.editor.commands.toggleFold() }
  },

  addProseMirrorPlugins() {
    const id = this.options.id
    return [
      new Plugin<FoldState>({
        key,
        state: {
          init: (_, state) => {
            const sections = sectionsOf(state.doc)
            const folded = id ? find(sections, remembered(id)) : []
            return { folded, sections, decorations: draw(state.doc, sections, folded) }
          },
          apply: (tr, fold, _old, state) => {
            const meta = tr.getMeta(key) as Meta | undefined
            if (!tr.docChanged && !meta) return fold
            const sections = tr.docChanged ? sectionsOf(state.doc) : fold.sections
            let folded = fold.folded
            if (tr.docChanged) {
              const open = new Set(foldable(sections))
              folded = folded.map((pos) => tr.mapping.mapResult(pos, 1)).filter((one) => !one.deleted && open.has(one.pos)).map((one) => one.pos)
              // The whole note replaced (a newer copy arriving, an undo across
              // it): its folds are found again by their words.
              if (folded.length < fold.folded.length) folded = [...new Set([...folded, ...find(sections, names(fold.sections, fold.folded))])]
            }
            if (meta?.set) folded = meta.set
            if (meta?.toggle !== undefined) folded = folded.includes(meta.toggle) ? folded.filter((one) => one !== meta.toggle) : [...folded, meta.toggle]
            return { folded, sections, decorations: draw(state.doc, sections, folded) }
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
          handleKeyDown: (view, event) => {
            const fold = key.getState(view.state)
            if (!on || !fold?.folded.length || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false
            const { selection, doc } = view.state
            if (!selection.empty || !selection.$head.parent.isTextblock) return false
            const $head = selection.$head
            const shut = fold.sections.filter((one) => fold.folded.includes(one.pos))

            // Up and down step over a folded section rather than opening it.
            const down = event.key === "ArrowDown"
            if (!view.endOfTextblock(down ? "down" : "up")) return false
            const edge = down ? $head.after() : $head.before()
            const over = shut.filter((one) => (down ? edge >= one.body && edge < one.end : edge > one.body && edge <= one.end))
            if (!over.length) return false
            if (down) {
              const end = Math.max(...over.map((one) => one.end))
              const next = Selection.findFrom(doc.resolve(end), 1, true)
              if (next) view.dispatch(view.state.tr.setSelection(next).scrollIntoView())
            } else {
              const body = Math.min(...over.map((one) => one.body))
              view.dispatch(view.state.tr.setSelection(Selection.near(doc.resolve(body - 1), -1)).scrollIntoView())
            }
            return true
          },
        },
        // Whatever put the caret where it can't be seen opens what hides it.
        appendTransaction: (trs, _old, state) => {
          const fold = key.getState(state)
          if (!on || !fold?.folded.length || state.selection instanceof AllSelection) return null
          if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null
          const opened = hiding(fold, state.selection.head).map((one) => one.pos)
          if (!opened.length) return null
          cue("unfold")
          return state.tr.setMeta(key, { set: fold.folded.filter((one) => !opened.includes(one)) }).setMeta("addToHistory", false)
        },
        view: (view) => {
          views.add(view)
          const focus = (): void => void (last = view)
          view.dom.addEventListener("focus", focus)
          // The note can arrive after the editor (read from Markdown), so the
          // remembered folds are looked for again until there are headings.
          let waiting = !!id && remembered(id).length > 0 && !foldable(key.getState(view.state)!.sections).length
          let saved = id ? JSON.stringify(remembered(id)) : ""
          return {
            update: (_view, previous) => {
              const now = key.getState(view.state)!
              if (waiting && foldable(now.sections).length) {
                waiting = false
                const folded = find(now.sections, remembered(id!))
                if (folded.length) setTimeout(() => !view.isDestroyed && view.dispatch(view.state.tr.setMeta(key, { set: folded })))
                return
              }
              if (!id || waiting || now.folded === key.getState(previous)?.folded) return
              const folds = names(now.sections, now.folded)
              if (JSON.stringify(folds) === saved) return
              saved = JSON.stringify(folds)
              remember(id, folds)
            },
            destroy: () => {
              views.delete(view)
              if (last === view) last = null
              view.dom.removeEventListener("focus", focus)
            },
          }
        },
      }),
    ]
  },
})
