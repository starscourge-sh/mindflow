/**
 * One listener on the wire for each channel, however many parts of a page
 * listen to it. Put away and shown again are heard by every looping picture, the
 * beam, the glide and the box's notices at once: fifty pictures in one note
 * were fifty listeners on Electron's IpcRenderer, past the count at which Node
 * warns of a leak ("51 window:shown listeners added"), and each message walked
 * them all through Electron's own emitter. Here the wire holds one per
 * channel for the life of the page, and listeners come and go in a set.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Relay = (event: any, ...args: any[]) => void
type Wire = { on: (channel: string, listener: Relay) => unknown }

export function channels(wire: Wire): { on: (channel: string, relay: Relay) => void; off: (channel: string, relay: Relay) => void; counts: () => Record<string, number> } {
  const all = new Map<string, Set<Relay>>()
  return {
    on(channel, relay) {
      let set = all.get(channel)
      if (!set) {
        const made = (set = new Set<Relay>())
        all.set(channel, made)
        // A copy is walked: a listener may take itself, or another, off as it is told.
        wire.on(channel, (event, ...args) => [...made].forEach((one) => made.has(one) && one(event, ...args)))
      }
      set.add(relay)
    },
    off(channel, relay) {
      all.get(channel)?.delete(relay)
    },
    /** How many are listening on each channel now: flat after a hundred notes opened and closed (qa/listeners-flat.mjs). */
    counts: () => Object.fromEntries([...all].map(([channel, set]) => [channel, set.size]))
  }
}
