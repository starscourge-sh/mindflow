import { useRef, useState } from "react"
import { Files, Pin, PinOff, Trash2 } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover"

/** Read off the bridge, so the two sides of it cannot drift apart. */
type NoteMeta = Awaited<ReturnType<typeof window.api.notes.list>>[number]

/** "1 minute ago", down to the minute. Anything older is a plain date. */
function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  if (hours < 48) return "yesterday"
  if (hours < 24 * 7) return `${Math.round(hours / 24)} days ago`
  return new Date(at).toLocaleDateString()
}

/** Every note, searchable. */
export function NotesMenu({
  currentId,
  onPick,
}: {
  currentId: string | null
  /** Open this note. Deleting the open one passes nothing, meaning "any note". */
  onPick: (id: string | undefined) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const reload = (): Promise<void> => window.api.notes.list().then(setNotes)

  const term = query.trim().toLowerCase()
  const shown = notes.filter((note) =>
    (note.title || "Untitled").toLowerCase().includes(term)
  )
  const at = Math.min(active, Math.max(shown.length - 1, 0))

  const pick = (id: string | undefined): void => {
    setOpen(false)
    onPick(id)
  }

  const pin = async (note: NoteMeta): Promise<void> => {
    await window.api.notes.save(note.id, { pinned: !note.pinned })
    await reload()
  }

  const remove = async (note: NoteMeta): Promise<void> => {
    // Nothing brings a note back, so one with anything in it asks first.
    const named = note.title || "Untitled"
    if (note.characters && !confirm(`Delete "${named}"? This cannot be undone.`)) {
      return
    }

    await window.api.notes.remove(note.id)
    // Deleting the note you are in leaves nowhere to type, so open another.
    if (note.id === currentId) pick(undefined)
    else await reload()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Read on the way open rather than held between times, so the list
        // cannot go stale against a note just renamed or typed in.
        if (next) {
          setQuery("")
          setActive(0)
          void reload()
        }
      }}
    >
      <PopoverTrigger
        aria-label="Notes"
        className="rounded-full p-1.5 hover:bg-background"
      >
        <Files className="size-4" />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="notes-menu w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground"
        onOpenAutoFocus={(event) => {
          // Radix would focus the first row; the search field is where typing
          // should land.
          event.preventDefault()
          input.current?.focus()
        }}
      >
        <input
          ref={input}
          value={query}
          placeholder="Search for notes..."
          className="w-full border-b bg-transparent px-3 py-2.5 text-sm outline-none"
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              const step = event.key === "ArrowDown" ? 1 : -1
              setActive((was) => (was + step + shown.length) % (shown.length || 1))
            }
            if (event.key === "Enter" && shown[at]) pick(shown[at].id)
          }}
        />

        <div className="max-h-72 overflow-y-auto p-1.5">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Notes</div>

          {shown.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              No notes match.
            </div>
          ) : null}

          {shown.map((note, index) => (
            <div
              key={note.id}
              data-active={index === at ? "" : undefined}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent data-active:bg-accent"
              onMouseEnter={() => setActive(index)}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => pick(note.id)}
              >
                <div className="truncate text-sm">{note.title || "Untitled"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {note.id === currentId ? (
                    <span className="text-primary">Current</span>
                  ) : (
                    `Opened ${ago(note.openedAt)}`
                  )}
                  {` • ${note.characters} characters`}
                </div>
              </button>

              <button
                type="button"
                aria-label={note.pinned ? "Unpin" : "Pin"}
                className="rounded p-1 opacity-0 hover:bg-background group-hover:opacity-100 group-data-active:opacity-100 data-pinned:opacity-100"
                data-pinned={note.pinned ? "" : undefined}
                onClick={() => void pin(note)}
              >
                {note.pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
              </button>

              <button
                type="button"
                aria-label="Delete"
                className="rounded p-1 opacity-0 hover:bg-background group-hover:opacity-100 group-data-active:opacity-100"
                onClick={() => void remove(note)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
