import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '../../../../main/name'

/**
 * Coming from another app: what each of its things becomes in Haligtree, on one
 * screen, and the one button that starts that importer. Said only as the
 * importers really do it (src/main/index.ts importVault, importFolders and
 * importFiles, captures.ts importAnki). Opened on the app you said you used before.
 */
export type Source = 'Apple Notes' | 'Obsidian' | 'Notion' | 'Anki' | 'Other files'
const SOURCES: Source[] = ['Apple Notes', 'Obsidian', 'Notion', 'Anki', 'Other files']
type What = 'vault' | 'files' | 'apple-notes'

const MAPS: Record<Source, { pick: string; what: What; rows: [string, string][]; note: string }> = {
  'Apple Notes': {
    pick: 'Choose folders…', what: 'apple-notes',
    rows: [['Each folder you choose', 'A group in “Writing”, named for it'], ['Each note', 'A page, not yet sorted'], ['Lists, checklists and links', 'Kept as they are'], ['Pictures', `Copied into ${APP_NAME}`], ['When it was made and changed', 'Kept with the note']],
    note: `macOS asks once whether ${APP_NAME} may read Notes. Nothing in Notes is changed. Locked notes stay behind.`
  },
  Obsidian: {
    pick: 'Choose your vault…', what: 'vault',
    rows: [['Each folder you choose', 'A group in “Writing”, named for it, its folders inside it'], ['Each note', 'A page, not yet sorted'], ['Tags in its properties', '#tags'], ['Its other properties and date', 'Kept with the note'], ['[[Links]]', 'Links to what those notes became here'], ['Pictures and files', `Copied into ${APP_NAME}`]],
    note: 'Your vault is only read, never written to. Its settings and trash are left out.'
  },
  Notion: {
    pick: 'Choose the unzipped export…', what: 'vault',
    rows: [['Each page', 'A note in your Inbox'], ['Callouts', 'Callouts'], ['Pictures', `Copied into ${APP_NAME}, at their width`]],
    note: 'In Notion: “Settings”, then “Export all workspace content”, as Markdown. Unzip it, then choose the folder.'
  },
  Anki: {
    pick: 'Choose the exported file…', what: 'files',
    rows: [['Each card', 'A gem'], ['Its front', 'The question “Review” asks'], ['Its back', 'The answer']],
    note: 'In Anki: File, Export, Notes in Plain Text.'
  },
  'Other files': {
    pick: 'Choose files…', what: 'files',
    rows: [['Markdown', 'A capture for each line, with the lines indented under it'], ['Readwise or Kindle highlights', 'Quotes, signed with the author and the book'], ['Bookmarks', 'Links, with their title and site']],
    note: 'Markdown, HTML bookmarks, Readwise CSV or a Kindle clippings file.'
  }
}

/** The app to open on: the first you named, of those you used before, that Haligtree can bring things in from. */
export const sourceFrom = (from: string[]): Source | null => (from.find((one): one is Source => (SOURCES as string[]).includes(one)) ?? null)

export function ImportMap({ start, onImport, still = false, head }: { start?: Source | null; onImport: (what: What) => void; still?: boolean; /** A title row, for the sheet. */ head?: ReactNode }): React.JSX.Element {
  const [source, setSource] = useState<Source>(start ?? 'Obsidian')
  const map = MAPS[source]
  return (
    <div className="flex w-full max-w-[44rem] flex-col gap-3 rounded-2xl border border-foreground/10 bg-popover p-4 text-popover-foreground shadow-(--mf-panel-shadow)">
      {head}
      <div role="tablist" aria-label="Bring notes from" className="flex flex-wrap gap-1">
        {SOURCES.map((one) => (
          <button key={one} type="button" role="tab" aria-selected={one === source} onClick={() => (chime('tap'), setSource(one))}
            className={`h-8 rounded-lg px-3 text-control font-medium transition-colors ${one === source ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'}`}>
            {one}
          </button>
        ))}
      </div>
      <motion.ul key={source} className="flex flex-col" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE }}>
        {map.rows.map(([was, now]) => (
          <li key={was} className="grid grid-cols-[minmax(0,0.8fr)_1rem_minmax(0,1.2fr)] items-baseline gap-2 border-b border-foreground/[0.07] py-1.5 text-[0.9375rem] last:border-0">
            <span className="text-foreground">{was}</span>
            <ArrowRight aria-hidden className="size-3.5 self-center text-muted-foreground" />
            <span className="text-foreground">{now}</span>
          </li>
        ))}
      </motion.ul>
      <p className="text-control text-muted-foreground">{map.note}</p>
      <div className="flex">
        <Button onClick={() => (chime('open'), onImport(map.what))}>{map.pick}</Button>
      </div>
    </div>
  )
}

/** The map as a sheet over the page, for Getting started's row. Esc or a click outside puts it away. */
export function ImportSheet({ start, onClose }: { start: Source | null; onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => void (event.key === 'Escape' && (event.stopPropagation(), onClose()))
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  // At the page's root: inside a moved or scaled part of the page, a fixed sheet would sit wherever that part is.
  return createPortal(
    <div role="dialog" aria-label="Bring your notes" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-6" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div className="w-full max-w-[44rem]" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring.moderate}>
        <ImportMap start={start} onImport={(what) => (onClose(), void window.api.importFrom(what))} head={
          <div className="flex items-center">
            <p className="flex-1 font-heading text-heading font-semibold text-foreground">Bring your notes</p>
            <button type="button" aria-label="Close" onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"><X className="size-4" /></button>
          </div>
        } />
      </motion.div>
    </div>,
    document.body
  )
}
