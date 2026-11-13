// A book of 200 notes with known right answers, for the offers made by shared root words (src/main/roots.ts):
// ten subjects a student, reader or writer keeps (each a folder), notes made of that subject's sentences, a
// few notes left loose, near-copies written again months later, everyday notes that belong nowhere, and words
// that cross subjects ("spice" in Dune and in a recipe, "Paul" in Dune and in a letter, "cells" in biology and
// in a spreadsheet). Built the same way every run (a seeded shuffle).

type Topic = { folder: string; titles: string[]; lines: string[]; questions: string[]; events: string[] }

export const TOPICS: Topic[] = [
  { folder: 'Stoicism', titles: ['Marcus Aurelius', 'Stoicism'], questions: ['What did the Stoics say about anger?', 'How should I deal with things outside my control?'], events: ['Seminar: Stoic ethics'],
    lines: ['Marcus Aurelius wrote the Meditations in a tent on campaign.', 'The Stoics held that only our judgements are up to us.', 'Epictetus was a slave before he taught philosophy.', 'Stoicism asks us to tell apart what we control from what we do not.', 'Seneca wrote letters to Lucilius about anger and grief.', 'A Stoic does not wish events to happen as he wants, but wants them as they happen.', 'The obstacle to action advances action, Marcus wrote.', 'Virtue is the only good, the Stoics claimed; wealth and health are indifferent.', 'Each morning, rehearse the difficulties of the day ahead.', 'Anger is a brief madness, says Seneca.', 'Memento mori: remember that you will die.', 'Zeno taught under the painted porch, the stoa.'] },
  { folder: 'Films and books', titles: ['Paul Atreides', 'Dune'], questions: ['Is Paul the hero of Dune?', 'Why does the spice matter so much on Arrakis?'], events: ['Book club: Dune part two'],
    lines: ['Paul Atreides becomes Muad’Dib among the Fremen.', 'Herbert wrote Dune as a warning about charismatic leaders.', 'The spice melange extends life and lets the Guild navigators fold space.', 'Arrakis is a desert planet where water is wealth.', 'Lady Jessica defies the Bene Gesserit by bearing a son.', 'The sandworms guard the spice and the Fremen ride them.', 'Dune is less a hero story than a study of how messiahs are made.', 'Baron Harkonnen schemes to take Arrakis back from House Atreides.', 'Fear is the mind-killer, the litany says.', 'The Fremen stillsuits recycle every drop of the body’s water.', 'Chani loves Paul but sees what his jihad will cost.', 'Villeneuve’s film keeps the desert silent and vast.'] },
  { folder: 'Baking', titles: ['Sourdough starter', 'Banana bread'], questions: ['Why did my sourdough come out flat?', 'How ripe should bananas be for banana bread?'], events: ['Baking class: bread'],
    lines: ['Feed the sourdough starter twice a day at room temperature.', 'Banana bread wants bananas that are nearly black.', 'A stiff dough rises slowly; a wet dough opens a big crumb.', 'Bake the loaf in a lidded pot for the first twenty minutes.', 'Fold the dough every half hour for the first two hours.', 'A pinch of spice, cinnamon and nutmeg, warms the banana bread.', 'An overproofed loaf spreads flat in the oven.', 'Weigh the flour; cups lie.', 'The starter is ready when it doubles and smells sour and sweet.', 'Brown butter makes the banana bread taste of toffee.', 'Score the loaf with a razor just before it goes in.', 'Let the bread cool fully before cutting it.'] },
  { folder: 'History', titles: ['Leonardo da Vinci', 'Medici'], questions: ['Who paid for Renaissance art in Florence?', 'Why did Leonardo leave so many works unfinished?'], events: ['Lecture: Florence and the Medici'],
    lines: ['The Medici bank funded painters, sculptors and architects in Florence.', 'Leonardo da Vinci filled notebooks with mirror writing.', 'Brunelleschi built the dome of Florence cathedral without centring.', 'Lorenzo de’ Medici gathered poets and philosophers at his villa.', 'Leonardo left many works unfinished, distracted by new studies.', 'Michelangelo carved David from a block others had abandoned.', 'The printing press spread classical texts across Europe.', 'Patrons chose the subjects; painters chose how to show them.', 'Botticelli burned some of his paintings in the bonfire of the vanities.', 'Linear perspective made a flat wall look like a room.', 'The Medici were bankers to the pope.', 'Vasari wrote the lives of the artists.'] },
  { folder: 'Biology', titles: ['Photosynthesis', 'Mitochondria'], questions: ['How do plants turn light into sugar?', 'Where does a cell make its energy?'], events: ['Biology exam: cells and energy'],
    lines: ['Photosynthesis turns light, water and carbon dioxide into sugar and oxygen.', 'Mitochondria make most of the cell’s energy as ATP.', 'Chlorophyll absorbs red and blue light and reflects green.', 'The Calvin cycle fixes carbon in the stroma of the chloroplast.', 'Mitochondria carry their own DNA, a sign they were once bacteria.', 'Cells divide by mitosis to grow and by meiosis to make gametes.', 'Enzymes speed reactions without being used up.', 'The light reactions happen on the thylakoid membranes.', 'Respiration breaks glucose down to release energy.', 'Osmosis moves water across a membrane towards more solute.', 'Ribosomes read messenger RNA to build proteins.', 'The cell membrane is a lipid bilayer studded with proteins.'] },
  { folder: 'Running', titles: ['Marathon training', 'Tempo runs'], questions: ['How long should my longest run be before a marathon?', 'What pace is a tempo run?'], events: ['Club run: tempo Tuesday'],
    lines: ['Marathon training builds the long run by about ten percent a week.', 'A tempo run is comfortably hard, about an hour’s race pace.', 'Easy runs should let you talk in full sentences.', 'Taper for two or three weeks before the marathon.', 'Strides after an easy run keep the legs quick.', 'Most runners go out too fast in the first mile.', 'Tempo runs teach the body to clear lactate.', 'The longest run before a marathon is about twenty miles.', 'Rest days are when the training actually sinks in.', 'Practise eating gels on the long runs, not on race day.', 'Run the hills by effort, not by pace.', 'New shoes need a few short runs before a long one.'] },
  { folder: 'Photography', titles: ['Aperture', 'Golden hour'], questions: ['Why is my background not blurry?', 'When is the best light for portraits?'], events: ['Photo walk at golden hour'],
    lines: ['A wide aperture blurs the background and lets in more light.', 'Golden hour is the hour after sunrise and before sunset.', 'Shutter speed freezes or blurs motion.', 'Raise the ISO only when the shutter and aperture cannot give more light.', 'Expose for the highlights; shadows can be lifted later.', 'Portraits look softer in the long light of golden hour.', 'The rule of thirds puts the subject off centre.', 'A longer lens compresses the background behind a portrait.', 'Shoot in raw to keep the most detail for editing.', 'Overcast days make a giant softbox of the sky.', 'Focus on the nearer eye in a portrait.', 'Stop the aperture down for landscapes sharp front to back.'] },
  { folder: 'Spanish', titles: ['Subjunctive', 'Ser and estar'], questions: ['When do I use the subjunctive in Spanish?', 'What is the difference between ser and estar?'], events: ['Spanish tutor: subjunctive practice'],
    lines: ['The subjunctive follows wishes, doubts and feelings: espero que vengas.', 'Ser is for what something is; estar for how or where it is.', 'Estar is used for location: el libro está en la mesa.', 'Ojalá always takes the subjunctive.', 'Ser describes lasting traits: ella es alta.', 'The preterite tells finished actions; the imperfect sets the scene.', 'Por and para both mean for, but not in the same way.', 'Cuando takes the subjunctive when the action has not happened yet.', 'Listen to Spanish podcasts at slow speed first.', 'False friends: embarazada means pregnant, not embarrassed.', 'The subjunctive is a mood, not a tense.', 'Estar cansado is to be tired now; ser cansado is to be tiresome.'] },
  { folder: 'Economics', titles: ['Inflation', 'Opportunity cost'], questions: ['Why do prices keep going up?', 'What is the real cost of a choice?'], events: ['Economics tutorial: inflation'],
    lines: ['Inflation is a general rise in prices that erodes what money buys.', 'Opportunity cost is the value of the best thing you gave up.', 'Central banks raise interest rates to cool inflation.', 'Supply shocks can push prices up even in a weak economy.', 'Every choice has an opportunity cost, even an hour of sleep.', 'Wages that lag behind inflation are a cut in real pay.', 'Comparative advantage explains why trade helps both sides.', 'A sunk cost should not change what you do next.', 'Money supply growing faster than output tends to raise prices.', 'Deflation makes people wait to buy, which slows the economy.', 'Markets fail when costs fall on people outside the deal.', 'The price of a thing is not its opportunity cost.'] },
  { folder: 'Astronomy', titles: ['Black holes', 'Andromeda'], questions: ['What happens at the edge of a black hole?', 'How far away is the Andromeda galaxy?'], events: ['Planetarium night: black holes'],
    lines: ['Nothing, not even light, escapes from inside a black hole’s event horizon.', 'The Andromeda galaxy is about two and a half million light years away.', 'Andromeda and the Milky Way will merge in a few billion years.', 'Stars more massive than about twenty suns can collapse into black holes.', 'Hawking radiation lets black holes slowly evaporate.', 'Light from distant galaxies is stretched to red as space expands.', 'A light year is a distance, not a time.', 'Time runs slower near a black hole than far away.', 'The first picture of a black hole showed a ring of glowing gas.', 'On a dark night Andromeda is visible to the naked eye.', 'Neutron stars are the crushed cores of exploded stars.', 'Saturn would float in a bath big enough to hold it.'] },
]

