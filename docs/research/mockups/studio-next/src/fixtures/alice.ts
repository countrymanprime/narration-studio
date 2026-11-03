/**
 * Sample book: "Alice's Adventures in Wonderland". Every screen in the app reads this data
 * (through selectors); nothing on screen is typed in by hand.
 */
import { guidOf } from '@/format/guid'
import type { Annotation, BookData, BibleEntry, Chapter, Detection, FxPreset, FxRegion, Paragraph, Passage, ProofNote, Take } from '@/domain/schemas'

type Prep = Chapter['prep']
const ch = (
  id: string,
  title: string,
  words: number,
  prep: Prep,
  rec: number,
  edit: number,
  proof: number,
  n?: number,
): Chapter => ({ id, n, title, kind: n == null ? 'credits' : 'chapter', words, prep, rec, edit, proof })

export const CHAPTERS: Chapter[] = [
  ch('open', 'Opening credits', 143, 'prepped', 100, 100, 100),
  ch('1', 'Down the Rabbit-Hole', 2140, 'prepped', 100, 100, 100, 1),
  ch('2', 'The Pool of Tears', 2093, 'prepped', 100, 100, 100, 2),
  ch('3', 'A Caucus-Race and a Long Tale', 1694, 'prepped', 100, 100, 100, 3),
  ch('4', 'The Rabbit Sends in a Little Bill', 2618, 'prepped', 100, 100, 100, 4),
  ch('5', 'Advice from a Caterpillar', 2172, 'prepped', 100, 100, 0, 5),
  ch('6', 'Pig and Pepper', 2960, 'prepped', 100, 62, 0, 6),
  ch('7', 'A Mad Tea-Party', 2650, 'prepped', 41, 0, 0, 7),
  ch('8', 'The Queen’s Croquet-Ground', 3412, 'progress', 0, 0, 0, 8),
  ch('9', 'The Mock Turtle’s Story', 2400, 'prepped', 0, 0, 0, 9),
  ch('10', 'The Lobster Quadrille', 2150, 'none', 0, 0, 0, 10),
  ch('11', 'Who Stole the Tarts?', 2330, 'none', 0, 0, 0, 11),
  ch('12', 'Alice’s Evidence', 2380, 'none', 0, 0, 0, 12),
  ch('close', 'Closing credits', 80, 'prepped', 0, 0, 0),
]

const P = (id: string, speaker: string, text: string): Paragraph => ({
  id,
  chapterId: id.startsWith('o-') ? 'open' : id.startsWith('c-') ? 'close' : id.split('-')[0],
  speaker,
  text,
})

