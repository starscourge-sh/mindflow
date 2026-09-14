# Notes

Every note is a file. `~/Library/Application Support/mindflow/notes/<id>.json` on
macOS, and the equivalent user data directory elsewhere.

```json
{
  "id": "9f3c...",
  "title": "Groceries",
  "titleHtml": "<strong>Groceries</strong>",
  "characters": 13,
  "pinned": false,
  "openedAt": 1789400000000,
  "doc": { "type": "doc", "content": [] }
}
```

There is no index file. The main process reads the directory once and keeps the
notes in memory, so listing them does not re-read every document, but the files
are the truth. Delete one by hand and it is gone. Edit one by hand and it is
read back. A file that will not parse is skipped rather than taking the whole
list down with it.

Writes go to a temporary name and are renamed into place, so a crash cannot
leave half a note behind.

## What the renderer can do

```ts
window.api.notes.list()               // metadata only, pinned first, then recent
window.api.notes.open(id?)            // the whole note, and stamps openedAt
window.api.notes.create()             // a new empty note
window.api.notes.save(id, patch)      // title, titleHtml, doc or pinned
window.api.notes.remove(id)           // gone, with nothing to undo it
```

`open` with no id gives you the note last worked on. If the store is empty it
makes one, so there is always somewhere to type. The same is true of an id that
no longer exists, which is what happens when you delete the note you are in.

`save` takes a partial. Only the fields you pass are written. Passing `doc` also
recounts `characters`, because the count is what the list shows and it should
never disagree with the document.

## Worked example: switching notes

```tsx
const [note, setNote] = useState<Note | null>(null)

const show = async (next: Promise<Note>) => {
  flush()                 // whatever is still held goes out under the old id
  setNote(await next)
}

useEffect(() => { void show(window.api.notes.open()) }, [])
```

Two things matter here.

**Flush before switching.** The title editor reports every keystroke, so its
writes are held back for a moment. That pending write belongs to the note you
are leaving. Send it before the id changes or it lands on the wrong note.

**Key the editors by note id.** Both editors read their content once, at mount.
A changed `key` is what makes a different note a different editor:

```tsx
<MindflowEditor key={note.id} defaultContent={note.doc} onChange={...} />
```

Without it you keep editing the old document under a new name.

## Saving

The two editors are saved differently on purpose.

| Editor | When it reports | What the app does |
| --- | --- | --- |
| `MindflowEditor` | 500ms after typing stops | writes straight through |
| `TitleEditor` | every keystroke | waits 400ms, then writes |

Debouncing the document twice would only add latency, since the editor already
waits for a pause. Debouncing the title is what stops one write per character.

## Known gaps

- A note file holds its whole document, so saving a title rewrites the document
  with it. On a very long note that is a larger write than it looks.
- Deleting a note leaves any images it used in the asset store. Nothing sweeps
  them yet.
- The last few hundred milliseconds of typing are written on `pagehide`. That is
  an asynchronous message, so a hard kill can still outrun it.
