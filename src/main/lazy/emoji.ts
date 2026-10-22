import type * as Emoji from '@tiptap/extension-emoji'

// What main reads of the editor's emoji extension (import.ts: an emoji's
// character from its name), loaded the first time it is needed or soon after
// Haligtree opens, rather than as it opens: it takes about 25ms. It is bundled
// into main, so it comes as a piece of its own. electron.vite.config.ts
// points main's import of it here; the tests and the windows import the real one.
let real: typeof Emoji | undefined
let loading: Promise<void> | undefined
export const warmEmoji = (): Promise<void> => (loading ??= import('@tiptap/extension-emoji').then((found) => void (real = found)))
/** Whether an emoji's name can be read as its character yet. */
export const emojiReady = (): boolean => !!real

/** Stands in for the real list: the lookup below always uses the real one. */
export const gitHubEmojis = [] as unknown as typeof Emoji.gitHubEmojis
/** Until the extension has loaded, nothing (and the load is started): a name read then is not kept (captures.ts). */
export const shortcodeToEmoji: typeof Emoji.shortcodeToEmoji = (name) => {
  if (real) return real.shortcodeToEmoji(name, real.gitHubEmojis)
  void warmEmoji()
  return undefined
}