/** Only these chapters have text in the sample. */
export const PARAGRAPHS: Paragraph[] = [
  P('o-1', 'NARR', 'Alice’s Adventures in Wonderland. By Lewis Carroll. Narrated by Sam Rivera. Produced by Sam Rivera Audio.'),
  P('3-1', 'NARR', 'The Mouse said this with great dignity. “I am older than you, and must know better.” And this the Dodo could not do without a great deal of thought.'),
  P('3-2', 'NARR', 'They were indeed a queer-looking party that assembled on the bank—all dripping wet, cross, and uncomfortable.'),
  P('3-3', 'NARR', 'At last the Mouse, who seemed to be a person of some authority among them, called out, “Sit down, all of you, and listen to me! I’ll soon make you dry enough!”'),
  P('3-4', 'NARR', 'Then the Dodo solemnly presented the thimble, saying “We beg your acceptance of this elegant thimble.”'),
  P('5-1', 'NARR', 'The Caterpillar and Alice looked at each other for some time in silence: at last the Caterpillar took the hookah out of its mouth, and addressed her in a languid, sleepy voice.'),
  P('5-2', 'NARR', '“Who are you?” said the Caterpillar.'),
  P('5-3', 'NARR', 'This was not an encouraging opening for a conversation. Alice replied, rather shyly, “I—I hardly know, sir, just at present—at least I know who I was when I got up this morning, but I think I must have been changed several times since then.”'),
  P('5-4', 'NARR', '“What do you mean by that?” said the Caterpillar sternly. “Explain yourself!”'),
  P('5-5', 'NARR', '“I can’t explain myself, I’m afraid, sir,” said Alice, “because I’m not myself, you see.”'),
  P('5-6', 'NARR', '“I don’t see,” said the Caterpillar.'),
  P('5-7', 'NARR', '“I’m afraid I can’t put it more clearly,” Alice replied very politely, “for I can’t understand it myself to begin with; and being so many different sizes in a day is very confusing.”'),
  P('5-8', 'NARR', '“It isn’t,” said the Caterpillar.'),
  P('5-9', 'NARR', '“Well, perhaps you haven’t found it so yet,” said Alice; “but when you have to turn into a chrysalis—you will some day, you know—and then after that into a butterfly, I should think you’ll feel it a little queer, won’t you?”'),
  P('5-10', 'NARR', '“Not a bit,” said the Caterpillar.'),
  P('5-11', 'NARR', '“Well, perhaps your feelings may be different,” said Alice; “all I know is, it would feel very queer to me.”'),
  P('5-12', 'NARR', '“You!” said the Caterpillar contemptuously. “Who are you?”'),
  P('5-13', 'NARR', 'The Caterpillar took the hookah out of its mouth again, and said, “So you think you’re changed, do you?”'),
  P('5-14', 'NARR', '“I’m afraid I am, sir,” said Alice. “I can’t remember things as I used—and I don’t keep the same size for ten minutes together!”'),
  P('5-15', 'NARR', '“Serpent!” screamed the Pigeon.'),
  P('5-16', 'NARR', '“I’m not a serpent!” said Alice indignantly. “Let me alone!”'),
  P('7-1', 'ALICE', '“I’ll never go there again!” said Alice as she picked her way through the wood. “It’s the stupidest tea-party I ever was at in all my life!”'),
  P('7-2', 'NARR', 'Just as she said this, she noticed that one of the trees had a door leading right into it. “That’s very curious!” she thought. “But everything’s curious today. I think I may as well go in at once.” And in she went.'),
  P('7-3', 'NARR', 'Once more she found herself in the long hall, and close to the little glass table. “Now, I’ll manage better this time,” she said to herself, and began by taking the little golden key, and unlocking the door that led into the garden. Then she set to work nibbling at the mushroom (she had kept a piece of it in her pocket) till she was about a foot high: then she walked down the little passage: and then—she found herself at last in the beautiful garden, among the bright flower-beds and the cool fountains.'),
  P('8-1', 'NARR', 'A large rose-tree stood near the entrance of the garden: the roses growing on it were white, but there were three gardeners at it, busily painting them red. Alice thought this a very curious thing, and she went nearer to watch them, and just as she came up to them she heard one of them say, “Look out now, Five! Don’t go splashing paint over me like that!”'),
  P('8-2', 'FIVE', '“I couldn’t help it,” said Five, in a sulky tone; “Seven jogged my elbow.”'),
  P('8-3', 'SEVEN', 'On which Seven looked up and said, “That’s right, Five! Always lay the blame on others!”'),
  P('8-4', 'FIVE', '“You’d better not talk!” said Five. “I heard the Queen say only yesterday you deserved to be beheaded!”'),
  P('8-5', 'TWO', '“What for?” said the one who had spoken first.'),
  P('8-6', 'SEVEN', '“That’s none of your business, Two!” said Seven.'),
  P('8-7', 'FIVE', '“Yes, it is his business!” said Five, “and I’ll tell him—it was for bringing the cook tulip-roots instead of onions.”'),
  P('8-8', 'NARR', 'Seven flung down his brush, and had just begun “Well, of all the unjust things—” when his eye chanced to fall upon Alice, as she stood watching them, and he checked himself suddenly: the others looked round also, and all of them bowed low.'),
  P('8-9', 'ALICE', '“Would you tell me,” said Alice, a little timidly, “why you are painting those roses?”'),
  P('8-10', 'TWO', 'Two began in a low voice, “Why, the fact is, you see, Miss, this here ought to have been a red rose-tree, and we put a white one in by mistake; and if the Queen was to find it out, we should all have our heads cut off, you know. So you see, Miss, we’re doing our best, afore she comes, to—”'),
  P('8-11', 'NARR', 'At this moment Five, who had been anxiously looking across the garden, called out “The Queen! The Queen!” and the three gardeners instantly threw themselves flat upon their faces. There was a sound of many footsteps, and Alice looked round, eager to see the Queen.'),
  P('8-12', 'NARR', 'First came ten soldiers carrying clubs; these were all shaped like the three gardeners, oblong and flat, with their hands and feet at the corners. After these came the royal children, all ornamented with hearts. Next came the guests, mostly Kings and Queens, and among them Alice recognised the White Rabbit: it was talking in a hurried nervous manner, smiling at everything that was said, and went by without noticing her. Then followed the Knave of Hearts, carrying the King’s crown on a crimson velvet cushion; and, last of all this grand procession, came THE KING AND QUEEN OF HEARTS.'),
  P('8-13', 'QUEEN', '“Off with her head!” the Queen shouted at the top of her voice. Nobody moved.'),
  P('8-14', 'QUEEN', '“Who are these?” said the Queen, pointing to the three gardeners who were lying round the rosetree.'),
  P('8-15', 'NARR', '“Can you play croquet?” The soldiers were silent, and looked at Alice, as the question was evidently meant for her. “Yes!” shouted Alice.'),
  P('8-16', 'NARR', 'Alice thought she had never seen such a curious croquet-ground in her life; it was all ridges and furrows; the croquet-balls were live hedgehogs, the mallets live flamingoes, and the soldiers had to double themselves up and stand on their hands and feet, to make the arches.'),
  P('9-1', 'DUCHESS', '“You can’t think how glad I am to see you again, you dear old thing!” said the Duchess, as she tucked her arm affectionately into Alice’s, and they walked off together.'),
  P('9-2', 'NARR', 'Alice was very glad to find her in such a pleasant temper, and thought to herself that perhaps it was only the pepper that had made her so savage when they met in the kitchen.'),
  P('9-3', 'ALICE', '“When I’m a Duchess,” she said to herself, (not in a very hopeful tone though), “I won’t have any pepper in my kitchen at all. Soup does very well without—Maybe it’s always pepper that makes people hot-tempered,” she went on, very much pleased at having found out a new kind of rule, “and vinegar that makes them sour—and camomile that makes them bitter—and—and barley-sugar and such things that make children sweet-tempered.”'),
  P('c-1', 'NARR', 'That was Alice’s Adventures in Wonderland, by Lewis Carroll. Narrated by Sam Rivera. Copyright 2026 Sam Rivera Audio. Thank you for listening.'),
]

