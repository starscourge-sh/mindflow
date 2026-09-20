# Using the editor components

Two components. Both are TipTap editors, but they are built for different jobs
and they do not share an API.

| Component | For | Takes | Emits |
| --- | --- | --- | --- |
| `MindflowEditor` | a whole document | JSON or HTML | JSON, debounced |
| `TitleEditor` | one line of rich text | HTML | `{ text, html, tokens }`, per keystroke |

Everything below is optional. Both components run with no props at all, which is
useful for a first look but not for an app that saves anything.

---

## MindflowEditor

The document surface: headings, lists, tables, code blocks, collapsible
sections, images, embeds, the `/` menu, the drag handle.

```tsx
import { MindflowEditor } from "@/components/mindflow/mindflow-editor"

<MindflowEditor
  defaultContent={note.doc}
  placeholder="Write, type '/' for commands…"
  onChange={(doc) => save(note.id, doc)}
/>
```

### What it takes

`defaultContent` is a TipTap JSON document or an HTML string. It is read **once,
at mount**. Changing the prop later does nothing.

With no `defaultContent` you get an **empty document**. That is deliberate: a
default document would appear while a note was still loading, and the first
keystroke would save it over the real note. Still, do not mount the editor until
your note has arrived.

A document containing a node type this build does not register is dropped in
full, leaving one empty paragraph. TipTap logs a console warning and nothing
else, so validate anything you did not write yourself.

To show a different note, remount it:

```tsx
<MindflowEditor key={note.id} defaultContent={note.doc} onChange={save} />
```

The `key` is what makes this work. Without it React keeps the same editor alive
and you keep editing the old document. This is deliberate: a prop that replaced
the document mid-edit would throw away whatever was being typed.

`placeholder` is the grey text in an empty document. Like `defaultContent`, it
is read once at mount.

### What it emits

`onChange` gives you a JSON document, **500ms after typing stops**.

JSON, not HTML, because the document carries information in node attributes. A
folded heading stores its rank; a coloured block stores its colour name. Those
survive JSON exactly. Round trip verified:

```ts
const doc = editor.getJSON()
editor.commands.setContent(doc)
editor.getJSON()  // identical
```

Debounced because `getJSON()` walks the whole document. On a long note, running
that on every keystroke is real work for a value nobody reads until the typing
stops.

It also flushes on **unmount**, so switching notes with a `key` keeps the last
half second, and on **pagehide**, which is what fires when the window closes.
Closing the window never unmounts React, so without that second hook the final
edit would be lost.

### Worked example: a note that saves

```tsx
function NoteView({ id }: { id: string }) {
  const [note, setNote] = useState<Note | null>(null)

  useEffect(() => {
    loadNote(id).then(setNote)
  }, [id])

  if (!note) return null

  return (
    <MindflowEditor
      key={id}
      defaultContent={note.doc}
      onChange={(doc) => saveNote(id, doc)}
    />
  )
}
```

`key={id}` reloads the editor when you open a different note. `onChange` fires
once after each pause in typing, and once more when the editor goes away. It
fires zero times while you are still typing, because each keystroke restarts the
clock.

---

## TitleEditor

One line. Bold, italic, strikethrough and inline code, and nothing else.

The limit is the **schema**, not a set of hidden buttons. Headings, lists and
code blocks are not registered at all, so they cannot arrive by shortcut, by
markdown, or by pasting. Typing `# ` gives you a literal hash.

It also holds exactly one paragraph. Paste three and they flatten into one line,
joined by spaces, instead of growing the field.

### Two variants

```tsx
import { TitleEditor, type TitleValue } from "@/components/title/title-editor"

// A document title. Large, no chrome, does not steal focus.
<TitleEditor variant="note" placeholder="Untitled" onChange={setDraft} />

// A quick capture field. Input sized, autofocused, Enter commits.
<TitleEditor
  variant="task"
  placeholder="Task name"
  onChange={setDraft}
  onSubmit={createTask}
/>
```

The variants differ in **type scale only**. Neither draws a border or a
background, because the box belongs to whatever you put it in. Your command
palette owns that, not the field.

### What it takes

| Prop | Default | Notes |
| --- | --- | --- |
| `variant` | `"note"` | `"note"` is heading sized, `"task"` is input sized |
| `defaultContent` | `""` | HTML, read once at mount |
| `placeholder` | `"Title"` | also used as the accessible label |
| `autofocus` | `variant === "task"` | a prompt takes the caret, a note title does not |
| `tokens` | `[]` | patterns to highlight as they are typed. Read once at mount, like `defaultContent` |

### What it emits

