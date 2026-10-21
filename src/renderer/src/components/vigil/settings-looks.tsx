import { useRef } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Scene, type Settings } from '@/lib/vigil'
import { DRAWINGS, GRADIENTS, GrainFill, type Cover } from './grain'
import { Rolling, Tip, refuse, toast } from './ui'
import { Highlight, useChosen, useFluidHover } from './glide'
import { spring } from '@/lib/motion'

/**
 * Settings that change a look show the look: the Covers choice as rows of
 * the covers each option gives, each Scenery folder with a strip of its own
 * pictures, and Dimness on a strip of a real picture with words over it.
 */

/** A folder's row: open it in Finder. */
export function InFinder({ folder }: { folder: string }): React.JSX.Element {
  return (
    <Tip label="Show in Finder">
      <button type="button" aria-label="Show in Finder" className="relative rounded-full p-0.5 text-muted-foreground after:absolute after:-inset-1 hover:bg-accent hover:text-foreground" onClick={() => (chime('open'), window.api.showFolder(folder))}>
        <AliveIcon icon={ExternalLinkIcon} size={12} />
      </button>
    </Tip>
  )
}

/** The kinds' colours a cover is tinted with on a card, for the samples. */
const TINTS = ['var(--tt-color-text-orange)', 'var(--tt-color-text-blue)', 'var(--tt-color-text-green)', 'var(--tt-color-text-purple)']