/** Annotations are placed by quoting the text they sit on, so the range always matches the text. */
function seed(list: Annotation[], pid: string, sub: string, o: Partial<Annotation> & Pick<Annotation, 'type'>): void {
  const p = PARAGRAPHS.find((x) => x.id === pid)
  const s = p ? p.text.indexOf(sub) : -1
  if (!p || s < 0) throw new Error('seed: "' + sub + '" not found in ' + pid)
  list.push({ id: 'a' + (101 + list.length), p: pid, s, e: s + sub.length, q: sub, ...o })
}

export function seedAnnotations(): Annotation[] {
  const a: Annotation[] = []
  seed(a, '8-1', 'rose-tree', {
    type: 'mark', mark: 'ask', status: 'resolved',
    text: 'The manuscript spells this “rose-tree” here and “rosetree” in ¶ 14. Which should I follow?',
    thread: [
      { who: 'you', text: 'Asked in the ACX message thread.', at: 'Sep 12' },
      { who: 'author', text: 'Use “rose-tree” everywhere. Sorry for the typo in ¶ 14.', at: 'Sep 14' },
    ],
  })
  seed(a, '8-16', 'hedgehogs', {
    type: 'mark', mark: 'ask', status: 'open',
    text: 'Is “hedgehogs” meant as the live animals, or should I play it as a stage direction?',
    thread: [{ who: 'you', text: 'Asked by email.', at: 'Sep 12' }],
  })
  seed(a, '8-13', 'Off with her head!', { type: 'mark', mark: 'note', text: 'Loud, not shrill. Save energy for the second one in ¶ 14.' })
  seed(a, '8-4', 'Queen', { type: 'mark', mark: 'stress' })
  seed(a, '8-15', 'croquet', { type: 'pron', key: 'croquet' })
  seed(a, '8-16', 'flamingoes', { type: 'pron', key: 'flamingoes' })
  seed(a, '8-16', 'croquet', { type: 'pron', key: 'croquet' })
  seed(a, '8-14', 'rosetree', { type: 'pron', key: 'rose-tree' })
  seed(a, '8-12', 'Knave', { type: 'pron', key: 'Knave' })
  return a
}

const entry = (
  name: string,
  kind: string,
  aka: string[],
  o: Partial<BibleEntry> = {},
): BibleEntry => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name, kind, aka, sum: '', voice: '', acts: '', knows: '', first: null, say: '', ...o,
})

