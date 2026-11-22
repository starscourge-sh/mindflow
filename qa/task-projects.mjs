// Projects in Tasks (src/main/projects.ts, side-projects.tsx, projects-view.tsx), as a Todoist user meets them on the
// sandbox: make a project from Tasks' "Projects" tab and name it in place, pick three tasks and carry them onto it in
// the sidebar (⌘Z, then again), make a second project and nest the first in it by its menu's "Move to…", rename it in
// place on its own page, group two of its tasks with ⌘G and name the group, archive it and bring it back from the
// Projects tab. ⌘Z along the way. Frames go to QA_SHOTS.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/task-projects.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1180, height: 800 })
const h = c.h
const wait = (ms) => h.waitForTimeout(ms)
const said = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent?.trim()).filter(Boolean).join(' | '))
const shot = async (name) => shots && c.both(`${shots}/${name}`)
// Asked again until it holds (a save and its notice land a moment after the key), for at most 5 s.
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
const menu = async (target, line) => {
  await target.click({ button: 'right' })
  await wait(250)
  await h.getByRole('menuitem', { name: line }).first().click()
  await wait(350)
}
const named = async (name) => (await c.v('projects')).find((one) => one.name === name)
const inProject = async (id) => (await c.v('tasks')).filter((task) => task.projectId === id).map((task) => task.id)
// The app's one carry: pressed, moved in small steps, rested, let go.
const carry = async (from, to, { rest = 250 } = {}) => {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 14; i++) await (h.mouse.move(a.x + 40 + (b.x + 40 - a.x - 40) * (i / 14), a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * (i / 14)), wait(30))
  await wait(rest)
  if (shots) await h.screenshot({ path: `${shots}/carry-${Date.now()}.png` })
  await h.mouse.up()
  await wait(600)
}
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // Tasks' tabs end with "Projects": a first-timer's way in. A new project is named where it appears.
  await c.go('alltasks')
  await h.locator('[data-list-tabs]').getByText('Projects', { exact: true }).click()
  await wait(700)
  check('the Projects tab opens the projects page', await h.locator('[data-projects-page]').isVisible())
  await h.locator('[data-projects-first], [data-projects-new]').first().click()
  const field = h.locator('input[data-project-name]').first()
  check('a new project is named in place, never a form', await until(() => field.isVisible()))
  await field.fill('Thesis')
  await h.keyboard.press('Enter')
  const thesis = await until(() => named('Thesis'))
  check('it is made, a favorite, and under Tasks in the sidebar', !!thesis?.starred && (await until(() => h.locator(`aside [data-project-row="${thesis?.id}"]`).isVisible())))
  await shot('projects-tab')

  // Three tasks picked on All (⌘-click) and carried onto the project in the sidebar: all three move, said once.
  await c.go('alltasks')
  const rows = h.locator('[data-task-row] [data-row]')
  const ids = await rows.evaluateAll((all) => all.slice(0, 3).map((one) => one.getAttribute('data-id')))
  for (let i = 0; i < 3; i++) await rows.nth(i).click({ modifiers: ['Meta'] })
  // Pressed on its words (the row's own button), as a person grabs a task, never on the tick's margin.
  await carry(rows.nth(2), h.locator(`aside [data-project-row="${thesis.id}"]`))
  check('three picked tasks carried onto a project move into it', await until(async () => (await inProject(thesis.id)).length === 3), JSON.stringify(await inProject(thesis.id)))
  check('said once, with the count', /Moved 3 tasks to Thesis/.test(await said()), await said())
  await h.keyboard.press('Meta+z')
  check('⌘Z takes all three back out', await until(async () => (await inProject(thesis.id)).length === 0))
  await c.v('projects:file', ids, thesis.id)
  check('the sidebar counts its open tasks', await until(async () => (await h.locator(`aside [data-project-row="${thesis.id}"] [data-count]`).textContent().catch(() => '')) === '3'))

  // A second project from ⌘K's "New project"; Thesis moved into it with its menu's "Move to…" (the one picker).
  await c.v('projects:make', 'Work', null)
  const work = await until(() => named('Work'))
  await menu(h.locator(`aside [data-project-row="${thesis.id}"]`), 'Move to…')
  check('"Move to…" opens the one picker, for projects', await h.locator('[data-project-picker]').isVisible())
  await h.keyboard.type('Work')
  await wait(200)
  await h.keyboard.press('Enter')
  check('Thesis is inside Work', await until(async () => (await named('Thesis'))?.parent === work.id))
  check('drawn as a tree under Work, on its trunk', await until(() => h.evaluate(([w, t]) => !!document.querySelector(`aside [data-project-row="${w}"]`)?.closest('[data-sortable-id]')?.querySelector(`[data-project-row="${t}"]`), [work.id, thesis.id])))
  await shot('nested')
  await h.keyboard.press('Meta+z')
  check('⌘Z takes it back out to the top', await until(async () => !(await named('Thesis'))?.parent))
  await c.v('projects:nest', thesis.id, work.id)

  // Its own page: the name large over the list, renamed in place with a press on it.
  await h.locator(`aside [data-project-row="${thesis.id}"]`).click()
  await wait(800)
  check('its page shows its name apart, over its tasks', (await h.locator('[data-project-title]').textContent()) === 'Thesis' && (await h.locator('[data-task-row]').count()) === 3)
  check('its way up names Work', /Projects.*Work/.test((await h.locator('[data-project-head] nav').textContent()) ?? ''))
  await h.locator('[data-project-title] button').click()
  await h.locator('input[data-project-title-name]').fill('Dissertation')
  await h.keyboard.press('Enter')
  check('renamed in place', await until(async () => (await c.v('projects')).find((one) => one.id === thesis.id)?.name === 'Dissertation'))
  await h.keyboard.press('Meta+z')
  check('⌘Z puts the old name back', await until(async () => (await c.v('projects')).find((one) => one.id === thesis.id)?.name === 'Thesis'))
  await shot('project-page')

  // Two of its tasks picked and grouped with ⌘G, the group named on its heading.
  const here = h.locator('[data-task-row] [data-row]')
  await here.nth(0).click({ modifiers: ['Meta'] })
  await here.nth(1).click({ modifiers: ['Meta'] })
  await h.keyboard.press('Meta+g')
  const groupName = h.locator('input[data-task-group-name]')
  check('⌘G makes a group, named in place on its heading', await until(() => groupName.isVisible()))
  await groupName.fill('Chapter one')
  await h.keyboard.press('Enter')
  const group = await until(async () => (await c.v('projects:groups')).find((one) => one.name === 'Chapter one'))
  check('the group holds the two, in the project', !!group && group.project === thesis.id && (await c.v('tasks')).filter((task) => task.taskGroup === group.id).length === 2)
  check('its heading leads the list', await until(() => h.evaluate((id) => !!document.querySelector(`[data-task-group="${id}"]`), group?.id)))
  await shot('grouped')
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+z')
  check('⌘Z lets the group go', await until(async () => !(await c.v('tasks')).some((task) => task.taskGroup === group?.id)))

  // Archived from its row's menu: out of the sidebar, kept; brought back from the Projects tab's "Archived".
  await menu(h.locator(`aside [data-project-row="${work.id}"]`), 'Archive project')
  check('archived, Work leaves the sidebar', await until(async () => (await h.locator(`aside [data-project-row="${work.id}"]`).count()) === 0))
  check('its tasks are kept', (await inProject(thesis.id)).length === 3)
  await c.go('projects')
  await h.locator('[data-projects-archived]').click()
  await wait(300)
  await menu(h.locator(`[data-projects-tree][data-archived] [data-project-row="${work.id}"]`), 'Bring back from the archive')
  check('brought back, it is in the sidebar again', await until(() => h.locator(`aside [data-project-row="${work.id}"]`).isVisible()))
  await shot('archive')

  // Folders hold no tasks now: a task's menu offers "Move to project…", never "Keep in folder…".
  await c.go('alltasks')
  await h.locator('[data-task-row]').first().click({ button: 'right' })
  await wait(250)
  check('a task offers "Move to project…" and not "Keep in folder…"', (await h.getByRole('menuitem', { name: 'Move to project…' }).count()) === 1 && (await h.getByRole('menuitem', { name: 'Keep in folder…' }).count()) === 0)
  await h.keyboard.press('Escape')
  const errors = c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|status of 404/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
