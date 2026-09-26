# Extending it

Where things live, how to get them back, and how to add your own block.

`docs/components.md` is the API. `docs/notes.md` is the storage. This is the
map between them.

---

## Where everything is

Two folders under Electron's `userData`, and nothing else - no database, no
settings file.

```
notes/     one <id>.json per note: the TipTap document, its title, when it was opened
assets/    one file per picture or attachment, named by the hash of its bytes
```

The same picture in three notes is one file, because the name **is** the
hash. A note points at it with a `mindflow://assets/<hash>.<ext>` URL, which
`src/main/index.ts` serves.

Adding a kind of thing to store? It goes in `assets/` if it is bytes, and in
the note's JSON if it is not. Do not add a third folder before you have to.

---

## Getting it back

```ts
const notes = await window.api.notes.list()   // every note, metadata only
const note  = await window.api.notes.open(id) // one, with its document
```

Or from React, which handles the debounced saving for you:

```tsx
const { notes, note, assets, open, create, remove, save } = useNotes()
```

`assets` is every file the open note points at - the list to back up, and the
list to check before deleting anything. It comes from `assetsOf(doc)`, which
walks the JSON, so you can ask it about a note that is not open:

```ts
import { assetsOf, isStored } from "@/components/mindflow"

assetsOf(note.doc).filter(isStored)
// [{ src: "mindflow://assets/9f2…png", kind: "image" }, …]
```

Tags work the same way - `tagsOf(note.doc)` reads stored JSON and tells you
which tags a note uses, without opening it.

---

## Adding your own block

**You write React.** The array syntax is not where the UI lives.

A node has two renderers and they do different jobs:

- **`addNodeView`** is what you see on screen. It is a React component.
- **`renderHTML`** is the clipboard and the export. Nobody looks at it; it
  only has to be something `parseHTML` can read back.

So `["div", mergeAttributes(…), 0]` is one line you write once and never
touch. It is not the component.

### The whole recipe

```tsx
// extensions/sticky.ts
import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { StickyView } from "@/components/sticky/sticky-view"

export const Sticky = Node.create({
  name: "sticky",
  group: "block",
  atom: true,                       // leave out if people type inside it
  // content: "block+",             // …and add this instead

  addAttributes() {
    return {
      note: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note"),
        renderHTML: ({ note }) => ({ "data-note": note }),
      },
    }
  },

  parseHTML: () => [{ tag: "div[data-sticky]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-sticky": "" }),
    0,                              // drop the 0 if it is an atom
  ],

  // Without this the block leaves a markdown export silently.
  renderMarkdown: (node) => `> ${node.attrs?.note ?? ""}`,

  addNodeView: () => ReactNodeViewRenderer(StickyView),
})
```

```tsx
// components/sticky/sticky-view.tsx
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

export function StickyView(props: NodeViewProps): React.JSX.Element {
  const { note } = props.node.attrs

  return (
    <NodeViewWrapper className="tiptap-sticky">
      <button onClick={() => props.updateAttributes({ note: "changed" })}>
        {note || "empty"}
      </button>
      {/* only if it has content */}
      <NodeViewContent />
    </NodeViewWrapper>
  )
}
```

Then register it and offer it:

```tsx
// mindflow-editor.tsx, in the extensions array
Sticky,

// slash-items.tsx
{
  title: "Sticky",
  group: "Basic blocks",
  icon: <StickyIcon />,
  run: (editor) => editor.chain().focus().insertContent({ type: "sticky" }).run()
}
```

### The four things that bite

**Attributes are strings in HTML.** Anything else - an object, a number -
needs `JSON.stringify` in `renderHTML` and a `try/catch` parse the other way,
or it comes back as `[object Object]`.

**An interactive block needs `stopEvent`.** A canvas or a text input inside a
node view will have its keystrokes eaten by the editor otherwise:

```ts
ReactNodeViewRenderer(StickyView, {
  stopEvent: ({ event }) =>
    (event.target as HTMLElement)?.closest(".my-canvas") != null,
})
```

**`draggable: true` makes every pixel a drag source.** Fine for a card, wrong
for anything you draw or type on - the drag handle in the gutter moves the
block without it.

**No `renderMarkdown` means the block vanishes from a markdown export**,
silently, along with everything inside it. Check `src/renderer/src/extensions/`
- every block there has one.

---

## Adding to the `/` menu

`components/slash/slash-items.tsx` is a flat list. `when` hides an entry where
it would not work:

```tsx
{ title: "Row above", group: "Table", when: (editor) => isInTable(editor.state), run: … }
```

`turnInto: true` also puts it in the drag handle's "Turn into" menu.

---

## Adding a theme

Six blocks, all following the ones already there:

| Where | What |
|---|---|
| `assets/main.css` | the chrome tokens Tailwind reads |
| `assets/styles/_variables.scss` | surfaces, brand ramp, the nine block colours, their highlights, the vim caret, the prose accents |
| `components/mindflow/theme-toggle.tsx` | the name and its icon |

Colours are always one of the nine palette **names**, never a hex, so anything
using them stays readable when the theme changes underneath.

---

## What the editor asks of the app

Storing a picture, reading a link, handing a file to the system - the editor
does none of it itself. It calls `host()`, and `src/renderer/src/lib/host.ts`
is the whole list. Add a capability there, make it optional, and hide whatever
offers it when the host has not supplied it.