export const BIBLE: BibleEntry[] = [
  entry('Alice', 'Character', ['Alice'], { sum: 'The protagonist. Curious and polite; talks to herself and argues with her own advice.', voice: 'Clear, young, well brought up. Gets braver and sharper as the book goes on.', acts: 'Tries to be polite to everyone, then loses patience.', knows: 'Has not met the Queen. Has met the Duchess and the Cheshire Cat.', first: '1', say: 'AL-iss', saySrc: { Alice: 'auto' } }),
  entry('Queen of Hearts', 'Character', ['Queen', 'Queen of Hearts'], { sum: 'Rules the garden and sentences everyone to lose their head.', voice: 'Shrill, imperious, loud. Sentences arrive at once and without thought.', acts: 'Never carries out a sentence: others quietly pardon the condemned.', knows: 'Knows nothing about Alice yet.', first: '8' }),
  entry('The gardeners', 'Character', ['Five', 'Seven', 'Two', 'gardeners'], { sum: 'Three playing-card gardeners painting the white roses red. Five is sulky, Seven blames others, Two explains.', voice: 'Working-class London. Nervous, tumbling over each other.', acts: 'Drop flat on their faces when the Queen arrives.', knows: 'They planted a white rose-tree by mistake and fear for their heads.', first: '8', review: { entry: false, aliases: ['gardeners'] } }),
  entry('White Rabbit', 'Character', ['White Rabbit'], { sum: 'A nervous herald who is always late.', voice: 'Fluttery, apologetic, fast.', acts: 'Smiles at everything said, and does not notice Alice in the procession.', knows: 'Knows the Queen’s moods.', first: '1' }),
  entry('Duchess', 'Character', ['Duchess'], { sum: 'A bad-tempered aristocrat who turns sugary.', voice: 'Sharp and moralising in Ch 6; warm and clingy in Ch 9.', acts: 'Finds a moral in everything.', knows: 'Is under threat from the Queen.', first: '6', review: { entry: true, aliases: [] } }),
  entry('King of Hearts', 'Character', ['King'], { sum: 'Mild and kind. Quietly pardons the condemned.', voice: 'Mild, hesitant, gentle authority.', acts: 'Whispers pardons to the crowd behind the Queen’s back.', knows: 'Knows how to manage the Queen.', first: '8' }),
  entry('Knave of Hearts', 'Character', ['Knave'], { sum: 'Carries the King’s crown; later accused of stealing tarts.', voice: 'Quiet.', acts: 'Says little.', first: '8', say: 'nayv', saySrc: { Knave: 'online' }, review: { entry: true, aliases: [] } }),
  entry('The Caterpillar', 'Character', ['Caterpillar'], { user: true }),
  entry('The garden', 'Location', ['garden'], { user: true }),
  entry('The long hall', 'Location', ['long hall'], { user: true }),
  entry('The golden key', 'Item', ['golden key'], { user: true }),
  entry('The thimble', 'Item', ['thimble'], { user: true }),
  entry('The hookah', 'Item', ['hookah'], { user: true }),
  entry('The tea-party', 'Event', ['tea-party'], { user: true }),
  entry('Off with her head!', 'Other', ['Off with her head'], { user: true }),
]

const R = (id: number, a: string, rel: string, b: string) => ({ id, a, rel, b })
export const RELATIONSHIPS = [
  R(1, 'queen-of-hearts', 'is married to', 'king-of-hearts'),
  R(2, 'the-gardeners', 'serve', 'queen-of-hearts'),
  R(3, 'alice', 'finds', 'the-golden-key'),
  R(4, 'the-caterpillar', 'smokes', 'the-hookah'),
  R(5, 'queen-of-hearts', 'rules', 'the-garden'),
  R(6, 'alice', 'goes to', 'the-tea-party'),
]

export const PRONUNCIATIONS = {
  croquet: { say: 'kroh-KAY', src: 'online' },
  flamingoes: { say: 'fluh-MING-gohz', src: 'dictionary' },
  hedgehogs: { say: '', src: '' },
  'rose-tree': { say: '', src: '' },
  Knave: { say: '', src: '' },
}

