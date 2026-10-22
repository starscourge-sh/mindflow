import { useEffect, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { dayjs } from '../../../../main/dates'
import { QUESTIONS, type Question } from '../../../../main/journal-words'
import { Chips } from './display'
import { Section } from './stats-view'
import { chime } from '@/lib/sound'
import { unloaded, useLive } from '@/lib/vigil'

const call = <T,>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

/** Close the day's two questions, each kept as you leave its box (or press ↵). */
export function JournalQuestions({ day, heading }: { day: string; heading: string }): React.JSX.Element {
  const [answers, setAnswers] = useState<Partial<Record<Question, string>>>({})
  const [kept, setKept] = useState<Partial<Record<Question, string>>>({})
  // What was kept for the day comes in under anything typed before it arrived, and never from a day since left.
  useEffect(() => {
    let here = true
    setAnswers({})
    setKept({})
    void call<Partial<Record<Question, string>>>('journal:day', day).then((had) => here && (setAnswers((was) => ({ ...had, ...was })), setKept(had)))
    return () => void (here = false)
  }, [day])
  const keep = (question: Question): void => {
    const text = (answers[question] ?? '').trim()
    if (text === (kept[question] ?? '').trim()) return
    void call('journal:save', day, question, text).then(() => (chime('noted'), setKept((was) => ({ ...was, [question]: text }))))
  }
  return (
    <>
      {(Object.keys(QUESTIONS) as Question[]).map((question) => (
        <section key={question} data-close-journal={question}>
          <h3 className={heading}>{QUESTIONS[question]}</h3>
          <form className="mt-1.5 flex items-center gap-2 rounded-md border px-2.5 py-1.5 focus-within:border-ring" onSubmit={(event) => (event.preventDefault(), keep(question))}>
            <input value={answers[question] ?? ''} onChange={(event) => setAnswers((was) => ({ ...was, [question]: event.target.value }))} onBlur={() => keep(question)}
              placeholder={question === 'well' ? 'One thing, however small' : 'Something you know now'} aria-label={QUESTIONS[question]}
              className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground" />
            {kept[question] && kept[question] === (answers[question] ?? '').trim() && <span className="shrink-0 text-control font-medium text-foreground">Kept</span>}
          </form>
        </section>
      ))}
    </>
  )
}

/** A year of answers read back: one question at a time, month by month, each answer under its day. */
export function YearOfAnswers(): React.JSX.Element | null {
  const [year, setYear] = useState(new Date().getFullYear())
  const [question, setQuestion] = useState<Question>('well')
  const rows = useLive(() => call<{ day: string; question: Question; answer: string }[]>('journal:year', year), [] as { day: string; question: Question; answer: string }[], [year])
  const mine = rows.filter((row) => row.question === question)
  useReading(unloaded(rows))
  if (!rows.length && year === new Date().getFullYear()) return null
  const months = Object.entries(Object.groupBy(mine, (row) => row.day.slice(0, 7)) as Record<string, typeof mine>)
  return (
    <Section title={`Your ${year}, in your own words`} big={{ value: mine.length, label: mine.length === 1 ? 'night answered' : 'nights answered' }}>
      <div data-year-answers className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chips options={(Object.keys(QUESTIONS) as Question[]).map((id) => ({ id, label: QUESTIONS[id] }))} on={(id) => id === question} pick={(id) => (chime('tap'), setQuestion(id as Question))} />
          <Chips options={[year - 1, year].map((one) => ({ id: String(one), label: String(one) }))} on={(id) => id === String(year)} pick={(id) => (chime('tap'), setYear(Number(id)))} />
        </div>
        {months.length ? months.map(([month, list]) => (
          <div key={month}>
            <h4 className="text-body font-semibold text-foreground">{dayjs(`${month}-01`).format('MMMM')}</h4>
            <ul className="mt-1 space-y-1">
              {list.map((row) => <li key={row.day} className="text-body text-foreground"><span className="mr-2 font-medium tabular-nums">{dayjs(row.day).format('D MMM')}</span>{row.answer}</li>)}
            </ul>
          </div>
        )) : <p className="text-foreground">No answers to this one in {year} yet. They come from “Close the day”.</p>}
      </div>
    </Section>
  )
}