`onChange` gives you three things on every keystroke. One line of text is small
enough that there is nothing to debounce.

```ts
{
  text: "Pay rent !p1 #home tomorrow",
  html: "Pay rent <strong>!p1</strong> #home tomorrow",
  tokens: [
    { name: "priority", text: "!p1",      value: "1",        from: 10, to: 13 },
    { name: "label",    text: "#home",    value: "home",     from: 14, to: 19 },
    { name: "date",     text: "tomorrow", value: "tomorrow", from: 20, to: 28 },
  ],
}
```

Use `text` to parse, `html` to store with its marks, and `tokens` when you have
given it patterns.

`onSubmit` fires when Enter is pressed. Enter never inserts a newline, because
there is no second line to go to. It is also safe during IME composition, so
accepting a Japanese candidate does not submit the form.

### Highlighting what was typed

Pass `tokens` and anything matching lights up as it is typed, the way Todoist
marks a date or a tag.

```tsx
<TitleEditor
  variant="task"
  placeholder="Task name"
  tokens={[
    { name: "priority", pattern: /!p([1-4])\b/ },
    { name: "label",    pattern: /#([\w-]+)/ },
    { name: "date",     pattern: /\b(today|tomorrow)\b/i },
  ]}
  onChange={setDraft}
/>
```

`name` becomes `data-token` on the highlight, so the stylesheet can colour each
kind. `priority`, `date` and `label` already have colours; anything else gets the
default.

`value` is the **first capture group** if the pattern has one, so `!p1` reports
`"1"` rather than `"!p1"`. That is usually what you want to store.

`from` and `to` are **ProseMirror document positions, not string offsets**. They
are what `tr.delete(from, to)` takes. For a one line title the matching string
index is `from - 1`, so slicing `text` with them directly is off by one.

Where two patterns match the same characters, the one listed first wins and the
other is dropped. Order your patterns most specific first.

`TokenPattern` and `TokenMatch` come from `@/extensions/tokens`.

Two things this does not do, on purpose:

1. **It paints, it does not parse.** Turning `"tomorrow"` into a date is your
   job. Date parsing is a library choice, and the component should not make it
   for you.
2. **It leaves the tokens in the text.** Todoist removes `!p1` once it has been
   recognised. To do that you need the editor, which this component does not
   hand out yet, so strip them from your own copy of the string instead:

```ts
const clean = (v: TitleValue) =>
  v.tokens
    .slice()
    .reverse()
    .reduce((text, t) => text.slice(0, t.from - 1) + text.slice(t.to - 1), v.text)
    .replace(/\s+/g, " ")
    .trim()
```

Reverse order, so removing one token does not shift the next one's position.

The highlights are ProseMirror decorations, not marks. Nothing is written to the
document, so `text` is exactly what was typed and the highlight can never drift
out of step with it. Delete a character of `!p1` and it simply stops matching.

Matching runs over each line's whole text, so a bold run in the middle of a
token does not break it.

### Worked example: a task prompt

```tsx
const PATTERNS = [
  { name: "priority", pattern: /!p([1-4])\b/ },
  { name: "label", pattern: /#([\w-]+)/ },
]

function QuickAdd({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<TitleValue | null>(null)

  const submit = () => {
    if (!draft) return
    const priority = draft.tokens.find((t) => t.name === "priority")?.value
    const labels = draft.tokens
      .filter((t) => t.name === "label")
      .map((t) => t.value)

    createTask({
      title: draft.html,
      priority: priority ? Number(priority) : 4,
      labels,
    })
    onClose()
  }

  return (
    <div className="palette">
      <TitleEditor
        variant="task"
        placeholder="Task name"
        tokens={PATTERNS}
        onChange={setDraft}
        onSubmit={submit}
      />
    </div>
  )
}
```

`.palette` draws the box. The field autofocuses, Enter creates the task, and
Escape is yours to handle since the component does not claim it.

`PATTERNS` is defined outside the component on purpose. A fresh array on every
render would be a new prop every time.

---

## Commands

These are what the menus run. Neither component hands the host a reference to
its editor yet, so you cannot call them from outside; they are documented so you
know what the UI does and can reuse them when you add your own items to
`slashItems`.

```ts
editor.commands.toggleHeadingSection()       // fold or unfold at the cursor
editor.commands.toggleHeadingSection(pos)    // fold or unfold a known block
editor.commands.setBlockColor({ background: "blue" })
editor.commands.setBlockColor({ text: "red", background: null })
editor.commands.enterInsertMode()            // leave vim normal mode
```

### toggleHeadingSection

One command, three behaviours, picked from what the block is.