/** A small bundled dictionary, shown inline when the narrator chooses the local dictionary. */
export const DICTIONARY = {
  croquet: { pos: 'noun', def: 'A lawn game in which players hit wooden balls through hoops with a mallet.', say: 'kroh-KAY', ipa: '/kroʊˈkeɪ/' },
  flamingoes: { pos: 'noun, plural', def: 'Tall wading birds with long necks, long legs and pink feathers.', say: 'fluh-MING-gohz', ipa: '/fləˈmɪŋɡoʊz/' },
  hedgehogs: { pos: 'noun, plural', def: 'Small spiny mammals that roll into a ball when threatened.', say: 'HEJ-hogz', ipa: '/ˈhɛdʒhɒɡz/' },
  knave: { pos: 'noun', def: 'A dishonest man; also the jack in a pack of cards.', say: 'nayv', ipa: '/neɪv/' },
  procession: { pos: 'noun', def: 'A number of people moving forward in an orderly line, often as a ceremony.', say: 'pruh-SESH-un', ipa: '/prəˈsɛʃən/' },
  timidly: { pos: 'adverb', def: 'In a way that shows a lack of courage or confidence.', say: 'TIM-id-lee', ipa: '/ˈtɪmɪdli/' },
}

/** Why a note has no confidence: only an analysis that scores its guess has one. */
const NO_SCORE = {
  proofer: 'A proofer’s note carries no score.',
  mixed: 'The proofer and the check did not give one score.',
  bible: 'A Story Bible check has no score.',
  measured: 'A measured length has no score.',
}
const note = (o: Partial<ProofNote> & Pick<ProofNote, 'id' | 't' | 'sec' | 'ty' | 'h' | 'pid'>): ProofNote => ({
  chapterId: '5', script: '', heard: '', from: '', note: '', res: null, conf: null, evidence: '', history: [], ...o,
})

export const PROOF_NOTES: ProofNote[] = [
  note({ id: 1, t: '02:14.6', sec: 134.6, ty: 'misread', pid: '5-2', h: '“Who are you?” — stressed “are”; the text italicises “you”', script: '“Who are <i>you</i>?” said the Caterpillar.', heard: '“Who <del>are</del> <ins>you</ins>?” — stress lands on <del>are</del>', from: 'Proofer + AI', confReason: NO_SCORE.mixed, note: 'Stress is on “you” in the text (italic). Read with stress on “are”.', res: 'pickup' }),
  note({ id: 2, t: '03:40.2', sec: 220.2, ty: 'skip', pid: '5-5', h: '“I can’t explain myself, I’m afraid, sir”', script: '“I can’t explain <b>myself</b>, I’m afraid, sir,”', heard: '“I can’t explain <del>myself</del>, I’m afraid, sir,”', from: 'AI', conf: 0.97, note: 'Word “myself” not heard.', res: 'pickup' }),
  note({ id: 3, t: '04:02.9', sec: 242.9, ty: 'mouth', pid: '5-5', h: 'click before “because”', script: '…<b>because</b> I’m not myself, you see.', heard: 'Mouth click 40 ms before “because”', from: 'Proofer', confReason: NO_SCORE.proofer, note: 'Small wet click.', db: -24, dur: 0.04 }),
  note({ id: 4, t: '05:31.0', sec: 331, ty: 'pron', pid: '5-13', h: '“hookah” — said HOO-kuh, bible says HOO-kah', script: '…sitting on a mushroom, smoking a long <b>hookah</b>.', heard: 'Heard “HOO-kuh”; story bible: “HOO-kah”', from: 'Bible check', confReason: NO_SCORE.bible, note: 'Check with author which is intended.', res: 'pickup' }),
  note({ id: 5, t: '06:18.4', sec: 378.4, ty: 'pacing', pid: '5-4', h: '2.8 s gap after “Explain yourself!”', script: '“Explain yourself!” said the Caterpillar.', heard: 'Gap 2.8 s (target 0.6–1.2 s)', from: 'AI', confReason: NO_SCORE.measured, dur: 2.8 }),
  note({ id: 6, t: '07:55.7', sec: 475.7, ty: 'repeat', pid: '5-9', h: '“she she went on”', script: '…she went on,', heard: '“she <del>she</del> went on”', from: 'AI', conf: 0.99 }),
  note({ id: 7, t: '08:12.1', sec: 492.1, ty: 'plosive', pid: '5-9', h: '“paper” P-pop', script: '…a sheet of <b>paper</b>…', heard: 'Plosive peak on “p” (+6 dB)', from: 'Proofer', confReason: NO_SCORE.proofer, db: -8, dur: 0.09 }),
  note({ id: 8, t: '09:47.3', sec: 587.3, ty: 'misread', pid: '5-11', h: '“curiouser” vs “curious”', script: '“Curiouser and curiouser!” cried Alice.', heard: '“<del>curious</del><ins>curiouser</ins> and curious”', from: 'AI', conf: 0.81, note: 'Author’s spelling is intended.', res: 'waive' }),
  note({ id: 9, t: '10:20.8', sec: 620.8, ty: 'noise', pid: '5-15', h: 'chair creak under “serpent”', script: '“Serpent!” screamed the Pigeon.', heard: 'Low creak 620 ms', from: 'Proofer', confReason: NO_SCORE.proofer, res: 'pickup', db: -34, dur: 0.62 }),
  note({ id: 10, t: '03:52.4', sec: 232.4, ty: 'takes', pid: '5-5', h: 'Restarted 3 times: “I can’t explain myself, I’m afraid, sir”', from: 'AI', conf: 0.94 }),
]

