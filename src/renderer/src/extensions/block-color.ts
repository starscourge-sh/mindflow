import { Extension } from "@tiptap/core"
import { pickedBlocks } from "./picked-blocks"

/** The nine both palettes define, in the order the menu shows them. */
export const BLOCK_COLORS = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const

export type BlockColor = (typeof BLOCK_COLORS)[number]

/** Block types that can carry a colour. Inline containers cannot. */
export const COLORABLE = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
]

/**
 * Blocks that hold a paragraph and are the thing you pointed at.
 *
 * The handle beside a bullet or a quote means that bullet or that quote, not
 * the paragraph inside it, and a tinted row has to take its marker with it.
 */
const WRAPPERS = ["listItem", "taskItem", "blockquote"]

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockColor: {
      /** Colour the block at the cursor. `null` for either clears that half. */
      setBlockColor: (colors: {
        background?: BlockColor | null
        text?: BlockColor | null
      }) => ReturnType
    }
  }
}

/**
 * Colour a whole block, the way Notion does.
 *
 * A mark would only reach the text it covers; this is an attribute on the block
 * itself, so the tint runs the full width and survives editing the text inside
 * it. The value stored is the palette name, not a colour - so a document keeps
 * looking right when the theme flips.
 */
export const BlockColor = Extension.create({
  name: "blockColor",

  addGlobalAttributes() {
    const attribute = (name: string, dataName: string) => ({
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute(dataName),
      renderHTML: (attrs: Record<string, string | null>) =>
        attrs[name] ? { [dataName]: attrs[name] } : {},
    })

    return [
      {
        types: COLORABLE,
        attributes: {
          backgroundColor: attribute("backgroundColor", "data-background"),
          textColor: attribute("textColor", "data-color"),
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockColor:
        ({ background, text }) =>
        ({ state, dispatch }) => {
          const { $from } = state.selection
          const colored = (attrs: Record<string, unknown>) => ({
            ...attrs,
            ...(background !== undefined ? { backgroundColor: background } : {}),
            ...(text !== undefined ? { textColor: text } : {}),
          })

          // Blocks picked as blocks (picked-blocks.ts): every one that holds a colour, in one step.
          const picked = pickedBlocks(state.selection).filter(({ node }) => COLORABLE.includes(node.type.name))
          if (picked.length) {
            if (dispatch) dispatch(picked.reduce((tr, { pos, node }) => tr.setNodeMarkup(pos, undefined, colored(node.attrs)), state.tr))
            return true
          }

          // The block the cursor is in, working outwards from it. Picking the
          // outermost instead tinted a whole list when one bullet was asked
          // for, which is never what the handle beside that bullet meant.
          for (let depth = $from.depth; depth >= 1; depth--) {
            const node = $from.node(depth)
            if (!COLORABLE.includes(node.type.name)) continue

            const parent = depth > 1 ? $from.node(depth - 1) : null
            const at = parent && WRAPPERS.includes(parent.type.name) ? depth - 1 : depth
            const target = $from.node(at)

            if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(at), undefined, colored(target.attrs)))
            return true
          }

          return false
        },
    }
  },
})
