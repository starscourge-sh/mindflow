/**
 * ⌘Z and ⇧⌘Z in every plain text box in the app (a card's words, a rename, "Why keep this?", a search), the Mac's
 * way: one ⌘Z takes back a whole run of typing, a deletion, a paste or a replace-all, and ⇧⌘Z does it again. Chromium's
 * own undo in a box React keeps the value of went back one letter at a time ("why can't i undo?", the "Capture · As
 * selected" card), and in other boxes jumped back to a letter in the middle. The editor's notes are left to their own
 * history (ProseMirror); a box that handles ⌘Z itself on keydown (box tokens, a site block) never reaches here.
 *
 * Both the keys and the Edit menu's Undo and Redo arrive as `beforeinput` "historyUndo" and "historyRedo", so one
 * listener serves every way in. A value put in by the app rather than typed (a card opening with its words, a
 * field cleared after Save) starts the box's history again from there.
 */

type Field = HTMLInputElement | HTMLTextAreaElement
type Snap = { value: string; start: number; end: number }
type History = { back: Snap[]; ahead: Snap[]; kind: string; value: string; caret: number }

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', ''])
const histories = new WeakMap<Field, History>()

const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_TYPES.has(target.type))

const snap = (field: Field): Snap => ({ value: field.value, start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length })

/** The box's history, begun again whenever its value is not the one this last saw (the app put words in). */
function historyOf(field: Field): History {
  const known = histories.get(field)
  if (known && known.value === field.value) return known
  const fresh: History = { back: [], ahead: [], kind: '', value: field.value, caret: -1 }
  histories.set(field, fresh)
  return fresh
}

/** Puts words in as if typed, so React's onChange hears them, with the selection where it was. */
function put(field: Field, to: Snap, history: History): void {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, to.value)
  history.value = to.value
  history.kind = ''
  history.caret = -1
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.setSelectionRange(to.start, to.end)
}

/** What a change is, for joining a run: typing, a space, deleting back or forward, anything else on its own. */
function kindOf(event: InputEvent): string {
  if (event.inputType === 'insertText') return event.data === ' ' ? 'space' : 'type'
  if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') return event.inputType
  return `${event.inputType}:${Math.random()}`
}

/** One step back or ahead in the box's own history. */
function step(field: Field, back: boolean): void {
  const history = historyOf(field)
  const [from, to] = back ? [history.back, history.ahead] : [history.ahead, history.back]
  const one = from.pop()
  if (!one) return
  to.push(snap(field))
  put(field, one, history)
}

export function installTextUndo(): void {
  // The keys first: Chromium offers its own Redo only while its own history has one, which this one replaces, so ⇧⌘Z
  // never arrived as "historyRedo". Taken here, the Edit menu's key equivalents never fire for a text box.
  document.addEventListener('keydown', (event) => {
    const field = event.target
    if (!isField(field) || field.readOnly || field.disabled || event.defaultPrevented) return
    if (!event.metaKey || event.ctrlKey || event.altKey || event.code !== 'KeyZ') return
    event.preventDefault()
    step(field, !event.shiftKey)
  })
  // The Edit menu's Undo and Redo, picked with the pointer.
  document.addEventListener('beforeinput', (event) => {
    const field = event.target
    if (!isField(field) || field.readOnly || field.disabled) return
    const history = historyOf(field)
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault()
      step(field, event.inputType === 'historyUndo')
      return
    }
    const kind = kindOf(event)
    const collapsed = field.selectionStart === field.selectionEnd
    // One run: the same kind of change, at the caret the last one left, nothing picked. Typing a space joins the
    // typing before it, as on the Mac; a deletion after typing is its own step.
    const joined = collapsed && field.selectionStart === history.caret && (kind === history.kind || (kind === 'space' && history.kind === 'type') || (kind === 'type' && history.kind === 'space'))
    if (!joined) {
      history.back.push(snap(field))
      if (history.back.length > 200) history.back.shift()
    }
    history.ahead = []
    history.kind = kind === 'space' ? 'type' : kind
  }, true)
  document.addEventListener('input', (event) => {
    const field = event.target
    if (!isField(field)) return
    const history = histories.get(field)
    if (!history) return
    history.value = field.value
    history.caret = field.selectionStart ?? -1
  }, true)
}