/* Editing: takes of a passage, the analysis findings that are not proof notes, effect presets and the regions they sit on. */
const take = (id: string, start: number, len: number, text: string): Take => ({ id, source: 'reaper', start, len, active: false, text, via: 'alignment' })
/** A take the Booth recorded: its place was written at record time, with the ids the DAW gave it. */
const boothed = (t: Take): Take => ({ ...t, via: 'map', itemGuid: guidOf('item', 'fx/' + t.id.slice(0, 3)), takeGuid: guidOf('take', 'fx/' + t.id) })
/** The last take is the one REAPER leaves on top, so it is the active one until the narrator chooses. */
function passage(id: string, chapterId: string, pid: string, quote: string | null, takes: Take[]): Passage {
  const p = PARAGRAPHS.find((x) => x.id === pid)
  const s = p ? (quote ? p.text.indexOf(quote) : 0) : -1
  if (!p || s < 0) throw new Error('passage: "' + quote + '" not found in ' + pid)
  return { id, chapterId, pid, s, e: s + (quote ?? p.text).length, kept: false, prepped: [], takes: takes.map((t, i) => ({ ...t, active: i === takes.length - 1 })) }
}

export const PASSAGES: Passage[] = [
  passage('ps3-1', '3', '3-1', '“I am older than you, and must know better.”', [
    boothed(take('T03-1', 126.4, 4, '“I am older than you, and must—”')),
    boothed(take('T03-2', 131, 5, '“I am older than you, and must know better.”')),
  ]),
  passage('ps3-3', '3', '3-3', '“Sit down, all of you, and listen to me! I’ll soon make you dry enough!”', [
    boothed(take('T03-3', 300.2, 6, '“Sit down, all of you, and listen to me! I’ll—”')),
    boothed(take('T03-4', 307.5, 7, '“Sit down, all of you, and listen to me! I will soon make you dry enough!”')),
    boothed(take('T03-5', 316, 7, '“Sit down, all of you, and listen to me! I’ll soon make you dry enough!”')),
  ]),
  passage('ps5-3', '5', '5-3', '“I—I hardly know, sir, just at present—at least I know who I was when I got up this morning, but I think I must have been changed several times since then.”', [
    take('T05-4', 150.2, 12, '“I—I hardly know, sir, just at present—at least I know who I was when I got—”'),
    take('T05-5', 164, 17, '“I—I hardly know, sir, just at present—at least I know who I was when I got up this morning, but I think I must have been changed several times since then.”'),
  ]),
  passage('ps5-5', '5', '5-5', null, [
    take('T05-1', 232.4, 5, '“I can’t explain myself, I’m a—”'),
    take('T05-2', 239.1, 8, '“I can’t explain myself, I’m afraid, sir,” said Alice, “because I’m not my—”'),
    take('T05-3', 247.8, 9, '“I can’t explain myself, I’m afraid, sir,” said Alice, “because I’m not myself, you see.”'),
  ]),
  passage('ps5-9', '5', '5-9', null, [
    take('T05-6', 462, 6, '“Well, perhaps you haven’t found it so yet,” said Alice; “but when you have to turn into a chrys—”'),
    take('T05-7', 470.5, 10, '“Well, perhaps you haven’t found it so yet,” said Alice; “but when you have to turn into a chrysalis—you will some day, you know—and then after that into a butter—”'),
    take('T05-8', 482, 15, '“Well, perhaps you haven’t found it so yet,” said Alice; “but when you have to turn into a chrysalis—you will some day, you know—and then after that into a butterfly, I should think you’ll feel it a little queer, don’t you?”'),
    take('T05-9', 498.2, 15, '“Well, perhaps you haven’t found it so yet,” said Alice; “but when you have to turn into a chrysalis—you will some day, you know—and then after that into a butterfly, I should think you’ll feel it a little queer, won’t you?”'),
  ]),
  /* One stretch of audio that reads the line twice in a row: a duplicate read the narrator can split into two takes. */
  passage('ps5-15', '5', '5-15', null, [
    take('T05-12', 617.2, 8, '“Serpent!” screamed the Pigeon. “Serpent!” screamed the Pigeon.'),
  ]),
  passage('ps5-14', '5', '5-14', null, [
    take('T05-10', 552, 9, '“I’m afraid I am, sir,” said Alice. “I can’t remember things as I used—and I don’t keep the same—”'),
    take('T05-11', 562.4, 11, '“I’m afraid I am, sir,” said Alice. “I can’t remember things as I used—and I don’t keep the same size for ten minutes together!”'),
  ]),
]

