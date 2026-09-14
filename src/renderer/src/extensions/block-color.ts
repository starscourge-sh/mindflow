import { Extension } from "@tiptap/core"

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
const COLORABLE = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "taskList",
]

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

          // The outermost colourable ancestor, so colouring inside a list tints
          // the list rather than the one item.
          for (let depth = 1; depth <= $from.depth; depth++) {
            const node = $from.node(depth)
            if (!COLORABLE.includes(node.type.name)) continue

            if (dispatch) {
              dispatch(
                state.tr.setNodeMarkup($from.before(depth), undefined, {
                  ...node.attrs,
                  ...(background !== undefined
                    ? { backgroundColor: background }
                    : {}),
                  ...(text !== undefined ? { textColor: text } : {}),
                })
              )
            }
            return true
          }

          return false
        },
    }
  },
})
