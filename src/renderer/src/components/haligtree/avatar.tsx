import { askRename, openSource, sources } from '@/lib/sources'
import { small as smallCopy } from '@/lib/small-picture'
import { chime } from '@/lib/sound'
import { useState, type CSSProperties, type ReactElement } from 'react'

import { YOU, avatarOf, hueOf, initials, isMe, pasteAvatar, peopleRead, pickAvatar, setAvatar, setMe, useAvatar, useMe } from '@/lib/people'
import { useDecoded } from '@/lib/decoded'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuTrigger } from '@/components/ui/context-menu'
import { SHAPES, TINTS } from './coolshapes'
import './box-extras.css'

/** One number for a name, always the same: which shape, and which two tints. */
const hashOf = (name: string): number => {
  let hash = 2166136261
  for (const char of name.toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  return hash
}

/** A colour the theme names (any CSS colour, oklch too) as 0 to 1 red, green and blue, read through a 1px canvas. */
const rgbOf = (color: string): [number, number, number] => {
  const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  paint.fillStyle = color.trim() || '#000'
  paint.fillRect(0, 0, 1, 1)
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}
let duotone: SVGSVGElement | null = null
/**
 * Every photo of a person is printed in the theme's two tones, its ink and its paper, so a page of
 * faces reads as one printed set (the user, 1 Nov). One SVG filter, `#mf-duotone`: grey first, then
 * each grey mapped from the darker of the two colours to the lighter, so a dark theme is never a
 * negative. Read again whenever the theme changes. The saved pictures are never touched.
 */
function ensureDuotone(): void {
  if (duotone) return
  const ns = 'http://www.w3.org/2000/svg'
  duotone = document.createElementNS(ns, 'svg')
  duotone.setAttribute('aria-hidden', 'true')
  duotone.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
  duotone.innerHTML = `<filter id="mf-duotone" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="table"/><feFuncG type="table"/><feFuncB type="table"/></feComponentTransfer></filter>`
  document.body.appendChild(duotone)
  const paint = (): void => {
    const root = getComputedStyle(document.documentElement)
    const ink = rgbOf(root.getPropertyValue('--foreground'))
    const paper = rgbOf(root.getPropertyValue('--background'))
    const light = (one: number[]): number => 0.2126 * one[0] + 0.7152 * one[1] + 0.0722 * one[2]
    const [dark, bright] = light(ink) < light(paper) ? [ink, paper] : [paper, ink]
    const funcs = duotone!.querySelectorAll('feFuncR, feFuncG, feFuncB')
    funcs.forEach((one, at) => one.setAttribute('tableValues', `${dark[at].toFixed(3)} ${bright[at].toFixed(3)}`))
  }
  paint()
  // The theme lives on the root's class and style (main.tsx): read the two colours again whenever either changes.
  new MutationObserver(() => requestAnimationFrame(paint)).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
}

/**
 * A person's face, small, wherever their name is: the picture you gave them,
 * or else their initials over a shape from Coolshapes picked by their name,
 * so the same name always wears the same one. The shape is filled with two of
 * the theme's tag tints, soft enough that the letters read in every theme.
 * With “Avatars” set to “Initials” (the root's data-avatars), the initials sit
 * in a round, on a darkened corner of an engraved sheet (box-extras.css).
 */
export function Avatar({ name, size = 16, className = '', look, letters }: { name: string; size?: number; className?: string; /** Settings' sample: this look whatever the setting says. */ look?: 'shapes' | 'initials'; /** Its letters, where names shown together would otherwise share them (distinctInitials). */ letters?: string }): React.JSX.Element | null {
  // A small copy (main makes it once), never the original decoded whole for a face: one 640px long for a face drawn
  // big (a person's own page, the Sources grid at 128px), so it stays sharp on a Retina screen.
  const kept = useAvatar(name)
  const avatar = kept && smallCopy(kept, size > 48 ? 640 : 256)
  if (avatar) ensureDuotone()
  // Its page waits for the pictures' read and this one's decode, a moment at most: never initials, then the picture.
  useDecoded(avatar, !peopleRead())
  const trimmed = name.trim()
  if (!trimmed) return null
  const hash = hashOf(trimmed)
  // Under 20px (an @mention, a row's face) a shape is a blob with letters too small to read, beside round photos:
  // there it is always the round tint, as round and as big as a photo, with one letter big enough to read.
  const small = size < 20
  const shape = hash % SHAPES.length
  const from = (hash >>> 4) % TINTS.length
  const to = (from + 1 + ((hash >>> 9) % (TINTS.length - 1))) % TINTS.length
  // Which part of the engraved sheet behind the initials (box-extras.css): the same for a name every time.
  const style = { '--mf-avatar-size': `${size}px`, '--mf-avatar-hue': hueOf(trimmed), '--mf-avatar-at': `${(hash >>> 13) % 101}% ${(hash >>> 20) % 101}%`, '--mf-shape-from': `var(--tt-color-text-${TINTS[from]})`, '--mf-shape-to': `var(--tt-color-text-${TINTS[to]})` } as CSSProperties
  const id = `mf-shape-${hash.toString(36)}`
  return (
    <span aria-hidden data-avatar={avatar ? 'picture' : 'initials'} data-avatar-shape={avatar ? undefined : shape} data-look={look ?? (small ? 'initials' : undefined)} data-small={small ? '' : undefined} className={`mf-avatar ${className}`} style={style}>
      {/* A photo twice: printed in the theme's two tones, and in its own colours over it, shown while pointed at. */}
      {avatar ? <><img src={avatar} alt="" draggable={false} className="mf-avatar-print" /><img src={avatar} alt="" draggable={false} className="mf-avatar-real" /></> : (
        <>
          <svg viewBox="0 0 200 200" className="mf-avatar-shape" aria-hidden>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--mf-shape-a)' }} />
                <stop offset="1" style={{ stopColor: 'var(--mf-shape-b)' }} />
              </linearGradient>
            </defs>
            <path d={SHAPES[shape]} fill={`url(#${id})`} />
          </svg>
          <span>{letters ?? (small ? [...initials(trimmed)][0] : initials(trimmed))}</span>
        </>
      )}
    </span>
  )
}