const det = (id: string, ty: Detection['ty'], sec: number, dur: number, db?: number, pid: string | null = null): Detection => ({ id, chapterId: '5', ty, sec, dur, db, pid, res: null })
export const DETECTIONS: Detection[] = [
  det('d1', 'pacing', 96.2, 1.6), det('d2', 'pacing', 188, 2.4), det('d3', 'pacing', 262, 0.9), det('d4', 'pacing', 305.4, 1.3),
  det('d5', 'pacing', 441, 3.1), det('d6', 'pacing', 556.3, 1.9), det('d7', 'pacing', 690.8, 1.5),
  det('b1', 'breath', 41.3, 0.52, -19), det('b2', 'breath', 77.9, 0.44, -24), det('b3', 'breath', 118.6, 0.38, -28), det('b4', 'breath', 150, 0.66, -17),
  det('b5', 'breath', 203.4, 0.47, -22), det('b6', 'breath', 276.1, 0.31, -31), det('b7', 'breath', 321.7, 0.58, -21), det('b8', 'breath', 399.9, 0.41, -26),
  det('b9', 'breath', 453.2, 0.62, -18), det('b10', 'breath', 520.5, 0.35, -29), det('b11', 'breath', 603.8, 0.5, -23), det('b12', 'breath', 668, 0.28, -33),
  det('c1', 'mouth', 58.4, 0.03, -27), det('c2', 'mouth', 171.9, 0.05, -21), det('c3', 'mouth', 349, 0.03, -30), det('c4', 'mouth', 512.7, 0.04, -26), det('c5', 'mouth', 647.2, 0.02, -35),
  det('p1', 'plosive', 132.5, 0.08, -12), det('p2', 'plosive', 287.3, 0.1, -6), det('p3', 'plosive', 410.6, 0.07, -15), det('p4', 'plosive', 634.1, 0.09, -10),
  det('n1', 'noise', 214.6, 1.4, -38), det('n2', 'noise', 487.9, 0.8, -31),
]

export const FX_PRESETS: FxPreset[] = [
  { id: 'robot', name: 'Robot voice', effect: 'pitch', params: { semitones: -5, mix: 100 } },
  { id: 'deess', name: 'De-ess', effect: 'deess', params: { freq: 7, amount: 6 } },
  { id: 'deplosive', name: 'De-plosive', effect: 'deplosive', params: { cutoff: 90, amount: 6 } },
  { id: 'declick', name: 'De-click', effect: 'declick', params: { sensitivity: 50 } },
  { id: 'denoise', name: 'Noise reduction', effect: 'denoise', params: { reduction: 12 } },
  { id: 'eq', name: 'EQ: voice match', effect: 'eq', params: { lowcut: 80, presence: 2 } },
]

const region = (id: string, chapterId: string, presetId: string, start: number, end: number, o: Partial<FxRegion> = {}): FxRegion => {
  const pr = FX_PRESETS.find((x) => x.id === presetId)!
  return { id, chapterId, start, end, scope: 'section', effect: pr.effect, presetId, params: { ...pr.params }, bypass: false, ...o }
}
export const FX_REGIONS: FxRegion[] = [
  region('fx1', '5', 'declick', 238, 250),
  region('fx2', '5', 'denoise', 247.8, 256.8, { scope: 'take', takeId: 'T05-3', params: { reduction: 10 } }),
  region('fx3', '5', 'deess', 488, 504),
  // The Queen's lines in chapter 8.
  region('fx4', '8', 'robot', 301, 327),
  region('fx5', '8', 'robot', 336, 362),
  region('fx6', '8', 'deess', 600, 616, { bypass: true }),
]

