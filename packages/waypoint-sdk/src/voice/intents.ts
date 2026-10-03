// Spoken commands, English and Polish. Commands must match the whole utterance
// (after politeness words are removed), so "turn off notifications" is a goal and
// only "stop" on its own stops the guide.

export type VoiceLang = 'en' | 'pl';

export type VoiceIntent =
  | { kind: 'goal'; goal: string }
  | { kind: 'stop' }
  | { kind: 'repeat' }
  | { kind: 'back' }
  | { kind: 'next' }
  | { kind: 'whereAmI' }
  | { kind: 'describe' }
  | { kind: 'readAll' }
  | { kind: 'audit' }
  | { kind: 'help' }
  | { kind: 'empty' };

/** Lower case, Polish letters folded to ASCII, punctuation removed, spaces collapsed. */
export function normalise(text: string): string {
  const fold: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => fold[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const POLITE = ['please', 'prosze', 'waypoint', 'hey waypoint', 'hej waypoint', 'ok', 'okay'];

const COMMANDS: Array<[Exclude<VoiceIntent['kind'], 'goal' | 'empty'>, string[]]> = [
  ['stop', ['stop', 'cancel', 'quit', 'stop guide', 'stop the guide', 'przestan', 'zatrzymaj', 'stoj', 'koniec', 'anuluj', 'wystarczy']],
  ['repeat', ['repeat', 'again', 'say again', 'say that again', 'what', 'powtorz', 'jeszcze raz', 'slucham', 'co']],
  ['back', ['back', 'go back', 'previous', 'wroc', 'cofnij', 'wstecz', 'do tylu', 'poprzedni ekran']],
  ['next', ['next', 'done', 'continue', 'i did it', 'ok done', 'dalej', 'zrobione', 'gotowe', 'zrobilem', 'zrobilam', 'kontynuuj', 'nastepny']],
  ['whereAmI', ['where am i', 'which screen', 'what screen is this', 'gdzie jestem', 'jaki to ekran', 'co to za ekran']],
  [
    'describe',
    [
      'what is here',
      "what's here",
      'whats here',
      'what can i do',
      'what can i do here',
      'read the screen',
      'read screen',
      'describe the screen',
      'co tu jest',
      'co jest na ekranie',
      'co moge zrobic',
      'co moge tu zrobic',
      'przeczytaj ekran',
      'opisz ekran',
    ],
  ],
  [
    'readAll',
    ['read everything', 'read all', 'read it all', 'read the whole screen', 'przeczytaj wszystko', 'czytaj wszystko', 'przeczytaj caly ekran'],
  ],
  ['audit', ['audit', 'check accessibility', 'run the audit', 'accessibility check', 'sprawdz dostepnosc', 'audyt', 'zrob audyt']],
  ['help', ['help', 'what can you do', 'commands', 'pomoc', 'pomocy', 'co umiesz', 'jakie sa komendy']],
];

// Leading phrases that wrap a goal: "help me make the text bigger", "chcę kupić bilet".
const GOAL_PREFIXES = [
  'help me to',
  'help me',
  'i want to',
  'i would like to',
  "i'd like to",
  'id like to',
  'how do i',
  'how can i',
  'show me how to',
  'take me to',
  'i need to',
  'pomoz mi',
  'chce',
  'chcialbym',
  'chcialabym',
  'jak mam',
  'jak',
  'pokaz mi jak',
  'zabierz mnie do',
  'musze',
];

function stripPolite(s: string): string {
  let out = ` ${s} `;
  for (const p of POLITE) out = out.split(` ${p} `).join(' ');
  return out.replace(/\s+/g, ' ').trim();
}

export function parseUtterance(text: string): VoiceIntent {
  const norm = stripPolite(normalise(text));
  if (!norm) return { kind: 'empty' };
  for (const [kind, phrases] of COMMANDS) {
    if (phrases.includes(norm)) return { kind } as VoiceIntent;
  }
  let goal = text.trim();
  // Strip a wrapper phrase from the original text, keeping its casing and letters.
  const words = goal.split(/\s+/);
  for (const prefix of GOAL_PREFIXES) {
    const n = prefix.split(' ').length;
    if (normalise(words.slice(0, n).join(' ')) === prefix && words.length > n) {
      goal = words.slice(n).join(' ');
      break;
    }
  }
  goal = goal.replace(/^[\s,.:;!?-]+|[\s.!?]+$/g, '');
  return goal ? { kind: 'goal', goal } : { kind: 'empty' };
}

/** A rough language guess for replies when the app does not fix one. */
export function guessLang(text: string): VoiceLang {
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl';
  const n = ` ${normalise(text)} `;
  const pl = [
    ' co ', ' tu ', ' jest ', ' jak ', ' chce ', ' gdzie ', ' jestem ', ' prosze ', ' mi ', ' sie ', ' nie ', ' moge ',
    ' bilet', ' zmien', ' pokaz', ' wroc ', ' dalej ', ' sprawdz ', ' dostepnosc', ' powtorz ', ' przestan ', ' zatrzymaj ',
    ' cofnij ', ' pomoc', ' ekran', ' wylacz', ' wlacz', ' kup', ' zrob', ' moj', ' powieksz', ' jezyk',
  ];
  return pl.some((w) => n.includes(w)) ? 'pl' : 'en';
}