| Block at the cursor | Result |
| --- | --- |
| A heading | Folds it **with its section**: every block below it, up to the next heading of the same rank or higher |
| Any other block | That block becomes the title, with an empty body to fill in |
| An already folded section | Unfolds it, restoring the heading at its original rank |

Unfolding only works for a section whose head **was** a heading. One made from a
plain block has no rank to restore, so the command returns `false` and leaves it
alone. Use `editor.commands.unsetDetails()` for those, or the Text entry in the
Turn into menu.

So folding an H1 swallows its H2s and their paragraphs, and stops at the next
H1. Folding an H2 that sits above an H1 gets an empty body, because the H1
outranks it.

It works inside containers too. Folding a heading inside a blockquote or a table
cell puts the section inside that container, verified in the running app.

It returns `false` and changes nothing when the surrounding node cannot hold a
section at all, so a failed call is always a no-op rather than a broken
document.

Folding keeps the text and the heading rank. It does **not** keep block
alignment or block colour: `details` does not declare those attributes, so they
are dropped and unfolding does not bring them back.

### setBlockColor

Colours the whole block, not the selection. Nine colours:

```
gray  brown  orange  yellow  green  blue  purple  pink  red
```

Pass `null` to clear one half. It stores the **name**, not a colour value, so a
coloured document still reads correctly when the theme flips.

It colours the outermost block that can take a colour, so colouring inside a
list tints the whole list rather than the one item.

---

## Adding to the `/` menu

`slashItems` is one list, used by both the `/` menu and the handle's Turn into
menu. Add an entry and it shows up in both.

```ts
{
  title: "Callout",
  group: "Basic blocks",
  hint: "!",             // the markdown shortcut, shown on the right
  icon: <CalloutIcon />,
  turnInto: true,        // also offer it under Turn into
  run: (editor) => editor.chain().focus().setCallout().run(),
}
```

`turnInto: true` means the item **converts the current block**. Leave it off for
anything that inserts something new, such as a divider or an image.

For an item that needs a value first, set `prompt`. The menu swaps to an input
and hands you the answer:

```ts
{
  title: "Audio",
  group: "Media",
  prompt: "Paste an audio link",
  run: (editor, src) => editor.chain().focus().setAudio({ src }).run(),
}
```

---

## Images

Every picture that reaches the editor is **copied into the app's own store** and
the document keeps a `mindflow://assets/<hash>.<ext>` URL. Nothing in a saved
note points at the user's disk, and nothing points at someone else's server.

Four ways in, all ending at the same place:

| Gesture | What happens |
| --- | --- |
| Drag a file from Finder | Stored, inserted where you dropped it |
| Paste an image, from "Copy Image" or a screenshot | Stored, inserted at the cursor |
| Drag an image off a web page | Fetched, stored, inserted |
| The `/` menu, or the toolbar's Add button | An empty image block, with a panel to fill it |

The empty block is a real node in the document, so the spot is yours before you
have found the picture. Its panel has two tabs: a file to upload, or a link to
copy. Drop a file straight onto the empty block and it fills in rather than
landing beside it.

### Limits

Images are addressed by the **hash of their bytes**, so the same screenshot
dropped into three notes is stored once, and a pasted image needs no filename.

| Rule | Why |
| --- | --- |
| `png` `jpeg` `gif` `webp` `avif` `bmp` `apng` `svg` `ico` | What the app can actually render |
| The file must not be empty | A zero byte image is a node that can never draw |

Anything else that is dropped in becomes an **attachment** instead, which has no
type restriction at all.

Anything refused is reported rather than dropped in silence. Wire it up if you
want it in front of the user, since the default writes to the console:

```tsx
ImageDrop.configure({
  onError: (problems) => toast(problems.join("\n")),
})
```

Nothing sweeps the store yet. Deleting an image from a note leaves its file
behind, so a long lived document set will grow. That is a job for whoever owns
the notes, not for the editor.

---

## Embedding either component elsewhere

Both are built to drop into another app, so they style their own subtree and
nothing outside it.

What you need to know:

- Neither sets a page background, a font, or `html`/`body` styles. The host
  keeps its own.
- Both import the design tokens they need.
- `MindflowEditor` also expects **Tailwind** and its two fonts from the host.
  Without Tailwind the find bar loses its layout and the toolbar loses its
  spacing. `TitleEditor` has no such dependency.
- `MindflowEditor` owns its scroll container, so give it a sized parent.
- The menus mount on `document.body`, which is why the colour tokens are defined
  on `:root`.

Two open caveats, both worth knowing before you build panels around this:

