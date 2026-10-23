/**
 * The editor's public surface: what the app around it imports from it.
 * Anything not named here is the component's own business and may move
 * without warning.
 */

export { HaligtreeEditor, readMarkdown } from "@/components/haligtree/haligtree-editor"

/** The editor dressed for small boxes: a comment, a description, one line. */
export { CommentEditor, DescriptionEditor, LineEditor } from "@/components/haligtree/presets"

/** Tags, as the editor finds them in text. */
export { TAGS } from "@/extensions/tokens"

/** Fold every heading at once, and go to one in an open editor. */
export { foldEverything } from "@/extensions/heading-fold"
export { goToHeading } from "@/components/toc/headings"

/** The page's Vim setting: it covers every editor on the page, so it cannot live inside one. */
export { currentVim, onVimChange, setVim } from "@/lib/vim"
