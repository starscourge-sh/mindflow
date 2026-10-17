/**
 * What counts as a #tag, in one place, for the main process and the windows
 * alike: a letter in any language or an emoji, then letters, digits, marks,
 * emoji, "_" and "-". So #français, #日本語, #عربي and #📚 are tags; #1 and a
 * lone # are not. Tags are kept in lower case.
 */

/** One character a tag may hold after its first. */
export const TAG_PART = String.raw`[\p{L}\p{M}\p{N}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\u20e3_-]`
/** The tag itself, after its "#": usable inside a bigger pattern (needs the `u` flag). */
export const TAG = String.raw`[\p{L}\p{Extended_Pictographic}]${TAG_PART}*`

/**
 * One tag as written, "#tag" and not "#tagged", after `before` (group 1),
 * any case: for finding, renaming or taking out a tag in some words.
 */
export const tagWritten = (tag: string, before = String.raw`(^|\s)`, flags = 'giu'): RegExp =>
  new RegExp(`${before}#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${TAG_PART})`, flags)

/** A #tag in running text: at the start or after a space. The tag is group 1. */
export const tagPattern = (flags = 'gu'): RegExp => new RegExp(String.raw`(?:^|\s)#(${TAG})`, flags)

/** Every tag in some text, lower case, each once: "#Work and #français" gives work, français. */
// Most names hold no "#" at all: those skip the patterns, which are slow to
// build (every letter in every language) and asked for on every row drawn.
export const tagsIn = (text: string): string[] => (text.includes('#') ? [...new Set([...text.matchAll(tagPattern())].map((match) => match[1].toLowerCase()))] : [])

/** Whether a word, without its "#", is a tag. */
export const isTagWord = (word: string): boolean => new RegExp(`^${TAG}$`, 'u').test(word)

/** Text with its #tags (and the space before each) taken out, or each put as `by`. */
export const withoutTags = (text: string, by = ''): string => (text.includes('#') ? text.replace(tagPattern(), by) : text)

/**
 * A name as a list shows it: its words without their #tags, the comma or colon
 * that only parted a front tag from the words gone with it. Empty when the
 * name is only tags.
 */
export const nameWithoutTags = (text: string): string =>
  !text.includes('#') ? text.trim() : withoutTags(text.replace(new RegExp(String.raw`^\s*#${TAG}\s*(?:[,;:]|[-\u2013\u2014](?=\s))?`, 'u'), '')).trim()
