import { ipcMain, type Session } from 'electron'

/** Why each web picture that could not be had failed, by its address: the site's own answer, or the connection's error. */
const why = new Map<string, string>()
const keep = (url: string, said: string): void => {
  why.delete(url)
  why.set(url, said)
  // The last few hundred: a note's pictures, not every address ever asked.
  if (why.size > 500) why.delete(why.keys().next().value!)
}

/**
 * Pictures from other sites show in a note as they did on their own page. Haligtree's pages are files, so a site
 * that marks its pictures as for its own pages alone (`Cross-Origin-Resource-Policy: same-origin` or `same-site`)
 * had each one refused (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`), a broken picture where its page showed one. A
 * picture is only shown, never read by the page's code, so that mark is let go for pictures, as a page of that site
 * shows them. One that still cannot be had keeps why, as the answer comes (its status, a page sent in its place, or
 * the connection's error), for the note to say in its place (`pictures:why`, haligtree-editor.tsx `missing`).
 *
 * A site that answers a picture's address with a page (claude.ai's, behind its sign-in) has that answer passed on as
 * a picture of no kind the note can read, and without what the page asks to be fetched alongside (its own fonts,
 * named in its `Link` header): passed on as it came, the page's fonts were asked for by the note and refused by the
 * app's own rules, one error each; refused here instead, each picture was an error line of its own
 * (`ERR_BLOCKED_BY_CLIENT`). Now it fails as any broken picture does, quietly, and says why in its place.
 */
export function letWebPictures(session: Session): void {
  const filter = { urls: ['https://*/*', 'http://*/*'] }
  session.webRequest.onHeadersReceived(filter, (details, done) => {
    if (details.resourceType !== 'image') return done({})
    const headers = details.responseHeaders ?? {}
    const type = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1]?.[0] ?? ''
    const page = !!type && !/^image\//i.test(type) && details.statusCode < 300
    if (details.statusCode >= 400) keep(details.url, `status ${details.statusCode}`)
    else if (page) keep(details.url, `type ${type}`)
    else why.delete(details.url)
    // A picture's answer keeps only what showing it needs: its own-pages mark and its hints to fetch more let go, and
    // a page's own word for what it is (read as a page, the browser refuses it out loud).
    const drop = Object.keys(headers).filter((one) => /^(cross-origin-resource-policy|link)$/i.test(one) || (page && /^(content-type|x-content-type-options)$/i.test(one)))
    if (!drop.length) return done({})
    const responseHeaders: Record<string, string[]> = { ...headers }
    for (const name of drop) delete responseHeaders[name]
    if (page) responseHeaders['Content-Type'] = ['image/png']
    done({ responseHeaders })
  })
  // What the site answered says more than the error it then came to (a page sent for a picture is refused as one).
  session.webRequest.onErrorOccurred(filter, ({ resourceType, url, error }) => void (resourceType === 'image' && !/^(status|type) /.test(why.get(url) ?? '') && keep(url, error)))
  ipcMain.handle('haligtree:pictures:why', (_event, url: unknown) => why.get(String(url)) ?? null)
}
