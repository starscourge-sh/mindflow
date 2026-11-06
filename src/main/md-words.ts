/** Code's own "#" left out: a shell comment ("rm -rf x #then…") or a CSS colour is no tag. */
export const uncoded = (text: string): string => text.replace(/#/g, '')

/**
 * Markdown read as words, for every line that shows a note's text without
 * drawing it: a search result's line, a card's few lines, a hover's glance.
 * A task's box, a list's dash, a heading's #s and a quote's > go; a link reads
 * as its words, a picture and a footnote say nothing, bold, italic and code
 * lose their marks. A #tag stays. `links` keeps each @ link as
 * `[[@id|Label]]`, for a card that shows them as links.
 */
export function mdWords(text: string, links = false): string {
  const words = text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g, uncoded)
  return (links ? words : words.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1'))
    // A fence's own line ("```js") is no words.
    .replace(/^[ \t]*(?:`{3,}|~{3,}).*$/gm, '')
    // A rule ("---", "* * *") is no words either.
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
    // Pictures, Obsidian's ![[embed]] too, say nothing; an address may hold brackets of its own ("…/Book (Library).pdf").
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
    .replace(/\[\[(?!@)(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, '')
    // The marks a line starts with: quote, callout, heading or list, then a task's box.
    .replace(/^[ \t]*(?:>[ \t]?)*(?:\[![\w-]+\][+-]?[ \t]*)?(?:#{1,6}[ \t]+|(?:[-*+•]|\d{1,3}[.)])[ \t]+)?(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, '$1')
    .replace(/\*\*|__|~~|==|`/g, '')
    .replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=$|[\s).,;:!?])/gm, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!>|~=])/g, '$1')
}