/** Everyday notes that belong to no subject, some sharing words with them. */
export const LOOSE_LIFE = [
  'Pick up milk, eggs and a pinch of patience for Monday.', 'Call Paul about the flat on Thursday; the boiler needs looking at.', 'The spreadsheet cells keep losing their formatting.', 'Dentist moved to next week. Remember to floss.', 'Lunch with Ana, she is moving to Lisbon in spring.', 'Gym membership renews in March, cancel or keep?', 'Bank holiday plans: nothing at all, gloriously.', 'Bought a plant for the kitchen window, it needs bright light.', 'My phone battery dies by noon, look at what drains it.', 'Birthday present ideas for Dad: a good pen, a book, socks.', 'The car needs its tyres checked before the long drive.', 'Water the tomatoes twice a day in this heat.', 'Garden centre has bulbs on sale until Friday.', 'Remember the passport photos for the renewal.', 'Ask the landlord about the leak under the sink.', 'Train tickets are cheaper if booked a month ahead.', 'Spice rack is a mess; label the jars.', 'Running late again, set the clock five minutes fast.', 'Cancel the streaming service I never watch.', 'Notes from the parents’ evening: reading is going well.',
]

/** How a person frames a line they keep: the same few words round every subject, so nothing is told apart by them. */
export const FRAMES = ['Come back to this before the weekend.', 'Read this on the train this morning.', 'Worth remembering, I think.', 'Saw this quoted somewhere and wrote it down.', 'Not sure I agree with this yet.', 'From last night, half asleep.', 'This keeps coming up.', 'Talked about this with Sam today.', 'I want to understand this properly.', 'Copied out by hand, slowly.', 'A good line to start the essay with.', 'Underlined twice.']

