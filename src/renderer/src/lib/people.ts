import { useSyncExternalStore } from 'react'

import { personKey } from '../../../main/names'
import { chime } from './sound'
import type { Person } from '../../../main/people'
export type { Person }

/**
 * The pictures people carry wherever their name is shown: read once per
 * window, then again whenever anything is saved. Set by you only, from a file
 * or a paste: never looked up anywhere.
 */
type People = Record<string, Person>

let people: People = {}
/** The person who is you (Settings' `me`, kept in the book): they wear your photo, the one saved as "You". '' for no one. */
let me = ''
/** What a face reads, one object, new whenever the pictures or who is you change. */
let state = { people, me }
let asked = false
// Read once yet: until then a face cannot say whether it has a picture.
let read = false
const listeners = new Set<() => void>()
const tell = (): void => {
  state = { people, me }
  listeners.forEach((listen) => listen())
}
const load = (): void =>
  void Promise.all([window.api.haligtree<People>('people'), window.api.haligtree<{ me?: string }>('settings')]).then(([next, settings]) => {
    const who = settings?.me ?? ''
    if (read && who === me && JSON.stringify(next) === JSON.stringify(people)) return
    read = true
    people = next ?? {}
    me = who
    tell()
  }, () => undefined)
const subscribe = (listen: () => void): (() => void) => {
  listeners.add(listen)
  if (!asked) {
    asked = true
    load()
    // A picture set anywhere tells every window, as any save does (with no list of what).
    window.api.captures.onChange((what) => what === null && load())
  }
  return () => void listeners.delete(listen)
}

/** The name your own photo is kept under (Settings' “Your photo”). */
export const YOU = 'You'

/** The picture a name wears: your photo for the person who is you (while you have one), else their own. */
const faceOf = (now: typeof state, name: string): string | null => {
  const key = personKey(name)
  if (now.me && key === personKey(now.me)) return now.people[personKey(YOU)]?.avatar ?? now.people[key]?.avatar ?? null
  return now.people[key]?.avatar ?? null
}

/** The picture kept for a name, if any. */
export const useAvatar = (name: string | null | undefined): string | null => {
  const now = useSyncExternalStore(subscribe, () => state)
  return name ? faceOf(now, name) : null
}

/** The picture kept for a name, outside a component (a hover card): read now, from what this window holds. */
export const avatarOf = (name: string): string | null => {
  if (!asked) subscribe(() => undefined)
  return faceOf(state, name)
}

/** The person who is you, as named ('' for no one). */
export const useMe = (): string => useSyncExternalStore(subscribe, () => state).me

/** Whether a name is the person who is you. */
export const isMe = (name: string): boolean => !!me && !!name.trim() && personKey(name) === personKey(me)

/** Make a person you ('' for no one), kept in the book's settings: every face of theirs follows at once, in every window. */
export async function setMe(name: string): Promise<void> {
  if (!asked) subscribe(() => undefined)
  await window.api.haligtree('settings:set', { me: name.trim() })
  me = name.trim()
  tell()
}

/** Whether the pictures have been read in this window: a face waits for it, so it never shows its initials and then its picture. */
export const peopleRead = (): boolean => read

/** One or two letters for a name: its first and last words' first letters. */
export const initials = (name: string): string => {
  // The person, not the note after the comma: "Gandalf, in J.R.R. Tolkien" is G, "Homer, tr. Samuel Butler" is H.
  const words = (name.split(',')[0] || name).replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/**
 * Initials that tell apart every name shown together: two names that would both be "S1" ("Source 1",
 * "Someone, Number 1") take a letter more from the first word, the first that differs ("SU1", "SM1").
 */
export const distinctInitials = (names: string[]): Map<string, string> => {
  const unique = [...new Set(names.map((one) => one.trim()).filter(Boolean))]
  const choices = (name: string): string[] => {
    const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().split(/\s+/).filter(Boolean)
    const first = [...(words[0] ?? '')]
    const end = words.length > 1 ? [...words[words.length - 1]] : []
    return [initials(name), `${first[0] ?? ''}${end.slice(0, 2).join('')}`.toUpperCase(), ...first.slice(1).map((one) => `${first[0]}${one}${end[0] ?? ''}`.toUpperCase())]
  }
  const plain = unique.map(initials)
  const out = new Map<string, string>()
  const used = new Set<string>()
  // A name no other shares keeps its two letters; the rest, in order, take the first of their choices not taken.
  unique.forEach((name, at) => { if (plain.filter((one) => one === plain[at]).length === 1) (out.set(name, plain[at]), used.add(plain[at])) })
  for (const name of unique) {
    if (out.has(name)) continue
    const pick = choices(name).find((one) => !used.has(one) && !plain.includes(one) || (one === initials(name) && !used.has(one))) ?? `${initials(name)}${used.size}`
    out.set(name, pick)
    used.add(pick)
  }
  return out
}

/** A hue for a name that never changes: the same person, the same colour, in every window. */
export const hueOf = (name: string): number => {
  let hash = 0
  for (const char of personKey(name)) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return hash % 360
}

/**
 * A picture made small and square for a face in a circle: the middle of it,
 * 256 pixels across, kept in the app's store. Null if it is not a picture.
 */
async function shrink(blob: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null)
  if (!bitmap) return null
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  bitmap.close()
  const small = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.9))
  if (!small) return null
  const url = await window.api.saveImage('image/webp', new Uint8Array(await small.arrayBuffer()))
  return url || null
}

/** A picture for a person, or none: saved once for the name, wherever it is written. The person who is you wears your
 *  photo, so a picture given to them is your photo, and taking theirs away takes yours (theirs, once you have none). */
export async function setAvatar(given: string, picture: Blob | null): Promise<boolean> {
  const name = isMe(given) && (picture || people[personKey(YOU)]) ? YOU : given
  const url = picture ? await shrink(picture) : null
  if (picture && !url) return false
  const done = await window.api.haligtree<boolean>('people:set', name, url)
  if (done) {
    // This window at once; the others when the save is told.
    people = { ...people }
    if (url) people[personKey(name)] = { name, avatar: url }
    else delete people[personKey(name)]
    tell()
    chime(url ? 'noted' : 'off')
  }
  return done
}

/** A picture chosen from a file, for a name. */
export const pickAvatar = (name: string): Promise<boolean> =>
  new Promise((done) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.dataset.avatarPick = ''
    input.style.display = 'none'
    input.onchange = () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) return done(false)
      void setAvatar(name, file).then(done)
    }
    input.oncancel = () => (input.remove(), done(false))
    document.body.append(input)
    input.click()
  })

/** A picture on the clipboard, for a name. False if there is none. */
export async function pasteAvatar(name: string): Promise<boolean> {
  const items = await navigator.clipboard.read().catch(() => [] as ClipboardItem[])
  for (const item of items) {
    const type = item.types.find((one) => one.startsWith('image/'))
    if (type) return setAvatar(name, await item.getType(type))
  }
  return false
}
