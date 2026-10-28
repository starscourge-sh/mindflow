/**
 * The welcome's story: a thought about a book caught on a walk, written out
 * as a page, one of its phrases made a task and one of its sentences a gem
 * with a question for Review. One of five, picked at random each time the
 * welcome opens and kept while it stays open, so Back and Next show the same
 * one (welcome.tsx calls pickStory as it opens). Catch, Write, Remember and
 * the sandbox all read story(), so they tell the same one. Words only here:
 * each story's picture is in welcome-flow.tsx, by its id.
 */

export type Story = {
  id: 'sherlock' | 'frankenstein' | 'dracula' | 'pride' | 'odyssey'
  /** The book and who wrote it, for the picture's caption. */
  book: string
  author: string
  /** The thought caught on a walk, in Catch. */
  caught: string
  /** The page it grows into: its title, and its sentences as written. The last one is the gem. */
  note: string
  words: string[]
  /** The task, as it is named on its card. Written into the page as "I should ..." with its day. */
  task: string
  /** The gem's question, as Review asks it. */
  question: string
}

export const STORIES: readonly Story[] = [
  {
    id: 'sherlock',
    book: 'A Scandal in Bohemia',
    author: 'Arthur Conan Doyle',
    caught: 'Why Sherlock sees what Watson misses',
    note: 'Observation vs just looking',
    words: [
      'Watson looks at the world, but Holmes actively studies details like dirt on a shoe or wear on a watch.',
      'You see, but you do not observe.'
    ],
    task: 'Find the exact quote from A Scandal in Bohemia',
    question: 'According to Holmes, what is the key difference between seeing and observing?'
  },
  {
    id: 'frankenstein',
    book: 'Frankenstein',
    author: 'Mary Shelley',
    caught: 'Who is the real monster in Frankenstein',
    note: 'The responsibility of creation',
    words: [
      'Victor abandons his creature out of fear the moment it wakes up.',
      'The creature only turns violent after being rejected by everyone it meets.',
      'Isolation turns hurt into cruelty.'
    ],
    task: "Outline key quotes from the creature's speech on the glacier",
    question: 'What drives the creature from seeking affection to committing violent acts?'
  },
  {
    id: 'dracula',
    book: 'Dracula',
    author: 'Bram Stoker',
    caught: 'Why Dracula uses letters and diary entries',
    note: 'Building fear through real documents',
    words: [
      'The story is built from journal notes, letters, and news clips instead of one narrator.',
      'Reading personal records makes the horror feel real and unedited.',
      'Firsthand accounts make fiction feel like truth.'
    ],
    task: "Save Jonathan Harker's journal entry from his first night at the castle",
    question: 'Why does an epistolary format make supernatural stories feel grounded?'
  },
  {
    id: 'pride',
    book: 'Pride and Prejudice',
    author: 'Jane Austen',
    caught: "Why Darcy's first proposal fails so badly",
    note: 'First impressions and pride',
    words: [
      'Darcy expects Elizabeth to say yes even while insulting her family background.',
      'He assumes his high social standing hides his poor manners.',
      'Pride blinds us to how others see us.'
    ],
    task: 'Re-read the letter Darcy writes Elizabeth after the proposal',
    question: "Why does Darcy misjudge Elizabeth's reaction to his proposal?"
  },
  {
    id: 'odyssey',
    book: 'The Odyssey',
    author: 'Homer',
    caught: 'Why Odysseus hides his name from the Cyclops',
    note: 'Cunning over raw strength',
    words: [
      "Odysseus tells the monster his name is 'Nobody' so the other giants won't help him.",
      'Clever wordplay saves his crew when fighting cannot.',
      'Wits win battles that brute force loses.'
    ],
    task: "Map out the main stops on Odysseus's journey home",
    question: 'What lesson does the Cyclops escape teach about solving impossible conflicts?'
  }
]

/** The gem: the page's last sentence, which is also the answer to its question. */
export const gemOf = (one: Story): string => one.words[one.words.length - 1]

/** The task as written into the page, its day said, in a sentence of its own: "I should find ... on Friday." */
export const taskPhrase = (one: Story, day: string): string => `${one.task[0].toLowerCase()}${one.task.slice(1)} on ${day}`

let current: Story = STORIES[0]

/** The story told now. */
export const story = (): Story => current

/** A new story for this run of the welcome, from `random` (0 to 1). */
export function pickStory(random: () => number = Math.random): Story {
  current = STORIES[Math.min(STORIES.length - 1, Math.floor(random() * STORIES.length))]
  return current
}

// Picked once as the app starts too, for the sandbox and a welcome page shown before one is opened.
pickStory()