/** Four covers as they come out on cards: the picture, tinted toward a kind's colour, with the grain. */
function Samples({ covers, empty }: { covers: Cover[]; empty?: string }): React.JSX.Element {
  return (
    <span className="grid grid-cols-4 gap-1.5">
      {TINTS.map((tint, n) => (
        <span key={tint} className="relative aspect-[4/3] overflow-hidden rounded-md" style={{ background: `color-mix(in oklab, ${tint} 22%, var(--background))` }}>
          {covers.length ? <GrainFill cover={covers[(n * 3) % covers.length]} tint={tint} shade="none" /> : n === 0 && empty ? <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground">{empty}</span> : null}
        </span>
      ))}
    </span>
  )
}

/**
 * Covers, as a choice you can see: “Paper drawings” and “Gradients”, each
 * shown as four cards wearing what it gives. Both are bundled, so either
 * works at once; under Gradients, a folder of your own is an optional extra
 * that takes the bundled gradients' place.
 */
export function CoverChoice({ settings, set }: { settings: Settings; set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  const style = settings.coverStyle === 'gradients' ? 'gradients' : 'paper'
  const folder = settings.coversFolder || ''
  const own = useLive(() => (folder ? vigil.scenery([folder], 'covers') : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.scenery>> | null, [folder])
  const mine = (own?.scenes ?? []).filter((one) => one.small).map((one) => ({ ...one, url: one.small! }))
  const box = useRef<HTMLDivElement | null>(null)
  const hover = useFluidHover(box, { items: ':scope > button', axis: 'x' })
  const chosen = useChosen(box, ':scope > button[aria-pressed="true"]', style)
  const options = [
    { id: 'paper', label: 'Paper drawings', line: 'Old pen and pencil sketches, faded to sit on the page.', covers: DRAWINGS },
    { id: 'gradients', label: 'Gradients', line: folder ? `Soft gradients from ${folder.split('/').pop()}.` : 'Soft grainy colour, tinted to each note.', covers: mine.length ? mine : GRADIENTS }
  ] as const
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div ref={box} {...hover.handlers} data-hover-quiet data-cover-choice className="relative isolate grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Highlight spot={chosen.spot} snap={chosen.snap} travel={spring.moderate} className="rounded-lg bg-accent" />
        <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} from={chosen.spot} className="rounded-lg bg-accent/50" />
        {options.map((option) => (
          <button key={option.id} type="button" data-cover-option={option.id} aria-pressed={style === option.id}
            onClick={() => (chime('tap'), set({ coverStyle: option.id }))}
            className={`flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors duration-80 ${style === option.id ? 'border-foreground/25' : 'border-transparent'}`}>
            <Samples covers={[...option.covers]} />
            <span className="flex flex-col">
              <span className={`text-control font-medium ${style === option.id ? 'text-foreground' : 'text-foreground/80'}`}>{option.label}{option.id === 'paper' && <span className="ml-1.5 font-normal text-muted-foreground">(the usual)</span>}</span>
              <span className="text-meta text-muted-foreground">{option.line}</span>
            </span>
          </button>
        ))}
      </div>
      {style === 'gradients' && (
        <div data-cover-folder className="flex flex-wrap items-center gap-2 px-1 text-control">
          {folder ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md border py-1 pr-1 pl-2.5">
              <span className="min-w-0 flex-1 truncate" title={folder}><span className="text-foreground">{folder.split('/').pop()}</span><span className="text-muted-foreground"> · <Rolling text={mine.length} /> {mine.length === 1 ? 'picture' : 'pictures'}{own?.scanning ? ', more on the way' : ''}</span></span>
              <InFinder folder={folder} />
              <button type="button" aria-label="Use the bundled gradients again" className="relative rounded-full p-0.5 text-muted-foreground after:absolute after:-inset-1 hover:bg-accent hover:text-foreground" onClick={() => {
                set({ coversFolder: '' })
                chime('away')
                toast('Back to the bundled gradients', () => set({ coversFolder: folder }))
              }}><X className="size-3" /></button>
            </span>
          ) : <span className="flex-1 text-muted-foreground">Or use a folder of your own pictures instead.</span>}
          <Button variant="outline" size="sm" onClick={() => void vigil.sceneryFolder().then((picked) => {
            if (!picked) return
            if (picked === folder) return refuse('That folder is already chosen')
            set({ coversFolder: picked })
            chime('settled')
            toast(`Covers from ${picked.split('/').pop()}`, () => set({ coversFolder: folder }))
          })}>
            <FolderPlus className="size-4" /> {folder ? 'Choose another…' : 'Choose a folder…'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** A strip of a few of a folder's pictures, from Vigil's small copies. */
function Strip({ scenes }: { scenes: Scene[] }): React.JSX.Element {
  return (
    <span className="flex gap-1">
      {scenes.slice(0, 6).map((scene) => (
        <span key={scene.id} className="relative h-11 flex-1 overflow-hidden rounded-[5px]" style={{ background: scene.color }}>
          {scene.small && <img src={scene.small} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />}
        </span>
      ))}
      {Array.from({ length: Math.max(0, 6 - scenes.length) }, (_, n) => <span key={`gap${n}`} className="h-11 flex-1 rounded-[5px] bg-foreground/[0.05]" />)}
    </span>
  )
}

/**
 * Scenery's folders, each as what it gives: its name, how many pictures are
 * ready, and a strip of a few of them; open it in Finder, or take it out
 * (undoable).
 */
export function FolderStrips({ folders, scenes, scanning, onSave }: { folders: string[]; scenes: Scene[]; scanning: boolean; onSave: (folders: string[]) => void }): React.JSX.Element | null {
  if (!folders.length) return null
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {folders.map((folder) => {
        const own = scenes.filter((one) => one.root === folder)
        return (
          <div key={folder} data-scenery-folder className="flex flex-col gap-2 rounded-lg border p-2 pl-2.5 text-control">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate" title={folder}>
                <span className="text-foreground">{folder.split('/').pop()}</span>
                <span className="text-muted-foreground"> · <Rolling text={own.length} /> {own.length === 1 ? 'picture' : 'pictures'}{scanning ? ', more on the way' : ''}</span>
              </span>
              <InFinder folder={folder} />
              <button type="button" aria-label={`Remove ${folder}`} className="relative rounded-full p-0.5 text-muted-foreground after:absolute after:-inset-1 hover:bg-accent hover:text-foreground" onClick={() => {
                onSave(folders.filter((one) => one !== folder))
                chime('away')
                toast(`Removed ${folder.split('/').pop()}`, () => onSave(folders))
              }}>
                <X className="size-3" />
              </button>
            </span>
            <Strip scenes={own} />
          </div>
        )
      })}
    </div>
  )
}

/** The page colour at a strength, as Scenery lays it over a picture. */
const veil = (strength: number): string => `color-mix(in srgb, var(--background) ${Math.round(Math.min(1, strength) * 100)}%, transparent)`

/**
 * Dimness, shown: a strip of one of your own pictures dimmed as the slider
 * says, moving with it, and a line of words at its foot dimmed further the way
 * Scenery does under words.
 */
export function DimPreview({ dim, on, folders }: { dim: number; on: boolean; folders: string[] }): React.JSX.Element {
  const found = useLive(() => (on && folders.length ? vigil.scenery(folders) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.scenery>> | null, [on, JSON.stringify(folders)])
  // A wide one, the kind that sits over a rest moment.
  const scene = found?.scenes.find((one) => one.width >= one.height * 1.3) ?? found?.scenes[0]
  const strong = Math.max(dim, 0.82)
  return (
    <div data-dim-preview className={`relative mt-3 h-28 overflow-hidden rounded-lg border transition-opacity ${on ? '' : 'opacity-50'}`} style={{ background: scene?.color }}>
      {scene ? (
        <>
          <img src={scene.url} alt="" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" style={{ objectPosition: 'center 42%' }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${veil(dim)} 0%, ${veil(dim)} 30%, ${veil(strong)} 68%, ${veil(strong)} 100%)` }} />
          <p className="absolute right-4 bottom-3 left-4 text-body text-foreground"><strong className="font-medium">Inbox empty.</strong> <span className="text-muted-foreground">Nothing waiting; go and look at the sky.</span></p>
        </>
      ) : (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-control text-muted-foreground">Add a folder above to see how its pictures look at this dimness.</p>
      )}
    </div>
  )
}
