/** The format example shown in the import dialog and put into the prompt. Fixture data: the sample book's own characters. */
export const EXAMPLE_JSON = JSON.stringify({
  entries: [
    {
      name: 'The Mad Hatter', type: 'Character', aliases: ['Hatter'], description: 'Hosts the tea-party.', appears_in: ['7'], confidence: 0.9,
      properties: [{ key: 'Habit', value: 'Always has tea', evidence: 'It’s the stupidest tea-party', paragraph: '7-1', confidence: 0.7 }],
      relationships: [{ to: 'Alice', relation: 'hosts', confidence: 0.8 }],
      claims: [{ kind: 'talk', text: 'Asks riddles', evidence: 'Who are you?', chapter: '5', paragraph: '5-2', confidence: 0.6 }],
    },
  ],
  speakers: [{ quote: '“Who are you?”', speaker: 'The Caterpillar', paragraph: '5-2', confidence: 0.95 }],
}, null, 2)

export const EXAMPLE_CSV = [
  'record,name,type,aliases,description,appears_in,key,value,to,relation,kind,text,evidence,chapter,paragraph,quote,speaker,confidence',
  'entry,The Mad Hatter,Character,Hatter,Hosts the tea-party.,7,,,,,,,,,,,,0.9',
  'property,The Mad Hatter,,,,,Habit,Always has tea,,,,,It’s the stupidest tea-party,,7-1,,,0.7',
  'relationship,The Mad Hatter,,,,,,,Alice,hosts,,,,,,,,0.8',
  'claim,The Mad Hatter,,,,,,,,,talk,Asks riddles,Who are you?,5,5-2,,,0.6',
  'speaker,,,,,,,,,,,,,,5-2,“Who are you?”,The Caterpillar,0.95',
].join('\n')