export const PICKUPS = [
  { id: 'c3a', chapterId: '3', pid: '3-1', src: 'speech', conf: 0.97, gap: 'misread', t: '02:11.0', ty: 'misread', script: '“I am older than you, and must know better.”', ctx: 'The Mouse said this with great dignity. “I am older than you, and must know better.” And this the Dodo could not do without a great deal of thought.' },
  { id: 'c3b', chapterId: '3', pid: '3-2', src: 'speech', conf: 0.93, gap: 'missing', t: '05:48.2', ty: 'skip', script: '…all dripping wet, cross, and uncomfortable.', ctx: 'They were indeed a queer-looking party that assembled on the bank—all dripping wet, cross, and uncomfortable.' },
  { id: 'c3c', chapterId: '3', pid: '3-4', src: 'audio', t: '07:30.9', ty: 'noise', script: '…the Dodo solemnly presented the thimble.', ctx: 'Then the Dodo solemnly presented the thimble, saying “We beg your acceptance of this elegant thimble.”' },
]

const MR = (id: string, len: string, rms: number, peak: number, nf: number, head: number, tail: number, clicks: string, text: string) => ({ id, len, rms, peak, nf, head, tail, clicks, text })
export const MASTER_ROWS = [
  MR('open', '0:12', -20.1, -3.4, -64.8, 0.8, 2.1, '0', '✓'),
  MR('1', '11:48', -19.6, -3.2, -63.9, 0.7, 2.4, '2 low', '99.6%'),
  MR('2', '12:05', -19.9, -3.1, -64.2, 0.9, 2.0, '0', '99.8%'),
  { id: '3', waiting: 'pickups' },
  MR('4', '13:10', -20.4, -3.6, -57.8, 0.4, 2.2, '7', '99.5%'),
  { ...MR('sample', '4:40', -19.8, -3.3, -64.0, 1.0, 1.9, '0', '✓'), label: 'Retail sample' },
]

export const MILESTONES = [
  { id: 1, name: 'First 15 minutes approved', date: '2026-09-18', done: true, scope: 'custom' },
  { id: 2, name: 'Chapters 1–6 proofed', date: '2026-09-30', scope: 'ch6' },
  { id: 3, name: 'All chapters recorded', date: '2026-10-07', scope: 'rec' },
  { id: 4, name: 'Edit and proof complete', date: '2026-10-11', scope: 'editproof' },
]

export const PENDING_MANUSCRIPT = {
  changes: [
    { chapterId: '3', what: '12 words edited' },
    { chapterId: '5', what: '41 words edited' },
    { chapterId: '8', what: 'one paragraph added (186 words)' },
  ],
  characterSuggestions: 6,
  itemsToReview: 1,
  subtitle: { chapterId: '3', text: 'And a Long Tale' },
}

export const PROJECTS = [
  { id: 'alice', name: 'Alice’s Adventures in Wonderland', path: 'C:\\Audiobooks\\Alice', when: 'Today' },
  { id: 'glass', name: 'Through the Looking-Glass', path: 'C:\\Audiobooks\\Looking-Glass', when: '23 Sep' },
  { id: 'garden', name: 'The Secret Garden', path: 'C:\\Audiobooks\\Secret Garden', when: '18 Sep' },
]

export const DEFAULT_MARKS = [
  { k: 'stress', name: 'Word stress', c: 'copper', st: 'highlight' },
  { k: 'breath', name: 'Breath / pause', c: 'info', st: 'dotted' },
  { k: 'pace', name: 'Pace', c: 'ok', st: 'wavy' },
  { k: 'emo', name: 'Emotion', c: 'bad', st: 'underline' },
  { k: 'note', name: 'Note', c: 'violet', st: 'double' },
  { k: 'ask', name: 'Query for author', c: 'warn', st: 'highlight', ask: true },
]

export const DEFAULT_BIBLE_TYPES = [
  { k: 'Character', c: 'violet', speaker: true },
  { k: 'Location', c: 'info' },
  { k: 'Item', c: 'warn' },
  { k: 'Event', c: 'bad' },
  { k: 'Other', c: 'ok' },
]
