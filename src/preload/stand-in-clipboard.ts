/** The stand-in's two calls from a page: put a copy on it, and read the one there (main/pasteboard.ts). */
export interface StandInBoard {
  write: (items: Record<string, Uint8Array>[]) => Promise<void>
  read: () => Promise<Record<string, Uint8Array>[]>
}

/**
 * Under a test run (HALIGTREE_QA_AWAY) a page copies to and pastes from main's stand-in, never the Mac's clipboard,
 * which is the person's. Run in the page's own world before its scripts (contextBridge.executeInMainWorld), so it
 * uses nothing but its argument.
 * - navigator.clipboard (every "Copy" button and line, a picture copied, a citation) reads and writes the stand-in.
 * - ⌘C and ⌘X (the keys, the Edit menu, execCommand): the browser's own event is cancelled with nothing on it, so the
 *   browser writes nothing, and the page's copy runs again on an event of its own, whose data goes to the stand-in:
 *   what the page put there, or else the words picked (taken out on a cut, as the browser would).
 * - ⌘V through the Mac's clipboard would bring in what the person copied: it is stopped and said as an error. A test
 *   pastes with a paste event carrying its data (qa/pasteboard.mjs).
 */
export function standInClipboard(board: StandInBoard): void {
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
  const bytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer())
  const proto = Clipboard.prototype
  proto.writeText = (text: string) => board.write([{ 'text/plain': encode(String(text)) }])
  proto.write = async (items: ClipboardItem[]) =>
    board.write(await Promise.all(items.map(async (item) => Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await bytes(await item.getType(type))]))))))
  proto.readText = async () => {
    const kinds = (await board.read()).find((one) => one['text/plain'])
    return kinds ? new TextDecoder().decode(kinds['text/plain']) : ''
  }
  proto.read = async () => (await board.read()).map((kinds) => new ClipboardItem(Object.fromEntries(Object.entries(kinds).map(([type, data]) => [type, new Blob([new Uint8Array(data)], { type })]))))

  const copied = (event: ClipboardEvent): void => {
    if (!event.isTrusted) return
    event.stopImmediatePropagation()
    event.preventDefault()
    const data = new DataTransfer()
    if ((event.target ?? document).dispatchEvent(new ClipboardEvent(event.type, { clipboardData: data, bubbles: true, cancelable: true, composed: true }))) {
      // Nobody took it: the browser's own copy, of the words picked.
      const field = document.activeElement
      const typed = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      const picked = typed ? field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0) : String(getSelection() ?? '')
      if (picked) {
        data.setData('text/plain', picked)
        const selection = getSelection()
        if (!typed && selection?.rangeCount) {
          const html = document.createElement('div')
          html.append(selection.getRangeAt(0).cloneContents())
          data.setData('text/html', html.innerHTML)
        }
        if (event.type === 'cut') document.execCommand('delete')
      }
    }
    const kinds = Object.fromEntries(data.types.filter((type) => type !== 'Files').map((type) => [type, encode(data.getData(type))]))
    if (Object.keys(kinds).length) void board.write([kinds])
  }
  addEventListener('copy', copied, true)
  addEventListener('cut', copied, true)
  addEventListener(
    'paste',
    (event) => {
      if (!event.isTrusted) return
      event.stopImmediatePropagation()
      event.preventDefault()
      console.error("A test pasted through the Mac's clipboard, which is the person's: send a paste event instead (qa/pasteboard.mjs)")
    },
    true
  )
}
