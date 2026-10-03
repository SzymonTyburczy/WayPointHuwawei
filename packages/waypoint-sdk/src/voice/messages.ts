// Everything the voice layer says, in English and Polish. Screen text (names,
// titles) is inserted as data and is never interpreted.
import type { Rect } from '../types';
import type { VoiceLang } from './intents';

export type Position =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'middle'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** 3 × 3 grid position of the centre of `frame` within the viewport. */
export function positionOf(frame: Rect, viewport: Rect): Position {
  const cx = frame.x + frame.w / 2 - viewport.x;
  const cy = frame.y + frame.h / 2 - viewport.y;
  const col = cx < viewport.w / 3 ? 0 : cx < (2 * viewport.w) / 3 ? 1 : 2;
  const row = cy < viewport.h / 3 ? 0 : cy < (2 * viewport.h) / 3 ? 1 : 2;
  const grid: Position[][] = [
    ['top-left', 'top', 'top-right'],
    ['left', 'middle', 'right'],
    ['bottom-left', 'bottom', 'bottom-right'],
  ];
  return grid[row][col];
}

const POSITION: Record<VoiceLang, Record<Position, string>> = {
  en: {
    'top-left': 'at the top left',
    top: 'at the top',
    'top-right': 'at the top right',
    left: 'on the left',
    middle: 'in the middle of the screen',
    right: 'on the right',
    'bottom-left': 'at the bottom left',
    bottom: 'at the bottom',
    'bottom-right': 'at the bottom right',
  },
  pl: {
    'top-left': 'na górze po lewej',
    top: 'na górze',
    'top-right': 'na górze po prawej',
    left: 'po lewej',
    middle: 'na środku ekranu',
    right: 'po prawej',
    'bottom-left': 'na dole po lewej',
    bottom: 'na dole',
    'bottom-right': 'na dole po prawej',
  },
};

export function describePosition(frame: Rect, viewport: Rect, lang: VoiceLang): string {
  return POSITION[lang][positionOf(frame, viewport)];
}

function list(items: string[], lang: VoiceLang): string {
  if (items.length <= 1) return items.join('');
  const and = lang === 'pl' ? ' i ' : ' and ';
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`;
}

function plural(n: number, lang: VoiceLang, en: [string, string], pl: [string, string, string]): string {
  if (lang === 'en') return n === 1 ? en[0] : en[1];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return pl[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return pl[1];
  return pl[2];
}

export const say = {
  listening: (lang: VoiceLang) => (lang === 'pl' ? 'Słucham.' : 'Listening.'),
  didNotHear: (lang: VoiceLang) => (lang === 'pl' ? 'Nie usłyszałem. Spróbuj jeszcze raz.' : "I didn't catch that. Please try again."),
  starting: (goal: string, lang: VoiceLang) => (lang === 'pl' ? `Dobrze: ${goal}.` : `Okay: ${goal}.`),
  stopped: (lang: VoiceLang) => (lang === 'pl' ? 'Zatrzymałem przewodnik.' : 'Guide stopped.'),
  nothingToRepeat: (lang: VoiceLang) => (lang === 'pl' ? 'Nie mam nic do powtórzenia.' : 'There is nothing to repeat yet.'),
  goBack: (lang: VoiceLang) => (lang === 'pl' ? 'Wróć do poprzedniego ekranu gestem wstecz.' : 'Go back with the back gesture.'),
  noGuide: (lang: VoiceLang) =>
    lang === 'pl' ? 'Przewodnik nie działa. Powiedz, co chcesz zrobić.' : 'No guide is running. Tell me what you want to do.',
  tap: (name: string, where: string, lang: VoiceLang) =>
    lang === 'pl' ? `Dotknij „${name}”, ${where}.` : `Tap "${name}", ${where}.`,
  tapUnnamed: (where: string, lang: VoiceLang) =>
    lang === 'pl' ? `Dotknij podświetlony element, ${where}.` : `Tap the highlighted item, ${where}.`,
  scroll: (dir: 'up' | 'down', lang: VoiceLang) =>
    lang === 'pl' ? (dir === 'down' ? 'Przewiń w dół.' : 'Przewiń w górę.') : dir === 'down' ? 'Scroll down.' : 'Scroll up.',
  back: (lang: VoiceLang) => (lang === 'pl' ? 'Wróć do poprzedniego ekranu.' : 'Go back to the previous screen.'),
  done: (lang: VoiceLang) => (lang === 'pl' ? 'Jesteś na miejscu.' : 'You are there.'),
  ask: (lang: VoiceLang) =>
    lang === 'pl' ? 'Nie wiem, jak dalej. Powiedz cel innymi słowami.' : 'I am not sure how to continue. Try saying the goal another way.',
  stillWaiting: (lang: VoiceLang) => (lang === 'pl' ? 'Wciąż czekam.' : 'Still waiting.'),
  failed: (reason: string, lang: VoiceLang) => (lang === 'pl' ? `Przewodnik przerwany: ${reason}.` : `The guide stopped: ${reason}.`),
  whereAmI: (title: string, lang: VoiceLang) =>
    title ? (lang === 'pl' ? `Jesteś na ekranie ${title}.` : `You are on ${title}.`) : lang === 'pl' ? 'Ten ekran nie ma tytułu.' : 'This screen has no title.',
  guideProgress: (goal: string, step: number, lang: VoiceLang) =>
    lang === 'pl' ? ` Cel: ${goal}, krok ${step}.` : ` Goal: ${goal}, step ${step}.`,
  describe: (title: string, named: string[], more: number, unnamed: number, lang: VoiceLang) => {
    const total = named.length + more + unnamed;
    const head = title ? (lang === 'pl' ? `Ekran ${title}. ` : `${title}. `) : '';
    if (total === 0) return head + (lang === 'pl' ? 'Nie ma tu nic do dotknięcia.' : 'There is nothing to tap here.');
    const count =
      lang === 'pl'
        ? `${total} ${plural(total, lang, ['', ''], ['element do dotknięcia', 'elementy do dotknięcia', 'elementów do dotknięcia'])}`
        : `${total} ${plural(total, lang, ['thing you can tap', 'things you can tap'], ['', '', ''])}`;
    let out = `${head}${count}`;
    if (named.length && more) out += `: ${named.join(', ')}${lang === 'pl' ? ` i ${more} więcej` : ` and ${more} more`}`;
    else if (named.length) out += `: ${list(named, lang)}`;
    out += '.';
    if (unnamed) {
      out +=
        lang === 'pl'
          ? ` ${unnamed} ${plural(unnamed, lang, ['', ''], ['element nie ma nazwy', 'elementy nie mają nazwy', 'elementów nie ma nazwy'])}.`
          : ` ${unnamed} ${plural(unnamed, lang, ['has no name', 'have no name'], ['', '', ''])}.`;
    }
    return out;
  },
  audit: (score: number, errors: number, warnings: number, lang: VoiceLang) =>
    lang === 'pl'
      ? `Wynik dostępności ${score} na 100. Błędy: ${errors}, ostrzeżenia: ${warnings}.`
      : `Accessibility score ${score} out of 100. ${errors} errors, ${warnings} warnings.`,
  help: (lang: VoiceLang) =>
    lang === 'pl'
      ? 'Powiedz, co chcesz zrobić, na przykład: powiększ tekst. Możesz też powiedzieć: co tu jest, gdzie jestem, powtórz, dalej, wróć albo stop.'
      : 'Tell me what you want to do, for example: make the text bigger. You can also say: what is here, where am I, repeat, next, back or stop.',
};
