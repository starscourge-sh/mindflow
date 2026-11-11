/**
 * What the writing draws outside its own box, in the page's body: its menus and pop-ups (Radix lays them at the foot
 * of the page), the lists that `@`, `#` and `/` open, and the spelling pill under a misspelt word. A press on one of
 * them is a press in the writing. Whatever ends the writing on a press elsewhere (a sticky, a card on the board, a
 * card's form in Review, a day's writing mode) asks here first. Each kept a list of its own and none had the pill:
 * a press on it ended the writing before the word was put right.
 */
const FLOATS = '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [role="dialog"], .tiptap-suggestion-popup, .tiptap-slash-menu, [data-spell-hint]'

/** Whether a press landed on something the writing itself put up. */
export const ofTheWriting = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest(FLOATS)