1. The outline, the word count and the find bar use `position: fixed`. They
   anchor to the **window**, not to the editor. In a side panel they will sit in
   the wrong place.
2. `ThemeToggle` writes theme classes on the document root. Embedded, that
   flips the **host app's** theme, not just the editor's. It cycles four:
   `dark`, `gruvbox`, `kanagawa` and `tokyonight`. Every one of them carries
   `dark` as well, since they are all dark themes in different paint, and the
   choice is kept in `localStorage` under `theme`. Each one past `dark` also
   sets four accent tokens, `--mf-heading`, `--mf-accent-ink`, `--mf-code-ink`
   and `--mf-quote-ink`, which colour headings, list markers, inline code and
   the quote bar. Prose carries no syntax to highlight, so without them a
   document reads as one flat hue. `dark` sets none of them and every use site
   falls back to the colour it already had.

---

## Attachments

Any file that is not an image becomes a card showing its name and size, which
opens on double click and has a button to save a copy somewhere.

They share the image store: bytes are addressed by their hash, so the same file
in three notes is one file on disk. That store has no room for a filename, which
is why the name and size are kept on the node instead.

Drop one in, or use `/` and pick **File**.

A card holding a picture offers **Show as image** in the drag handle menu, since
the file picker makes a card out of anything.

---

## Linking to another note

Type `@`, pick a note, and you get a link. Clicking it opens that note.

The editor does not know what a note is. It holds an id and reports the click,
and the app decides what to do:

```tsx
<MindflowEditor
  findNotes={(query) => notes.filter((n) => n.title.includes(query))}
  onOpenNote={(id) => open(id)}
/>
```

Without `findNotes`, `@` simply finds nothing. The link stores the note's title
alongside its id on purpose: a link has to read as something when the note it
points at has been renamed, or is gone.

---

## Exporting

`/` then **Export as** offers four formats.

| Format | Made by | Notes |
| --- | --- | --- |
| Markdown | `@tiptap/markdown` | Toggles, attachments and block colour have no markdown form and are flattened |
| PDF | Chromium, in the main process | Laid out by the same engine that drew it on screen |
| JSON | `editor.getJSON()` | Exact. This is what gets stored |
| HTML | `editor.getHTML()` | Loses node attributes that JSON keeps |

From code:

```ts
import { exportDocument } from "@/lib/export"
await exportDocument(editor, "markdown", note.title)
```

It resolves `false` when the save dialog was dismissed, which is not an error.

---

## Seeing what is stored

**⌘⌥S**, or the braces button in the toolbar, opens a panel beside the document
showing its JSON and every file it points at. That is what a save writes, so it
is the honest answer to "what am I actually keeping".

From code, `useNotes()` hands you the open note's files already worked out:

```tsx
const { note, assets } = useNotes()

assets                      // [{ src, kind: "image" | "attachment", name?, size? }]
assets.filter(isStored)     // only the app's own files, not remote ones
```

For any other note, or a document you are holding yourself:

```ts
import { assetsOf, isStored } from "@/lib/document"

assetsOf(someNote.doc)
```

It is worked out from the document every time rather than saved alongside it.
A saved list goes stale the moment someone deletes a picture, and a stale
backup list is worse than none.

Deduplicated by `src`, because the same picture twice in one document is still
one file. Remote images are included rather than hidden, so a document that has
not been fully localised is visible.

---

## Locking

The padlock in the toolbar calls `editor.setEditable(false)`. The caret still
moves and text can still be selected and copied; nothing can change it, and the
menus that would change it stop offering.

---

## Holding notes in state

`useNotes()` is the whole surface an app needs around the two editors.

```tsx
const { notes, note, assets, open, create, remove, save } = useNotes()

<TitleEditor key={note.id} defaultContent={note.titleHtml} onChange={({ text, html }) =>
  save({ title: text, titleHtml: html })} />

<MindflowEditor key={note.id} defaultContent={note.doc} onChange={(doc) => save({ doc })} />
```

`notes` is the list; a board or a task view is the same list rendered
differently. Nothing in the hook knows where notes are kept, so changing the
store means changing `window.api.notes` and nothing else.

Two things it handles that are easy to get wrong. A save queued just before you
switch notes carries its note's id, so it cannot land on the one you switched
to. And documents are written straight through while titles are held for 400ms,
because the editor already waits for a pause in typing and the title does not.

The `key` is what makes switching work: both editors read their content once, at
mount. Give them **different** keys, as above. Two siblings sharing one key is
the kind of thing React cannot warn about here, and it reconciles them wrongly:
switching notes mounted a new title editor without ever taking the old one
down, so they stacked up one per switch.
