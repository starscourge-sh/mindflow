import { Extension } from "@tiptap/core"
import { NodeSelection, Selection } from "@tiptap/pm/state"
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggleHeadingSection: {
      /**
       * Make a block the head of a collapsible section, or unfold one that
       * already is. Pass the block's position, or leave it out to use the
       * cursor's.
       */
      toggleHeadingSection: (pos?: number) => ReturnType
    }
  }
}

/**
 * The rank a node counts as when deciding where a section ends.
 *
 * A folded heading is a `details`, so it has to rank like the heading it was -
 * otherwise folding an H1 above an already-folded H2 swallows it.
 */
export function headingRank(node: ProseMirrorNode): number | null {
  if (node.type.name === "heading") return node.attrs.level
  if (node.type.name !== "details") return null
  // On the content, not the summary - see the extension wiring for why.
  return node.childCount > 1 ? (node.child(1).attrs.level ?? null) : null
}

/** The textblock at `pos`, or the one holding the cursor. */
function textblockAt(
  doc: ProseMirrorNode,
  pos: number | undefined,
  selection: Selection
): { node: ProseMirrorNode; pos: number } | null {
  if (pos !== undefined) {
    if (pos < 0 || pos > doc.content.size) return null
    const node = doc.nodeAt(pos)
    return node?.isTextblock ? { node, pos } : null
  }

  const { $from } = selection
  return $from.parent.isTextblock
    ? { node: $from.parent, pos: $from.before($from.depth) }
    : null
}

/** The nearest ancestor of `name` at `pos`, or around the selection. */
function blockAt(
  doc: ProseMirrorNode,
  name: string,
  pos: number | undefined,
  selection: Selection
): { node: ProseMirrorNode; pos: number } | null {
  if (pos !== undefined) {
    // A stale position from a menu would otherwise throw out of the command.
    if (pos < 0 || pos > doc.content.size) return null
    const node = doc.nodeAt(pos)
    return node?.type.name === name ? { node, pos } : null
  }

  if (selection instanceof NodeSelection && selection.node.type.name === name) {
    return { node: selection.node, pos: selection.from }
  }

  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) {
      return { node: $from.node(depth), pos: $from.before(depth) }
    }
  }
  return null
}

/**
 * Collapsible headings, the way an outline actually works.
 *
 * `setDetails` folds whatever you selected. A heading needs no selection: its
 * section is everything after it up to the next heading of the same rank or
 * higher, which is the rule people already have in their heads.
 *
 * The level lives on the CONTENT node. It cannot live on the details, whose
 * attributes the extension's toggle button rewrites as `{ open }` alone, nor on
 * the summary, which `clearNodes` resets whenever a `setNode` runs anywhere in
 * the section. Both were measured in the running app.
 */
export const ToggleHeading = Extension.create({
  name: "toggleHeading",

  addCommands() {
    return {
      toggleHeadingSection:
        (pos) =>
        ({ state, dispatch }) => {
          const { doc, schema } = state
          if (!schema.nodes.details) return false

          // Only unfold the section the caret is actually titling - from a body
          // paragraph the heading under the cursor is the one to fold.
          const inSummary =
            state.selection.$from.parent.type.name === "detailsSummary"
          const folded =
            pos !== undefined || inSummary
              ? blockAt(doc, "details", pos, state.selection)
              : null

          if (folded) {
            const [summary, body] = [folded.node.child(0), folded.node.child(1)]
            const level = headingRank(folded.node)
            // A section that was a heading goes back to being one. A section
            // made from anything else has no rank to restore, so it comes back
            // as plain text - which is what makes the command round trip
            // instead of dead ending on whatever it folded.
            const head =
              level === null
                ? schema.nodes.paragraph.create(summary.attrs, summary.content)
                : schema.nodes.heading.create(
                    { ...summary.attrs, level },
                    summary.content
                  )
            if (dispatch) {
              dispatch(
                state.tr.replaceWith(
                  folded.pos,
                  folded.pos + folded.node.nodeSize,
                  // An untouched body is the empty paragraph folding had to
                  // put there; giving it back would leave a blank line behind.
                  Fragment.from(head).append(
                    body.childCount === 1 && body.firstChild?.content.size === 0
                      ? Fragment.empty
                      : body.content
                  )
                )
              )
            }
            return true
          }

          // Any textblock can head a section, not just a heading.
          const target =
            blockAt(doc, "heading", pos, state.selection) ??
            textblockAt(doc, pos, state.selection)
          if (!target) return false

          const level: number | null = headingRank(target.node)
          const $start = doc.resolve(target.pos)
          const parent = $start.parent

          // A heading owns everything under it, up to the next heading of the
          // same rank or higher - folded ones included. Anything else owns only
          // itself: it becomes the title, with an empty body to fill in.
          let end = target.pos + target.node.nodeSize
          if (level !== null) {
            for (let i = $start.index() + 1; i < parent.childCount; i++) {
              const child = parent.child(i)
              const rank = headingRank(child)
              if (rank !== null && rank <= level) break
              end += child.nodeSize
            }
          }

          // `detailsContent` is `block+`, so an empty section still needs one
          // block to put the caret in.
          const body = doc.slice(target.pos + target.node.nodeSize, end).content
          const content = body.childCount
            ? body
            : Fragment.from(schema.nodes.paragraph.create())

          // The schema drops attributes a node does not declare, so passing the
          // heading's own is safe - but it also means alignment and block
          // colour do NOT survive a fold, because `details` declares neither.
          const details = schema.nodes.details.create(
            { ...target.node.attrs, open: true },
            [
              schema.nodes.detailsSummary.create(
                target.node.attrs,
                target.node.content
              ),
              schema.nodes.detailsContent.create(
                { ...target.node.attrs, level },
                content
              ),
            ]
          )

          // The parent has to accept a details WHERE THE HEADING SITS - the
          // type's opening content match is not the same question.
          if (
            !parent.canReplaceWith(
              $start.index(),
              doc.resolve(end).index(),
              details.type
            )
          ) {
            return false
          }

          if (dispatch) {
            const tr = state.tr.replaceWith(target.pos, end, details)
            // Land in the title, at the same offset along it. Otherwise the
            // caret is left wherever the replacement put it, and the same key
            // pressed again folds the next block instead of unfolding this one.
            const offset = Math.min(
              Math.max(0, state.selection.from - target.pos - 1),
              details.child(0).content.size
            )
            tr.setSelection(Selection.near(tr.doc.resolve(target.pos + 2 + offset)))
            dispatch(tr.scrollIntoView())
          }
          return true
        },
    }
  },
})
