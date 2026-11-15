// The clipboard in a test run: a stand-in the app under test keeps in memory (src/main/pasteboard.ts), never the
// Mac's own, which is the person's (15 Nov 2026: probes overwrote it on every merge check, and two test lanes raced
// through it). A probe never reads or writes the Mac's clipboard and never presses ⌘V:
// - a copy (a "Copy" line, ⌘C, ⌘X) is read from the stand-in: copiedText, copiedKinds;
// - a paste is a paste event carrying its data, sent where the app listens, as ⌘V sends one: paste, pasteCopied;
// - what another app copied (for the app's own reads of the clipboard) is put on the stand-in: putOnBoard.
// test/pasteboard.test.ts runs these on a stand-in of its own.

/** What the app last copied, as plain words ('' when nothing is there). */
export const copiedText = (electron) => electron.evaluate(() => globalThis.qaPasteboard.readText())

/** What the app last copied, by kind: words for text, `{ bytes }` (a plain array) for anything else. */
export const copiedKinds = (electron) =>
  electron.evaluate(async () => {
    const kinds = {}
    for (const item of await globalThis.qaPasteboard.read())
      for (const type of item.types) {
        const blob = await item.getType(type)
        kinds[type] = type.startsWith('text/') ? await blob.text() : { bytes: [...new Uint8Array(await blob.arrayBuffer())] }
      }
    return kinds
  })

/** The kinds the app last copied ('text/plain', 'image/png', ...), without their data. */
export const copiedTypes = (electron) => electron.evaluate(async () => (await globalThis.qaPasteboard.read()).flatMap((item) => item.types))

/** Empties the stand-in, so a copy that never came is told from one that did. */
export const clearBoard = (electron) => electron.evaluate(() => globalThis.qaPasteboard.clear())

/** Puts a copy on the stand-in, as another app would: words by type, or `{ bytes }` (a plain array). */
export const putOnBoard = (electron, kinds) =>
  electron.evaluate(({ ClipboardItem }, kinds) => {
    const parts = Object.entries(kinds).map(([type, one]) => [type, new Blob([typeof one === 'string' ? one : Uint8Array.from(one.bytes)], { type })])
    return globalThis.qaPasteboard.write(parts.length ? [new ClipboardItem(Object.fromEntries(parts))] : [])
  }, typeof kinds === 'string' ? { 'text/plain': kinds } : kinds)

/**
 * A paste, as ⌘V sends one: a paste event carrying the data, sent to what has the focus (or to `at`, a selector).
 * `what` is words, or kinds by type ('text/plain', 'text/html', ...) with `files`: each `{ name, type, bytes }`
 * (a picture copied in another app), or `paths`: files on disk, each with its place there, as Finder's ⌘C gives
 * them. Nobody taking it, the words go into the field, as the browser's own paste puts them. Says whether it was taken.
 */
export async function paste(page, what, at = null) {
  const { files = [], paths = [], ...types } = typeof what === 'string' ? { 'text/plain': what } : what
  const disk = paths.length ? await page.evaluateHandle(() => Object.assign(document.body.appendChild(document.createElement('input')), { type: 'file', multiple: true, hidden: true })) : null
  if (disk) await disk.setInputFiles(paths)
  return page.evaluate(
    ([types, files, at, disk]) => {
      const target = at ? document.querySelector(at) : document.activeElement || document.body
      if (!target) return disk?.remove(), false
      const data = new DataTransfer()
      for (const file of disk?.files ?? []) data.items.add(file)
      for (const file of files) data.items.add(new File([Uint8Array.from(file.bytes)], file.name, { type: file.type }))
      for (const [type, words] of Object.entries(types)) data.setData(type, words)
      disk?.remove()
      const taken = !target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }))
      const words = types['text/plain']
      if (!taken && words && (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) document.execCommand('insertText', false, words)
      return taken
    },
    [types, files, at, disk]
  )
}

/** ⌘V of what the app copied: the stand-in's words and pictures, pasted (a picture as the file a paste carries). */
export async function pasteCopied(electron, page, at = null) {
  const what = { files: [] }
  for (const [type, one] of Object.entries(await copiedKinds(electron)))
    if (typeof one === 'string') what[type] = one
    else if (type.startsWith('image/')) what.files.push({ name: `image.${type.split('/')[1].split('+')[0]}`, type, bytes: one.bytes })
  return paste(page, what, at)
}
