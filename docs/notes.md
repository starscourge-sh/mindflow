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

## Reading the TypeScript in App.tsx

If the types look like noise, here is every piece of them, one at a time.

### Borrowing a type instead of writing one

```ts
type Note = Awaited<ReturnType<typeof window.api.notes.open>>
```

Read it inside out.

`window.api.notes.open` is a function. `typeof` in front of it says "not the
function, the shape of it". Without `typeof` you would be pointing at the
function itself, which is a value, and a type cannot be built out of a value.

`ReturnType<...>` then asks "what does calling it give back?". The answer is
`Promise<Note>`, because `open` is async.

`Awaited<...>` opens the promise and takes what is inside. So the whole line
means: **whatever `open` eventually hands back, call that a `Note`.**

The point is that nobody writes the shape of a note twice. It is described once,
in the main process, and this line follows the chain back to it. Add a field
there and this side knows about it with no edit at all.

### Picking one argument out of a function

```ts
type Patch = Parameters<typeof window.api.notes.save>[1]
```

Same `typeof` trick. `Parameters<...>` gives you the function's arguments as a
numbered list, so for `save(id, patch)` you get `[string, NotePatch]`.

`[1]` takes the second one, counting from zero. So `Patch` is the type of the
second argument to `save`, borrowed rather than restated.

### Angle brackets are just arguments

`useState`, `useRef` and the helpers above all take arguments in angle brackets
the same way a function takes them in round ones. `Awaited<X>` is "run Awaited
on X". They only run while the code is being checked, and vanish before it
executes.

```ts
const [note, setNote] = useState<Note | null>(null)
```

The `|` means "or". `Note | null` is "a note, or nothing". That is not a detail,
it is the whole contract: there is no note until one loads, so the compiler
makes you handle the empty case everywhere you touch it. Take the `| null` out
and the editor crashes on the first render, which is exactly what happened here
once.

### Types written in place

```ts
const held = useRef<{ id: string; patch: Patch } | null>(null)
```

`{ id: string; patch: Patch }` is an object shape written where it is used
rather than given a name of its own. It says: an object with an `id` that is
text, and a `patch` of the type we borrowed earlier. Naming it would be fine
too, but it is used once, so there is nothing to gain.

Holding the id next to the patch is the point of the whole line. A save that is
waiting when you switch notes must still know which note it belongs to.

### A type you cannot name

```ts
const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
```

`setTimeout` returns something you pass to `clearTimeout` later. In a browser it
is a number. In Node it is an object. Writing `number` compiles in one place and
fails in the other, so instead of guessing, this asks the same question as
before: whatever `setTimeout` gives back, that is what goes in here.

### `void` in front of a call

```ts
if (pending) void window.api.notes.save(pending.id, pending.patch)
```

This `void` is not the type. It is an instruction to throw the result away.

`save` is async, so it hands back a promise. Normally you would wait for it.
Here nobody is waiting: the write goes out and the app carries on. Writing
`void` in front says that is deliberate, and stops the linter asking whether a
promise was forgotten.

### Annotating an async function

```ts
const show = useCallback(
  async (next: Promise<Note>): Promise<void> => {
    flush()
    const opened = await next
    setNote(opened)
    setTitle(opened.title)
  },
  [flush]
)
```

`next: Promise<Note>` is the argument: not a note, but a note that is still on
its way. That is why the caller can write `show(window.api.notes.open(id))`
without awaiting anything itself.

`: Promise<void>` after the brackets is what comes back. `void` here **is** the
type, and it means "nothing useful". Every `async` function returns a promise
whether you say so or not, so this is a note to the reader more than to the
compiler.

`await next` waits for the note to arrive. Everything above the `await` runs
immediately, which is why `flush()` sits there: the note being left is written
out before the new one can replace it.

`[flush]` at the end belongs to React, not TypeScript. It says this function only
needs rebuilding if `flush` changes.

### Running it once, on the way in

```ts
useEffect(() => {
  void show(window.api.notes.open())
}, [show])
```

This is the line that opens a note when the app starts. `useEffect` runs its
function after the screen has been drawn, which is where work that reaches
outside React belongs.

The `[show]` at the end is the same idea as `[flush]` above: the list of things
the effect depends on. React re-runs the effect when one of them changes, and
`show` is built by `useCallback` with a stable identity, so in practice this
runs once.

`window.api.notes.open()` is called with no argument on purpose. The main
process reads that as "the note I was last working on", and makes one if the
store is empty, so there is always somewhere to type.

`void` here is doing a different job to the one further up. It is not only that
nobody is waiting. **An effect must not return a promise.** React treats
whatever an effect returns as a cleanup function, to be called when the effect
is torn down. You can see a real one a few lines below in the same file:

```ts
useEffect(() => {
  window.addEventListener('pagehide', flush)
  return () => {
    window.removeEventListener('pagehide', flush)
    flush()
  }
}, [flush])
```

That returned function is the cleanup. React calls it when the component goes
away, which is why this one both unhooks the listener and flushes one last time.

So writing `useEffect(async () => ...)` would hand React a promise where it
expects a function, and it would try to call it. Making the effect itself
ordinary, and discarding the promise inside with `void`, is the way around that.

## Known gaps

- A note file holds its whole document, so saving a title rewrites the document
  with it. On a very long note that is a larger write than it looks.
- Deleting a note leaves any images it used in the asset store. Nothing sweeps
  them yet.
- The last few hundred milliseconds of typing are written on `pagehide`. That is
  an asynchronous message, so a hard kill can still outrun it.