/** The tag a subject's notes carry, as a person tags them. */
export const TAG_OF: Record<string, string> = { Stoicism: 'philosophy', 'Films and books': 'dune', Baking: 'baking', History: 'renaissance', Biology: 'biology', Running: 'running', Photography: 'photography', Spanish: 'spanish', Economics: 'economics', Astronomy: 'astronomy' }
/** The everyday notes that are errands (by their place in LOOSE_LIFE): the first four carry #errands. */
const ERRANDS = [0, 3, 10, 14, 1, 9, 13, 15, 18]

/**
 * Tags as a person keeps them: a subject's filed notes carry its tag, and #quotes as well where they say the line
 * was quoted; four errands carry #errands. Its loose notes, its notes written again and the other errands carry
 * none: `right` is the tags each note should carry, so what it lacks of them is the right answer for it.
 */
export function tagsOfBook(notes: BenchNote[]): Map<string, { has: string[]; right: string[] }> {
  const out = new Map<string, { has: string[]; right: string[] }>()
  for (const note of notes) {
    const errand = note.key.startsWith('life-') ? ERRANDS.indexOf(Number(note.key.slice(5))) : -1
    const right = note.topic ? [TAG_OF[note.topic], ...(note.text.includes(FRAMES[3]) ? ['quotes'] : [])] : errand >= 0 ? ['errands'] : []
    out.set(note.key, { right, has: note.folder || (errand >= 0 && errand < 4) ? right : [] })
  }
  return out
}

/** A seeded shuffle, so the book is the same every run. */
function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export type BenchNote = { key: string; title: string; text: string; topic: string | null; folder: string | null; copyOf?: string }

/** 200 notes: per subject its 2 titled notes and 15 more (12 filed, 3 loose), 10 near-copies, 20 everyday notes. */
export function book(): BenchNote[] {
  const notes: BenchNote[] = []
  TOPICS.forEach((topic, t) => {
    topic.titles.forEach((title, i) => notes.push({ key: `${t}-title-${i}`, title, text: shuffle(topic.lines, t * 31 + i).slice(0, 3).join(' '), topic: topic.folder, folder: topic.folder }))
    for (let n = 0; n < 15; n++) {
      // One or two of the subject's lines and a frame of the person's own: subjects share no words through their frames.
      const lines = [...shuffle(topic.lines, t * 97 + n * 7 + 1).slice(0, 1 + (n % 2)), FRAMES[(t * 5 + n) % FRAMES.length]]
      // A first line of its own words, as a person titles a note: the opening of its first sentence.
      const title = lines[0].split(/[,.:;]/)[0].split(' ').slice(0, 5).join(' ')
      notes.push({ key: `${t}-${n}`, title, text: lines.join(' '), topic: topic.folder, folder: n < 12 ? topic.folder : null })
    }
  })
  // Written again months later, nearly the same: the same lines, reordered, one word changed.
  const originals = notes.filter((note) => /-\d+$/.test(note.key) && note.text.split('. ').length >= 2).filter((_, i) => i % 6 === 0).slice(0, 10)
  for (const one of originals) {
    const lines = one.text.split(/(?<=\.)\s+/)
    const again = shuffle(lines, one.key.length * 13).join(' ').replace(/\bthe\b/, 'that')
    notes.push({ key: `${one.key}-again`, title: again.split(/[,.:;]/)[0].split(' ').slice(0, 5).join(' '), text: again, topic: one.topic, folder: null, copyOf: one.key })
  }
  LOOSE_LIFE.forEach((text, i) => notes.push({ key: `life-${i}`, title: text.split(/[,.:;]/)[0].split(' ').slice(0, 5).join(' '), text, topic: null, folder: null }))
  return notes
}
