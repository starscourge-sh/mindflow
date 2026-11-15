import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"

/** The block the grip stands by: where it starts, and its kind; null with none. */
type Kept = { pos: number; name: string } | null

/**
 * The grip lets its block go when a change takes the block away (⌘A and ⌫, a cut, a paste over it), as it does after
 * a block is carried. Kept, the grip's own plugin placed it again beside whatever then stood at that place, laying
 * the page out for a block that was gone (on the largest note's ⌘A ⌫, a fifth of a second). Its record goes with the
 * block (haligtree-editor.tsx `followBlock`), and the grip with it, in the same change.
 */
export const GripLetsGo = Extension.create<{ kept: () => Kept }>({
  name: "gripLetsGo",

  addOptions: () => ({ kept: () => null }),

  addProseMirrorPlugins() {
    const kept = this.options.kept
    return [
      new Plugin({
        appendTransaction: (transactions, old, state) => {
          const block = kept()
          if (!block || !transactions.some((tr) => tr.docChanged)) return null
          // Only a record that still names its block in the note as it was before the change.
          if (block.pos < 0 || block.pos >= old.doc.content.size || old.doc.nodeAt(block.pos)?.type.name !== block.name) return null
          let pos = block.pos
          for (const tr of transactions) {
            const one = tr.mapping.mapResult(pos, 1)
            if (one.deleted) return state.tr.setMeta("hideDragHandle", true)
            pos = one.pos
          }
          return null
        },
      }),
    ]
  },
})