/**
 * A person made a character of a work (asked which), or a character made a real
 * person again: one notice, one Undo. Their notes, photo and links stay theirs.
 */
export async function turnCharacter(name: string, to: 'character' | 'person'): Promise<void> {
  // Read when asked: ui.tsx draws this file's faces, so a load-time import of it would go round in a circle.
  const { ask, toast } = await import('./ui')
  const was = (await sources.page('attribution', name))?.character ?? null
  if (to === 'person') {
    if (!was) return
    // Read from the name ("Gandalf, in J.R.R. Tolkien"), not saved: there is nothing to undo but the name itself.
    if (was.from) return void toast(`${name} reads as a character from the name: rename them without “, in ${was.work}” to make them a person`)
    await sources.character(name, '')
    chime('retag')
    return toast(`${name} is a real person again, in People`, () => void sources.character(name, was.work, was.played).then(() => chime('undo')))
  }
  const work = (await ask(was ? `Which work is ${name} in?` : `Make ${name} a character: which work are they in?`, 'e.g. Dune, or The Picture of Dorian Gray',
    { field: 'medium', initial: was?.work, action: was ? 'Change the work' : 'Make a character' }))?.trim()
  if (!work || work === was?.work) return
  await sources.character(name, work, was?.played)
  chime('retag')
  toast(`${name} is now a character in ${work}`, () => void sources.character(name, was?.work ?? '', was?.played).then(() => chime('undo')))
}

/**
 * “This is me” on a person: they become you and wear your photo everywhere a face is shown; only one person is you,
 * so choosing another moves it. Chosen again (“This is not me”), no one is. One notice, one Undo.
 */
export async function markMe(name: string): Promise<void> {
  const { toast } = await import('./ui')
  const who = name.trim()
  if (!who) return
  const was = isMe(who) ? who : ''
  const before = (await window.api.haligtree<{ me?: string }>('settings'))?.me ?? ''
  await setMe(was ? '' : who)
  chime(was ? 'off' : 'noted')
  const photo = !!avatarOf(YOU)
  const said = was ? `${who} is not you any more`
    : before ? `${who} is you now, not ${before}` : photo ? `${who} is you now, and wears your photo` : `${who} is you now: add your photo in Settings and they wear it`
  toast(said, () => void setMe(before).then(() => chime('undo')))
}

/**
 * What a right click on a person offers: a picture from a file or the
 * clipboard, or none, and making them a character of a work (or a real person
 * again). Always the same wrapper, so a field inside it keeps its caret as the
 * first letter of a name arrives; with no name it does nothing. `work`: the
 * work they are a character in ('' a real person); left out, read as it opens.
 */
export function PersonMenu({ name, work, children }: { name: string; work?: string; children: ReactElement }): React.JSX.Element {
  const avatar = useAvatar(name)
  const me = useMe()
  if (avatar) ensureDuotone()
  const who = name.trim()
  // Read as the menu opens: "Paste a picture" only with a picture on the clipboard, so it never answers "none there".
  const [clipped, setClipped] = useState(false)
  const [read, setRead] = useState<string | null>(null)
  const inWork = work ?? read ?? ''
  const look = (open: boolean): void => {
    if (!open) return
    void navigator.clipboard.read().then((items) => setClipped(items.some((item) => item.types.some((type) => type.startsWith('image/')))), () => setClipped(false))
    if (work === undefined) void sources.page('attribution', who).then((page) => setRead(page?.character?.work ?? ''))
  }
  return (
    <ContextMenu onOpenChange={look}>
      <ContextMenuTrigger asChild data-row-menu disabled={!who}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="flex items-center gap-2"><Avatar name={who} size={18} /><span className="truncate">{who}</span></ContextMenuLabel>
        <ContextMenuItem onSelect={() => openSource('attribution', who)}>Open {who}’s page</ContextMenuItem>
        <ContextMenuItem data-person-rename onSelect={() => askRename('attribution', who)}>Rename…</ContextMenuItem>
        <ContextMenuItem onSelect={() => void pickAvatar(who)}>{avatar ? 'Change the picture…' : 'Add a picture…'}</ContextMenuItem>
        {clipped && <ContextMenuItem onSelect={() => void pasteAvatar(who)}>Paste a picture</ContextMenuItem>}
        {/* Someone from a story, kept apart from real people (and back again). */}
        {inWork
          ? <>
            <ContextMenuItem data-character-work onSelect={() => void turnCharacter(who, 'character')}>Change the work…</ContextMenuItem>
            <ContextMenuItem data-make-person onSelect={() => void turnCharacter(who, 'person')}>Make a real person</ContextMenuItem>
          </>
          : <ContextMenuItem data-make-character onSelect={() => void turnCharacter(who, 'character')}>Make a character of a work…</ContextMenuItem>}
        {/* You, among the people: they wear your photo. Never a character. Read as it reads, so it is turned off where it was turned on. */}
        {!inWork && <ContextMenuItem data-this-is-me={me && isMe(who) ? 'on' : 'off'} onSelect={() => void markMe(who)}>{me && isMe(who) ? 'This is not me' : 'This is me'}</ContextMenuItem>}
        {avatar && <ContextMenuItem variant="destructive" onSelect={() => void setAvatar(who, null)}>Remove the picture</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  )
}
