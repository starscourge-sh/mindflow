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
let asked = false
// Read once yet: until then a face cannot say whether it has a picture.
let read = false
const listeners = new Set<() => void>()
const load = (): void =>
  void (window.api.haligtree<People>('people')).then((next) => {
    if (read && JSON.stringify(next) === JSON.stringify(people)) return
    read = true
    people = next ?? {}
    listeners.forEach((listen) => listen())
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

/** The picture kept for a name, if any. */
export const useAvatar = (name: string | null | undefined): string | null => {
  const all = useSyncExternalStore(subscribe, () => people)
  return name ? (all[personKey(name)]?.avatar ?? null) : null
}

/** The picture kept for a name, outside a component (a hover card): read now, from what this window holds. */
export const avatarOf = (name: string): string | null => {
  if (!asked) subscribe(() => undefined)
  return people[personKey(name)]?.avatar ?? null
}

/** Whether the pictures have been read in this window: a face waits for it, so it never shows its initials and then its picture. */
export const peopleRead = (): boolean => read

/** One or two letters for a name: its first and last words' first letters. */
export const initials = (name: string): string => {
  const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
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

/** A picture for a person, or none: saved once for the name, wherever it is written. */
export async function setAvatar(name: string, picture: Blob | null): Promise<boolean> {
  const url = picture ? await shrink(picture) : null
  if (picture && !url) return false
  const done = await window.api.haligtree<boolean>('people:set', name, url)
  if (done) {
    // This window at once; the others when the save is told.
    people = { ...people }
    if (url) people[personKey(name)] = { name, avatar: url }
    else delete people[personKey(name)]
    listeners.forEach((listen) => listen())
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
