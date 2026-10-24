// Who feels real: your own profile, and a person's page with a photo, a line, a bio, counts and faces.
// Run: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/profiles.mjs
// QA_SHOTS=<folder> also saves light and dark pictures of Settings, Jane Austen's page and a Feed post.
import { sandbox } from './sandbox-lib.mjs'

const { h, v, go, theme, close, errors } = await sandbox({ width: 1200, height: 860 })
const fails = []
const check = (ok, said) => (ok ? console.log('ok  ', said) : (fails.push(said), console.log('FAIL', said)))
const shots = process.env.QA_SHOTS
const person = async (name) => {
  await h.evaluate((n) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${n}` })), name)
  await h.waitForTimeout(1200)
}
try {
  // 5. A promoted line is one note, not its capture and its gem both.
  for (const who of ['Jane Austen', 'Marcus Aurelius', 'Mary Shelley', 'William Shakespeare']) {
    const page = await v('source', 'attribution', who)
    const words = page.items.filter((one) => one.voice === 'theirs').map((one) => one.label)
    check(words.length > 0 && new Set(words).size === words.length, `${who}: no line twice in their words (${words.length})`)
  }
  const feed = await v('feed').catch(() => null)
  if (Array.isArray(feed?.posts)) {
    const keys = feed.posts.filter((one) => one.type !== 'quiz').map((one) => (one.title ?? '').slice(0, 60))
    const twice = keys.filter((one, at) => keys.indexOf(one) !== at)
    check(!twice.length, `the Feed shows no line twice ${JSON.stringify(feed.posts.filter((one) => twice.includes((one.title ?? '').slice(0, 60))).map((one) => [one.kind ?? one.post, one.type, one.id, one.title?.slice(0, 30)]))}`)
  }

  // 2. Jane Austen's head: photo, line, bio cut to three lines.
  await person('Jane Austen')
  check(await h.locator('[data-person-photo="picture"] img').count() === 1, 'Jane Austen wears her portrait')
  const line = await h.locator('[data-person-line] input').evaluateAll((all) => all.map((one) => one.value))
  check(line.join('|') === 'Novelist|1775|1817', `her line reads Novelist · 1775 to 1817 (${line.join('|')})`)
  const rows = await h.locator('[data-voice-section="theirs"] [data-row]').allTextContents()
  check(rows.filter((one) => one.startsWith('In vain have I struggled')).length === 1, '“In vain have I struggled” is listed once')
  const bio = h.locator('[data-thoughts]')
  const short = await bio.evaluate((one) => one.clientHeight)
  if (shots) await h.screenshot({ path: `${shots}/jane-austen-light.png` })
  check(await h.locator('[data-read-more]').textContent() === 'Read more', 'a long bio is cut, with “Read more”')
  await h.locator('[data-read-more]').click()
  await h.waitForTimeout(300)
  check((await bio.evaluate((one) => one.clientHeight)) > short && (await h.locator('[data-read-more]').textContent()) === 'Show less', '“Read more” shows it all, then “Show less”')
  await h.locator('[data-read-more]').click()
  // 3. Counts in plain words, normal size.
  const counts = await h.locator('[data-person-counts]').textContent()
  check(/^5 of their words · \d+ notes? cites? them · last added /.test(counts), `counts: ${counts}`)
  check(await h.locator('[data-person-counts]').evaluate((one) => parseFloat(getComputedStyle(one).fontSize)) >= 13, 'counts are normal size')
  // 4. Also in your book.
  const faces = await h.locator('[data-also-person]').evaluateAll((all) => all.map((one) => one.dataset.alsoPerson))
  check(faces.length > 0 && faces.length <= 6 && faces.includes('Mary Shelley'), `also in your book: ${faces.join(', ')}`)
  if (shots) {
    await h.screenshot({ path: `${shots}/jane-austen-light.png` })
  }
  // A line typed in place is kept.
  await h.locator('[data-fact="What they did"]').fill('Novelist and letter writer')
  await h.locator('[data-source-name]').click()
  await h.waitForTimeout(500)
  check((await v('source', 'attribution', 'Jane Austen')).what === 'Novelist and letter writer', 'what they did is typed in place and kept')
  await h.locator('[data-fact="What they did"]').fill('Novelist')
  await h.locator('[data-source-name]').click()
  await h.waitForTimeout(400)
  await h.locator('[data-also-person="Mary Shelley"]').click()
  await h.waitForTimeout(1200)
  check(await h.locator('[data-source-name]').textContent() === 'Mary Shelley', 'a face opens that person')
  // A person with nothing in common shows no row; a page with no photo wears its shape.
  await v('source:set', 'attribution', 'Nobody Yet')
  await person('Nobody Yet')
  check(await h.locator('[data-also-in]').count() === 0, 'no “Also in your book” when none share anything')
  check(await h.locator('[data-person-photo="shape"]').count() === 1, 'no photo: the shape stays')
  check(await h.locator('[data-person-counts]').count() === 0, 'no counts when all are zero')

  // 7. People as a grid of faces, by Display's “View as”, remembered.
  await go('sources')
  await h.keyboard.press('f')
  await h.waitForTimeout(500)
  await h.locator('button[aria-pressed]', { hasText: 'Grid' }).first().click()
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  const grid = await h.locator('[data-people-grid] [data-face]').evaluateAll((all) => all.map((one) => one.dataset.face))
  check(grid.length >= 4, `People show as a grid of faces (${grid.length})`)
  check(await h.locator('[data-face="Jane Austen"] .mf-avatar[data-avatar="picture"]').count() === 1, 'Jane Austen’s face is her portrait')
  check(/notes? · \d+ quotes?/.test(await h.locator('[data-face="Jane Austen"]').textContent()), 'a line of notes and quotes under the name')
  const columns = await h.locator('[data-people-grid] > div').evaluate((one) => getComputedStyle(one).gridTemplateColumns.split(' ').length)
  check(columns >= 3, `the grid fills the width (${columns} columns)`)
  await h.evaluate(() => localStorage.setItem('view:sources', JSON.stringify({ ...JSON.parse(localStorage.getItem('view:sources')), sort: 'name' })))
  await h.reload()
  await h.waitForTimeout(1500)
  await go('sources')
  const named = await h.locator('[data-people-grid] [data-face]').evaluateAll((all) => all.map((one) => one.dataset.face))
  check(named.length === grid.length && named.join('|') === [...named].sort((a, b) => a.localeCompare(b)).join('|'), 'the grid is remembered, and A to Z sorts it')
  if (shots) await h.screenshot({ path: `${shots}/people-grid-light.png` })
  await h.locator('[data-face="Jane Austen"]').click()
  await h.waitForTimeout(1000)
  check(await h.locator('[data-source-name]').textContent() === 'Jane Austen', 'a face opens the person')

  // 1. Your own profile.
  await go('settings')
  await h.locator('[data-your-profile]').scrollIntoViewIfNeeded()
  check((await h.locator('[data-your-bio]').inputValue()).startsWith('Reads on the bus'), 'the sandbox owner has a bio')
  await h.locator('[data-your-bio]').fill('Keeps lines.')
  check(await h.locator('[data-bio-count]').textContent() === '12 of 160', 'the bio counts as you type')
  await h.locator('[data-your-bio]').fill('x'.repeat(200))
  check((await h.locator('[data-your-bio]').inputValue()).length === 160, 'the bio stops at 160')
  await h.locator('[data-your-bio]').fill('Reads on the bus, cooks on Sundays, and keeps the lines worth keeping.')
  await h.locator('[data-your-profile] img, [data-your-profile] svg').first().click({ force: true }).catch(() => {})
  await h.locator('h2').first().click()
  await h.waitForTimeout(400)
  check((await v('settings')).bio === 'Reads on the bus, cooks on Sundays, and keeps the lines worth keeping.', 'the bio is saved')
  const before = await h.locator('[data-remove-photo]').boundingBox()
  // A photo, as the file picker would give it: the setter it calls, with a real picture.
  await h.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 400; canvas.height = 300
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 400, 300)
    grad.addColorStop(0, '#d98b5f'); grad.addColorStop(1, '#3a5a7a')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 400, 300)
    ctx.fillStyle = '#f3e3cf'; ctx.beginPath(); ctx.arc(200, 130, 60, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(200, 300, 110, 90, 0, 0, Math.PI * 2); ctx.fill()
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    // The same steps as the setter, by its channels: cut square, saved to the store, kept for "You".
    const bitmap = await createImageBitmap(blob)
    const small = document.createElement('canvas'); small.width = small.height = 256
    small.getContext('2d').drawImage(bitmap, 50, 0, 300, 300, 0, 0, 256, 256)
    const webp = await new Promise((done) => small.toBlob(done, 'image/webp', 0.9))
    const url = await window.api.saveImage('image/webp', new Uint8Array(await webp.arrayBuffer()))
    return window.api.haligtree('people:set', 'You', url)
  })
  await h.waitForTimeout(1200)
  check(await h.locator('[data-your-profile] .mf-avatar[data-avatar="picture"]').count() === 1, 'your photo shows in Settings')
  check(/^haligtree:\/\/assets\//.test((await v('people')).you?.avatar ?? ''), 'it is kept in the book’s own store')
  const after = await h.locator('[data-remove-photo]').boundingBox()
  check(before && after && Math.abs(before.x - after.x) < 1, '“Remove photo” stays put')
  if (shots) await h.locator('[data-your-profile]').evaluate((one) => one.closest('[data-setting]')?.scrollIntoView({ block: 'center' }))
  if (shots) await h.screenshot({ path: `${shots}/settings-light.png` })
  await go('feed')
  await h.waitForTimeout(800)
  const you = (await v('people')).you.avatar
  const mine = await h.locator(`[data-feed-post] .mf-avatar[data-avatar="picture"] img[src="${you}"]`).count()
  check(mine > 0, `your photo is your face in the Feed (${mine})`)
  if (shots) {
    const post = h.locator(`[data-feed-post]:has(.mf-avatar[data-avatar="picture"] img[src="${you}"])`).first()
    await post.scrollIntoViewIfNeeded()
    await post.screenshot({ path: `${shots}/feed-light.png` })
    await theme('dark')
    await go('feed')
    await h.waitForTimeout(800)
    const dark = h.locator(`[data-feed-post]:has(.mf-avatar[data-avatar="picture"] img[src="${you}"])`).first()
    await dark.scrollIntoViewIfNeeded()
    await dark.screenshot({ path: `${shots}/feed-dark.png` })
    await person('Jane Austen')
    await h.screenshot({ path: `${shots}/jane-austen-dark.png` })
    await go('sources')
    await h.screenshot({ path: `${shots}/people-grid-dark.png` })
    await go('settings')
    await h.locator('[data-your-profile]').evaluate((one) => one.closest('[data-setting]')?.scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(400)
    await h.screenshot({ path: `${shots}/settings-dark.png` })
  }
  await go('settings')
  await h.locator('[data-remove-photo]').click()
  await h.waitForTimeout(600)
  check(await h.locator('[data-your-profile] .mf-avatar[data-avatar="initials"]').count() === 1, '“Remove photo” returns to your shape')
} finally {
  console.log(errors.length ? `errors: ${errors.join('\n')}` : 'no page errors')
  await close()
}
if (fails.length) process.exit(1)
