export interface TranscriptSegment {
  id: string;
  english: string;
  romanian: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
  source: 'deepgram' | 'webspeech' | 'rehearsal';
  cached: boolean;
  latencyMs: number;
  provider?: string;
}

export interface CustomizationConfig {
  appBgColor: string;
  appSurfaceColor: string;
  appAccentColor: string;
  subtitleTextColor: string;
  subtitleBgColor: string;
  subtitleOpacity: number; // 0.0 to 1.0, default 0 (transparent)
  subtitleFontSize: number; // px, 16 to 64, default 32
  showBilingual: boolean;
  dockPosition: 'bottom' | 'top' | 'floating';
  celeronEcoMode: boolean;
  maxDomSegments: number;
}

export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  appBgColor: '#E0F2F1', // Light Teal canvas
  appSurfaceColor: '#F0FDFA', // Crisp Light Teal card surface
  appAccentColor: '#0D9488', // Deep Teal button accent
  subtitleTextColor: '#FFFFFF', // High-visibility outlined text
  subtitleBgColor: '#062422',
  subtitleOpacity: 0, // Transparent background by default
  subtitleFontSize: 32,
  showBilingual: true,
  dockPosition: 'floating',
  celeronEcoMode: true,
  maxDomSegments: 25,
};

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function hslToHex(h: number, s: number, l: number): string {
  const normH = ((h % 360) + 360) % 360;
  const normS = clamp(s, 0, 100) / 100;
  const normL = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (normH >= 0 && normH < 60) {
    rPrime = c;
    gPrime = x;
  } else if (normH >= 60 && normH < 120) {
    rPrime = x;
    gPrime = c;
  } else if (normH >= 120 && normH < 180) {
    gPrime = c;
    bPrime = x;
  } else if (normH >= 180 && normH < 240) {
    gPrime = x;
    bPrime = c;
  } else if (normH >= 240 && normH < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);

  const toHex = (n: number) => clamp(n, 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16) || 0;
    const g = parseInt(cleaned[1] + cleaned[1], 16) || 0;
    const b = parseInt(cleaned[2] + cleaned[2], 16) || 0;
    return { r, g, b };
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return {
    r: Number.isNaN(r) ? 0 : r,
    g: Number.isNaN(g) ? 0 : g,
    b: Number.isNaN(b) ? 0 : b,
  };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r: r255, g: g255, b: b255 } = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      case b:
        h = (r - g) / delta + 4;
        break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hexToRgba(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clampedAlpha = Math.round(clamp(opacity, 0, 1) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

export function wheelCoordsToHs(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radius: number
): { h: number; s: number } {
  const dx = x - centerX;
  const dy = y - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angleRad = Math.atan2(dy, dx);
  let angleDeg = (angleRad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  const s = clamp((dist / Math.max(1, radius)) * 100, 0, 100);
  return {
    h: Math.round(angleDeg) % 360,
    s: Math.round(s),
  };
}

export function hsToWheelCoords(
  h: number,
  s: number,
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number } {
  const angleRad = (h * Math.PI) / 180;
  const dist = (clamp(s, 0, 100) / 100) * radius;
  return {
    x: Math.round(centerX + Math.cos(angleRad) * dist),
    y: Math.round(centerY + Math.sin(angleRad) * dist),
  };
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (v: number) => {
    const sRGB = v / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const R = transform(r);
  const G = transform(g);
  const B = transform(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function getContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = getRelativeLuminance(fgHex);
  const l2 = getRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 10) / 10;
}

/**
 * Build Google Neural Machine Translation (dict-chrome-ex NMT) URL for fast, high-accuracy English -> Romanian
 */
export function buildGoogleGtxUrl(englishText: string): string {
  const normalized = normalizeSpeechChunk(englishText);
  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: 'en',
    tl: 'ro',
    q: normalized,
  });
  return `https://translate.googleapis.com/translate_a/t?${params.toString()}`;
}

/**
 * Parse the response from Google Neural Translation API (supports string[], nested array, or sentences object)
 */
export function parseGoogleGtxResponse(payload: unknown): string | null {
  if (!payload) return null;

  // Format 1: ["Bună, prietene..."] (dict-chrome-ex array of strings)
  if (Array.isArray(payload)) {
    if (typeof payload[0] === 'string') {
      const joined = payload
        .filter((item): item is string => typeof item === 'string')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return joined.length > 0 ? joined : null;
    }

    // Format 2: [ [ ["Translated clause 1", "Original 1", ...], ... ], null, "en" ]
    if (Array.isArray(payload[0])) {
      const sentences = payload[0];
      const parts: string[] = [];
      for (const item of sentences) {
        if (Array.isArray(item) && typeof item[0] === 'string' && item[0].trim()) {
          parts.push(item[0]);
        } else if (typeof item === 'string' && item.trim()) {
          parts.push(item);
        }
      }
      const joined = parts.join('').replace(/\s+/g, ' ').trim();
      return joined.length > 0 ? joined : null;
    }
  }

  // Format 3: { sentences: [{ trans: "..." }] }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'sentences' in payload &&
    Array.isArray((payload as { sentences: unknown[] }).sentences)
  ) {
    const sents = (payload as { sentences: Array<{ trans?: string }> }).sentences;
    const joined = sents
      .map((s) => s?.trans || '')
      .join('')
      .trim();
    return joined.length > 0 ? joined : null;
  }

  return null;
}

/**
 * Clean LLM/Neural translation output (strips accidental surrounding quotes or prefixes)
 */
export function cleanNeuralTranslationOutput(raw: string): string {
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith('„') && cleaned.endsWith('”'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function buildMyMemoryUrl(englishText: string, email?: string): string {
  const normalized = normalizeSpeechChunk(englishText);
  const params = new URLSearchParams({
    q: normalized,
    langpair: 'en|ro',
  });
  if (email && email.trim().length > 0) {
    params.set('de', email.trim());
  }
  return `https://api.mymemory.translated.net/get?${params.toString()}`;
}

export function normalizeSpeechChunk(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export class TranslationLruCache {
  private maxEntries: number;
  private map: Map<string, string>;

  constructor(maxEntries = 250) {
    this.maxEntries = Math.max(10, maxEntries);
    this.map = new Map<string, string>();
  }

  private key(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  get(englishText: string): string | undefined {
    const k = this.key(englishText);
    const val = this.map.get(k);
    if (val !== undefined) {
      this.map.delete(k);
      this.map.set(k, val);
    }
    return val;
  }

  set(englishText: string, romanianText: string): void {
    const k = this.key(englishText);
    if (!k) return;
    if (this.map.has(k)) {
      this.map.delete(k);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(k, romanianText);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Exact full-sentence phrasebook for common presentation & conversational sentences
 */
const PRESENTATION_PHRASEBOOK: Record<string, string> = {
  "welcome everyone to today's presentation on system architecture and performance.":
    'Bun venit tuturor la prezentarea de astăzi despre arhitectura sistemului și performanță.',
  'our main goal is to deliver reliable real-time subtitles on lightweight linux hardware.':
    'Obiectivul nostru principal este să oferim subtitrări fiabile în timp real pe hardware Linux ușor.',
  'by combining deepgram speech recognition with mymemory translation, latency stays under one second.':
    'Combinând recunoașterea vocală Deepgram cu traducerea automată, latența rămâne sub o secundă.',
  'by combining deepgram speech recognition with neural translation, latency stays under one second.':
    'Combinând recunoașterea vocală Deepgram cu traducerea neuronală, latența rămâne sub o secundă.',
  'you can customize the subtitle colors, text size, and background opacity at any time.':
    'Puteți personaliza oricând culorile subtitrărilor, dimensiunea textului și opacitatea fundalului.',
  'the floating caption bar stays on top of your slides and browser windows throughout the event.':
    'Bara plutitoare de subtitrări rămâne deasupra diapozitivelor și ferestrelor browserului pe tot parcursul evenimentului.',
  'thank you for your attention, and let us open the floor for questions and discussion.':
    'Vă mulțumesc pentru atenție și haideți să deschidem sesiunea pentru întrebări și discuții.',
  'good morning everyone and welcome to our conference.':
    'Bună dimineața tuturor și bun venit la conferința noastră.',
  'can everyone in the back row read the subtitles clearly?':
    'Poate toată lumea din rândul din spate să citească clar subtitrările?',
  'let us look at the benchmark results on the next slide.':
    'Să privim rezultatele testelor de performanță pe următorul diapozitiv.',
  'we are deploying a distributed neural network that processes real-time telemetry with minimal memory overhead.':
    'Implementăm o rețea neuronală distribuită care procesează telemetria în timp real cu un consum minim de memorie.',
};

/**
 * Multi-word idiomatic & grammatical patterns replaced before token translation
 */
const PHRASE_PATTERNS: Array<[RegExp, string]> = [
  [/\bgood morning\b/gi, 'bună dimineața'],
  [/\bgood afternoon\b/gi, 'bună ziua'],
  [/\bgood evening\b/gi, 'bună seara'],
  [/\bgood night\b/gi, 'noapte bună'],
  [/\bthank you very much\b/gi, 'vă mulțumesc foarte mult'],
  [/\bthank you so much\b/gi, 'vă mulțumesc mult'],
  [/\bthank you\b/gi, 'vă mulțumesc'],
  [/\bthanks a lot\b/gi, 'mulțumesc mult'],
  [/\bhow are you doing\b/gi, 'ce mai faceți'],
  [/\bhow are you\b/gi, 'ce mai faci'],
  [/\bnice to meet you\b/gi, 'îmi pare bine de cunoștință'],
  [/\bwelcome to\b/gi, 'bun venit la'],
  [/\bwe are deploying\b/gi, 'implementăm'],
  [/\bwe are building\b/gi, 'construim'],
  [/\bwe are testing\b/gi, 'testăm'],
  [/\bwe are using\b/gi, 'folosim'],
  [/\bwe are going to\b/gi, 'vom'],
  [/\bi am going to\b/gi, 'voi'],
  [/\bi would like to\b/gi, 'aș dori să'],
  [/\bi want to\b/gi, 'vreau să'],
  [/\swe want to\b/gi, ' vrem să'],
  [/\byou can see\b/gi, 'puteți vedea'],
  [/\bas you can see\b/gi, 'după cum puteți vedea'],
  [/\bcan you hear me\b/gi, 'mă puteți auzi'],
  [/\blet us look at\b/gi, 'să privim'],
  [/\blet's look at\b/gi, 'să privim'],
  [/\blet us begin\b/gi, 'să începem'],
  [/\blet's begin\b/gi, 'să începem'],
  [/\blet us start\b/gi, 'să începem'],
  [/\blet's start\b/gi, 'să începem'],
  [/\bin real time\b/gi, 'în timp real'],
  [/\breal-time\b/gi, 'în timp real'],
  [/\bon the next slide\b/gi, 'pe următorul diapozitiv'],
  [/\bon this slide\b/gi, 'pe acest diapozitiv'],
  [/\bneural network\b/gi, 'rețea neuronală'],
  [/\bmachine learning\b/gi, 'învățare automată'],
  [/\bartificial intelligence\b/gi, 'inteligență artificială'],
  [/\bspeech recognition\b/gi, 'recunoaștere vocală'],
  [/\bspeech to text\b/gi, 'vorbire în text'],
  [/\bmemory overhead\b/gi, 'consum de memorie'],
  [/\bopen source\b/gi, 'sursă deschisă'],
  [/\boperating system\b/gi, 'sistem de operare'],
  [/\bat any time\b/gi, 'oricând'],
  [/\bright now\b/gi, 'chiar acum'],
  [/\ba lot of\b/gi, 'o mulțime de'],
  [/\bthere is\b/gi, 'există'],
  [/\bthere are\b/gi, 'există'],
  [/\bdo not\b/gi, 'nu'],
  [/\bdon't\b/gi, 'nu'],
  [/\bdoes not\b/gi, 'nu'],
  [/\bdoesn't\b/gi, 'nu'],
  [/\bcannot\b/gi, 'nu poate'],
  [/\bcan't\b/gi, 'nu poate'],
  [/\bwill not\b/gi, 'nu va'],
  [/\bwon't\b/gi, 'nu va'],
  [/\bit is\b/gi, 'este'],
  [/\bit's\b/gi, 'este'],
  [/\bthat is\b/gi, 'care este'],
  [/\bthis is\b/gi, 'acesta este'],
];

const EXTENDED_DICTIONARY: Record<string, string> = {
  // Pronouns & determiners
  i: 'eu',
  me: 'mine',
  my: 'meu',
  mine: 'al meu',
  you: 'dumneavoastră',
  your: 'dumneavoastră',
  he: 'el',
  him: 'îl',
  his: 'lui',
  she: 'ea',
  her: 'ei',
  it: 'acesta',
  its: 'său',
  we: 'noi',
  us: 'nouă',
  our: 'nostru',
  they: 'ei',
  them: 'lor',
  their: 'lor',
  this: 'acest',
  that: 'care',
  these: 'aceste',
  those: 'acele',
  who: 'cine',
  what: 'ce',
  which: 'care',
  where: 'unde',
  when: 'când',
  why: 'de ce',
  how: 'cum',
  all: 'toate',
  some: 'unele',
  no: 'nu',
  not: 'nu',
  yes: 'da',
  every: 'fiecare',
  everyone: 'tuturor',
  everything: 'totul',
  something: 'ceva',
  nothing: 'nimic',
  many: 'multe',
  much: 'mult',
  more: 'mai mult',
  most: 'cel mai mult',
  other: 'alte',
  another: 'altul',
  such: 'astfel de',
  only: 'doar',
  also: 'de asemenea',
  very: 'foarte',
  too: 'prea',
  so: 'deci',
  just: 'doar',

  // Prepositions & conjunctions
  and: 'și',
  or: 'sau',
  but: 'dar',
  because: 'deoarece',
  if: 'dacă',
  while: 'în timp ce',
  until: 'până când',
  since: 'de când',
  although: 'deși',
  in: 'în',
  on: 'pe',
  at: 'la',
  to: 'la',
  for: 'pentru',
  with: 'cu',
  without: 'fără',
  from: 'de la',
  by: 'prin',
  about: 'despre',
  as: 'ca',
  into: 'în',
  like: 'precum',
  through: 'prin',
  after: 'după',
  over: 'peste',
  between: 'între',
  out: 'afară',
  against: 'împotriva',
  during: 'în timpul',
  before: 'înainte de',
  under: 'sub',
  around: 'în jurul',
  among: 'printre',
  of: 'de',
  the: '',
  a: 'o',
  an: 'un',

  // Common Verbs
  is: 'este',
  are: 'sunt',
  am: 'sunt',
  was: 'a fost',
  were: 'au fost',
  be: 'fi',
  been: 'fost',
  being: 'fiind',
  have: 'avem',
  has: 'are',
  had: 'a avut',
  do: 'facem',
  does: 'face',
  did: 'a făcut',
  will: 'va',
  would: 'ar',
  can: 'poate',
  could: 'ar putea',
  should: 'ar trebui',
  must: 'trebuie',
  may: 'poate',
  might: 'ar putea',
  need: 'trebuie',
  want: 'vreau',
  wants: 'vrea',
  use: 'folosim',
  uses: 'folosește',
  used: 'folosit',
  using: 'folosind',
  make: 'facem',
  makes: 'face',
  made: 'făcut',
  making: 'făcând',
  go: 'mergem',
  goes: 'merge',
  going: 'mergând',
  went: 'a mers',
  know: 'știm',
  knows: 'știe',
  take: 'luăm',
  takes: 'ia',
  see: 'vedem',
  sees: 'vede',
  come: 'venim',
  comes: 'vine',
  think: 'credem',
  look: 'privim',
  give: 'oferim',
  gives: 'oferă',
  work: 'funcționează',
  works: 'funcționează',
  working: 'funcționând',
  call: 'apelăm',
  try: 'încercăm',
  ask: 'întrebăm',
  feel: 'simțim',
  become: 'devine',
  leave: 'lăsăm',
  put: 'punem',
  mean: 'înseamnă',
  keep: 'păstrăm',
  keeps: 'păstrează',
  let: 'să',
  begin: 'începem',
  begins: 'începe',
  start: 'începem',
  starts: 'începe',
  stop: 'oprim',
  help: 'ajută',
  helps: 'ajută',
  talk: 'vorbim',
  talking: 'vorbind',
  speak: 'vorbim',
  speaking: 'vorbind',
  turn: 'întoarcem',
  show: 'arătăm',
  shows: 'arată',
  hear: 'auzim',
  play: 'rulăm',
  run: 'rulează',
  runs: 'rulează',
  running: 'rulând',
  move: 'mutăm',
  live: 'în direct',
  believe: 'credem',
  bring: 'aducem',
  happen: 'se întâmplă',
  write: 'scriem',
  provide: 'oferim',
  provides: 'oferă',
  deliver: 'oferim',
  delivers: 'livrează',
  read: 'citească',
  reading: 'citind',
  open: 'deschidem',
  opens: 'deschide',
  close: 'închidem',
  change: 'schimbăm',
  changes: 'schimbă',
  build: 'construim',
  built: 'construit',
  building: 'construind',
  create: 'creăm',
  created: 'creat',
  process: 'procesează',
  processes: 'procesează',
  processing: 'procesând',
  deploy: 'implementăm',
  deploying: 'implementând',
  distributed: 'distribuită',
  translate: 'traducem',
  translates: 'traduce',
  translated: 'tradus',
  translating: 'traducând',
  test: 'testăm',
  testing: 'testând',

  // Presentation, Tech & Everyday Nouns/Adjectives
  welcome: 'bun venit',
  hello: 'salut',
  hi: 'salut',
  good: 'bună',
  great: 'excelent',
  new: 'nou',
  first: 'primul',
  last: 'ultimul',
  long: 'lung',
  little: 'mic',
  own: 'propriu',
  old: 'vechi',
  right: 'corect',
  big: 'mare',
  high: 'înalt',
  different: 'diferit',
  small: 'mic',
  large: 'mare',
  next: 'următorul',
  early: 'devreme',
  important: 'important',
  few: 'câteva',
  public: 'public',
  bad: 'rău',
  same: 'același',
  able: 'capabil',
  fast: 'rapid',
  slow: 'lent',
  lightweight: 'ușor',
  reliable: 'fiabil',
  simple: 'simplu',
  easy: 'ușor',
  easily: 'ușor',
  readable: 'lizibil',
  clearly: 'clar',
  clear: 'clar',
  transparent: 'transparent',
  minimal: 'minim',
  low: 'scăzut',
  real: 'real',
  time: 'timp',
  year: 'an',
  years: 'ani',
  day: 'zi',
  days: 'zile',
  today: 'astăzi',
  now: 'acum',
  way: 'mod',
  thing: 'lucru',
  things: 'lucruri',
  world: 'lume',
  life: 'viață',
  hand: 'mână',
  part: 'parte',
  place: 'loc',
  case: 'caz',
  week: 'săptămână',
  company: 'companie',
  system: 'sistem',
  systems: 'sisteme',
  program: 'program',
  question: 'întrebare',
  questions: 'întrebări',
  number: 'număr',
  point: 'punct',
  home: 'acasă',
  water: 'apă',
  room: 'sală',
  area: 'zonă',
  money: 'bani',
  story: 'poveste',
  fact: 'fapt',
  month: 'lună',
  lot: 'mult',
  study: 'studiu',
  book: 'carte',
  eye: 'ochi',
  job: 'muncă',
  word: 'cuvânt',
  words: 'cuvinte',
  business: 'afaceri',
  issue: 'problemă',
  side: 'parte',
  kind: 'fel',
  head: 'cap',
  house: 'casă',
  service: 'serviciu',
  friend: 'prieten',
  friends: 'prieteni',
  hour: 'oră',
  game: 'joc',
  line: 'linie',
  end: 'sfârșit',
  member: 'membru',
  law: 'lege',
  car: 'mașină',
  city: 'oraș',
  community: 'comunitate',
  name: 'nume',
  team: 'echipă',
  minute: 'minut',
  minutes: 'minute',
  second: 'secundă',
  seconds: 'secunde',
  idea: 'idee',
  information: 'informații',
  back: 'spate',
  row: 'rând',
  face: 'față',
  others: 'alții',
  level: 'nivel',
  office: 'birou',
  door: 'ușă',
  health: 'sănătate',
  person: 'persoană',
  people: 'oameni',
  art: 'artă',
  history: 'istorie',
  party: 'grup',
  result: 'rezultat',
  results: 'rezultate',
  morning: 'dimineața',
  reason: 'motiv',
  research: 'cercetare',
  moment: 'moment',
  air: 'aer',
  teacher: 'profesor',
  force: 'forță',
  education: 'educație',
  presentation: 'prezentare',
  conference: 'conferință',
  event: 'eveniment',
  slide: 'diapozitiv',
  slides: 'diapozitive',
  subtitle: 'subtitrare',
  subtitles: 'subtitrări',
  caption: 'subtitrare',
  captions: 'subtitrări',
  translation: 'traducere',
  speech: 'vorbire',
  voice: 'voce',
  audio: 'audio',
  microphone: 'microfon',
  text: 'text',
  color: 'culoare',
  colors: 'culori',
  size: 'dimensiune',
  opacity: 'opacitate',
  background: 'fundal',
  window: 'fereastră',
  windows: 'ferestre',
  browser: 'browser',
  screen: 'ecran',
  computer: 'calculator',
  laptop: 'laptop',
  hardware: 'hardware',
  software: 'software',
  application: 'aplicație',
  app: 'aplicație',
  server: 'server',
  network: 'rețea',
  data: 'date',
  database: 'bază de date',
  memory: 'memorie',
  telemetry: 'telemetria',
  performance: 'performanță',
  architecture: 'arhitectură',
  benchmark: 'performanță',
  latency: 'latență',
  goal: 'obiectiv',
  main: 'principal',
  attention: 'atenție',
  discussion: 'discuții',
  floor: 'sesiunea',
  please: 'vă rog',
};

export function fallbackEnglishToRomanian(englishText: string): string {
  const norm = englishText.trim();
  if (!norm) return '';
  const lower = norm.toLowerCase();
  if (PRESENTATION_PHRASEBOOK[lower]) {
    return PRESENTATION_PHRASEBOOK[lower];
  }

  let working = norm;
  for (const [regex, replacement] of PHRASE_PATTERNS) {
    working = working.replace(regex, replacement);
  }

  const tokens = working.split(/(\s+|[.,!?;:()[\]"'])/);
  const translated = tokens
    .map((tok) => {
      const clean = tok.toLowerCase();
      if (!clean || /^(\s+|[.,!?;:()[\]"'])$/.test(clean)) {
        return tok;
      }
      if (Object.prototype.hasOwnProperty.call(EXTENDED_ICTIONARY_LOOKUP, clean)) {
        return EXTENDED_ICTIONARY_LOOKUP[clean];
      }
      // Try stripping plural 's' if in dictionary
      if (clean.endsWith('s') && clean.length > 3) {
        const singular = clean.slice(0, -1);
        if (Object.prototype.hasOwnProperty.call(EXTENDED_ICTIONARY_LOOKUP, singular)) {
          return EXTENDED_ICTIONARY_LOOKUP[singular];
        }
      }
      return tok;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();

  if (!translated) return norm;
  return translated.charAt(0).toUpperCase() + translated.slice(1);
}

const EXTENDED_ICTIONARY_LOOKUP = EXTENDED_DICTIONARY;

export function appendTranscriptSegment(
  allSegments: TranscriptSegment[],
  newSegment: TranscriptSegment,
  maxActiveDomNodes: number
): {
  allSegments: TranscriptSegment[];
  visibleSegments: TranscriptSegment[];
  archivedCount: number;
} {
  const updated = [...allSegments, newSegment];
  const cap = Math.max(5, maxActiveDomNodes);
  const visibleSegments = updated.length > cap ? updated.slice(updated.length - cap) : updated;
  const archivedCount = Math.max(0, updated.length - visibleSegments.length);
  return {
    allSegments: updated,
    visibleSegments,
    archivedCount,
  };
}

export function formatSrtTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
}

export function generateSrtSubtitles(segments: TranscriptSegment[], includeEnglish = true): string {
  return segments
    .map((seg, index) => {
      const start = formatSrtTimestamp(seg.startTimeMs);
      const end = formatSrtTimestamp(Math.max(seg.startTimeMs + 1500, seg.endTimeMs));
      const lines = includeEnglish ? `${seg.romanian}\n[${seg.english}]` : seg.romanian;
      return `${index + 1}\n${start} --> ${end}\n${lines}\n`;
    })
    .join('\n');
}

export function generateLinuxMintLauncherScript(appUrl: string): string {
  const cleanUrl = appUrl.replace(/\/$/, '');
  const overlayUrl = `${cleanUrl}/?overlay=1`;
  return `#!/usr/bin/env bash
# JOI Subtitles 3.0 — Lightweight Always-on-Top Launcher for Linux Mint
OVERLAY_URL="${overlayUrl}"
TITLE_MATCH="JOI Subtitles 3.0"
xdg-open "$OVERLAY_URL" &
sleep 2
if command -v wmctrl >/dev/null 2>&1; then
  wmctrl -r "$TITLE_MATCH" -b add,above,sticky
fi
`;
}

export function computeRmsLevel(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

/**
 * Resamples Float32 mono audio from any hardware sample rate (e.g. 48000Hz or 44100Hz on Linux Mint)
 * to 16000Hz and encodes into a complete, standards-compliant 16-bit RIFF WAV byte array.
 * Also applies gentle auto-gain normalization for quiet laptop microphones.
 */
export function encodePcmToWav(
  samples: Float32Array,
  inputSampleRate = 16000,
  targetSampleRate = 16000
): Uint8Array {
  let processed = samples;
  const safeInRate = inputSampleRate > 0 ? inputSampleRate : 16000;
  const safeOutRate = targetSampleRate > 0 ? targetSampleRate : 16000;

  if (safeInRate !== safeOutRate && samples.length > 0) {
    const ratio = safeInRate / safeOutRate;
    const newLength = Math.max(1, Math.round(samples.length / ratio));
    const resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const idx0 = Math.floor(srcIndex);
      const idx1 = Math.min(samples.length - 1, idx0 + 1);
      const frac = srcIndex - idx0;
      resampled[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac;
    }
    processed = resampled;
  }

  // Find peak amplitude to boost quiet Linux laptop microphones without clipping
  let peak = 0;
  for (let i = 0; i < processed.length; i++) {
    const abs = Math.abs(processed[i]);
    if (abs > peak) peak = abs;
  }
  const gain = peak > 0.002 && peak < 0.45 ? Math.min(6.0, 0.75 / peak) : 1.0;

  const numSamples = processed.length;
  const byteLength = 44 + numSamples * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, safeOutRate, true);
  view.setUint32(28, safeOutRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, processed[i] * gain));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}


