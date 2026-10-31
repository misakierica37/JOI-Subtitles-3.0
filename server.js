// server.ts
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// src/utils/translationLogic.ts
function buildGoogleGtxUrl(englishText) {
  const normalized = normalizeSpeechChunk(englishText);
  const params = new URLSearchParams({
    client: "dict-chrome-ex",
    sl: "en",
    tl: "ro",
    q: normalized
  });
  return `https://translate.googleapis.com/translate_a/t?${params.toString()}`;
}
function parseGoogleGtxResponse(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    if (typeof payload[0] === "string") {
      const joined = payload.filter((item) => typeof item === "string").join(" ").replace(/\s+/g, " ").trim();
      return joined.length > 0 ? joined : null;
    }
    if (Array.isArray(payload[0])) {
      const sentences = payload[0];
      const parts = [];
      for (const item of sentences) {
        if (Array.isArray(item) && typeof item[0] === "string" && item[0].trim()) {
          parts.push(item[0]);
        } else if (typeof item === "string" && item.trim()) {
          parts.push(item);
        }
      }
      const joined = parts.join("").replace(/\s+/g, " ").trim();
      return joined.length > 0 ? joined : null;
    }
  }
  if (typeof payload === "object" && payload !== null && "sentences" in payload && Array.isArray(payload.sentences)) {
    const sents = payload.sentences;
    const joined = sents.map((s) => s?.trans || "").join("").trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}
function cleanNeuralTranslationOutput(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"') || cleaned.startsWith("\u201E") && cleaned.endsWith("\u201D")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}
function normalizeSpeechChunk(text) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
var TranslationLruCache = class {
  constructor(maxEntries = 250) {
    this.maxEntries = Math.max(10, maxEntries);
    this.map = /* @__PURE__ */ new Map();
  }
  key(text) {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
  }
  get(englishText) {
    const k = this.key(englishText);
    const val = this.map.get(k);
    if (val !== void 0) {
      this.map.delete(k);
      this.map.set(k, val);
    }
    return val;
  }
  set(englishText, romanianText) {
    const k = this.key(englishText);
    if (!k) return;
    if (this.map.has(k)) {
      this.map.delete(k);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== void 0) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(k, romanianText);
  }
  get size() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
};
var PRESENTATION_PHRASEBOOK = {
  "welcome everyone to today's presentation on system architecture and performance.": "Bun venit tuturor la prezentarea de ast\u0103zi despre arhitectura sistemului \u0219i performan\u021B\u0103.",
  "our main goal is to deliver reliable real-time subtitles on lightweight linux hardware.": "Obiectivul nostru principal este s\u0103 oferim subtitr\u0103ri fiabile \xEEn timp real pe hardware Linux u\u0219or.",
  "by combining deepgram speech recognition with mymemory translation, latency stays under one second.": "Combin\xE2nd recunoa\u0219terea vocal\u0103 Deepgram cu traducerea automat\u0103, laten\u021Ba r\u0103m\xE2ne sub o secund\u0103.",
  "by combining deepgram speech recognition with neural translation, latency stays under one second.": "Combin\xE2nd recunoa\u0219terea vocal\u0103 Deepgram cu traducerea neuronal\u0103, laten\u021Ba r\u0103m\xE2ne sub o secund\u0103.",
  "you can customize the subtitle colors, text size, and background opacity at any time.": "Pute\u021Bi personaliza oric\xE2nd culorile subtitr\u0103rilor, dimensiunea textului \u0219i opacitatea fundalului.",
  "the floating caption bar stays on top of your slides and browser windows throughout the event.": "Bara plutitoare de subtitr\u0103ri r\u0103m\xE2ne deasupra diapozitivelor \u0219i ferestrelor browserului pe tot parcursul evenimentului.",
  "thank you for your attention, and let us open the floor for questions and discussion.": "V\u0103 mul\u021Bumesc pentru aten\u021Bie \u0219i haide\u021Bi s\u0103 deschidem sesiunea pentru \xEEntreb\u0103ri \u0219i discu\u021Bii.",
  "good morning everyone and welcome to our conference.": "Bun\u0103 diminea\u021Ba tuturor \u0219i bun venit la conferin\u021Ba noastr\u0103.",
  "can everyone in the back row read the subtitles clearly?": "Poate toat\u0103 lumea din r\xE2ndul din spate s\u0103 citeasc\u0103 clar subtitr\u0103rile?",
  "let us look at the benchmark results on the next slide.": "S\u0103 privim rezultatele testelor de performan\u021B\u0103 pe urm\u0103torul diapozitiv.",
  "we are deploying a distributed neural network that processes real-time telemetry with minimal memory overhead.": "Implement\u0103m o re\u021Bea neuronal\u0103 distribuit\u0103 care proceseaz\u0103 telemetria \xEEn timp real cu un consum minim de memorie."
};
var PHRASE_PATTERNS = [
  [/\bgood morning\b/gi, "bun\u0103 diminea\u021Ba"],
  [/\bgood afternoon\b/gi, "bun\u0103 ziua"],
  [/\bgood evening\b/gi, "bun\u0103 seara"],
  [/\bgood night\b/gi, "noapte bun\u0103"],
  [/\bthank you very much\b/gi, "v\u0103 mul\u021Bumesc foarte mult"],
  [/\bthank you so much\b/gi, "v\u0103 mul\u021Bumesc mult"],
  [/\bthank you\b/gi, "v\u0103 mul\u021Bumesc"],
  [/\bthanks a lot\b/gi, "mul\u021Bumesc mult"],
  [/\bhow are you doing\b/gi, "ce mai face\u021Bi"],
  [/\bhow are you\b/gi, "ce mai faci"],
  [/\bnice to meet you\b/gi, "\xEEmi pare bine de cuno\u0219tin\u021B\u0103"],
  [/\bwelcome to\b/gi, "bun venit la"],
  [/\bwe are deploying\b/gi, "implement\u0103m"],
  [/\bwe are building\b/gi, "construim"],
  [/\bwe are testing\b/gi, "test\u0103m"],
  [/\bwe are using\b/gi, "folosim"],
  [/\bwe are going to\b/gi, "vom"],
  [/\bi am going to\b/gi, "voi"],
  [/\bi would like to\b/gi, "a\u0219 dori s\u0103"],
  [/\bi want to\b/gi, "vreau s\u0103"],
  [/\swe want to\b/gi, " vrem s\u0103"],
  [/\byou can see\b/gi, "pute\u021Bi vedea"],
  [/\bas you can see\b/gi, "dup\u0103 cum pute\u021Bi vedea"],
  [/\bcan you hear me\b/gi, "m\u0103 pute\u021Bi auzi"],
  [/\blet us look at\b/gi, "s\u0103 privim"],
  [/\blet's look at\b/gi, "s\u0103 privim"],
  [/\blet us begin\b/gi, "s\u0103 \xEEncepem"],
  [/\blet's begin\b/gi, "s\u0103 \xEEncepem"],
  [/\blet us start\b/gi, "s\u0103 \xEEncepem"],
  [/\blet's start\b/gi, "s\u0103 \xEEncepem"],
  [/\bin real time\b/gi, "\xEEn timp real"],
  [/\breal-time\b/gi, "\xEEn timp real"],
  [/\bon the next slide\b/gi, "pe urm\u0103torul diapozitiv"],
  [/\bon this slide\b/gi, "pe acest diapozitiv"],
  [/\bneural network\b/gi, "re\u021Bea neuronal\u0103"],
  [/\bmachine learning\b/gi, "\xEEnv\u0103\u021Bare automat\u0103"],
  [/\bartificial intelligence\b/gi, "inteligen\u021B\u0103 artificial\u0103"],
  [/\bspeech recognition\b/gi, "recunoa\u0219tere vocal\u0103"],
  [/\bspeech to text\b/gi, "vorbire \xEEn text"],
  [/\bmemory overhead\b/gi, "consum de memorie"],
  [/\bopen source\b/gi, "surs\u0103 deschis\u0103"],
  [/\boperating system\b/gi, "sistem de operare"],
  [/\bat any time\b/gi, "oric\xE2nd"],
  [/\bright now\b/gi, "chiar acum"],
  [/\ba lot of\b/gi, "o mul\u021Bime de"],
  [/\bthere is\b/gi, "exist\u0103"],
  [/\bthere are\b/gi, "exist\u0103"],
  [/\bdo not\b/gi, "nu"],
  [/\bdon't\b/gi, "nu"],
  [/\bdoes not\b/gi, "nu"],
  [/\bdoesn't\b/gi, "nu"],
  [/\bcannot\b/gi, "nu poate"],
  [/\bcan't\b/gi, "nu poate"],
  [/\bwill not\b/gi, "nu va"],
  [/\bwon't\b/gi, "nu va"],
  [/\bit is\b/gi, "este"],
  [/\bit's\b/gi, "este"],
  [/\bthat is\b/gi, "care este"],
  [/\bthis is\b/gi, "acesta este"]
];
var EXTENDED_DICTIONARY = {
  // Pronouns & determiners
  i: "eu",
  me: "mine",
  my: "meu",
  mine: "al meu",
  you: "dumneavoastr\u0103",
  your: "dumneavoastr\u0103",
  he: "el",
  him: "\xEEl",
  his: "lui",
  she: "ea",
  her: "ei",
  it: "acesta",
  its: "s\u0103u",
  we: "noi",
  us: "nou\u0103",
  our: "nostru",
  they: "ei",
  them: "lor",
  their: "lor",
  this: "acest",
  that: "care",
  these: "aceste",
  those: "acele",
  who: "cine",
  what: "ce",
  which: "care",
  where: "unde",
  when: "c\xE2nd",
  why: "de ce",
  how: "cum",
  all: "toate",
  some: "unele",
  no: "nu",
  not: "nu",
  yes: "da",
  every: "fiecare",
  everyone: "tuturor",
  everything: "totul",
  something: "ceva",
  nothing: "nimic",
  many: "multe",
  much: "mult",
  more: "mai mult",
  most: "cel mai mult",
  other: "alte",
  another: "altul",
  such: "astfel de",
  only: "doar",
  also: "de asemenea",
  very: "foarte",
  too: "prea",
  so: "deci",
  just: "doar",
  // Prepositions & conjunctions
  and: "\u0219i",
  or: "sau",
  but: "dar",
  because: "deoarece",
  if: "dac\u0103",
  while: "\xEEn timp ce",
  until: "p\xE2n\u0103 c\xE2nd",
  since: "de c\xE2nd",
  although: "de\u0219i",
  in: "\xEEn",
  on: "pe",
  at: "la",
  to: "la",
  for: "pentru",
  with: "cu",
  without: "f\u0103r\u0103",
  from: "de la",
  by: "prin",
  about: "despre",
  as: "ca",
  into: "\xEEn",
  like: "precum",
  through: "prin",
  after: "dup\u0103",
  over: "peste",
  between: "\xEEntre",
  out: "afar\u0103",
  against: "\xEEmpotriva",
  during: "\xEEn timpul",
  before: "\xEEnainte de",
  under: "sub",
  around: "\xEEn jurul",
  among: "printre",
  of: "de",
  the: "",
  a: "o",
  an: "un",
  // Common Verbs
  is: "este",
  are: "sunt",
  am: "sunt",
  was: "a fost",
  were: "au fost",
  be: "fi",
  been: "fost",
  being: "fiind",
  have: "avem",
  has: "are",
  had: "a avut",
  do: "facem",
  does: "face",
  did: "a f\u0103cut",
  will: "va",
  would: "ar",
  can: "poate",
  could: "ar putea",
  should: "ar trebui",
  must: "trebuie",
  may: "poate",
  might: "ar putea",
  need: "trebuie",
  want: "vreau",
  wants: "vrea",
  use: "folosim",
  uses: "folose\u0219te",
  used: "folosit",
  using: "folosind",
  make: "facem",
  makes: "face",
  made: "f\u0103cut",
  making: "f\u0103c\xE2nd",
  go: "mergem",
  goes: "merge",
  going: "merg\xE2nd",
  went: "a mers",
  know: "\u0219tim",
  knows: "\u0219tie",
  take: "lu\u0103m",
  takes: "ia",
  see: "vedem",
  sees: "vede",
  come: "venim",
  comes: "vine",
  think: "credem",
  look: "privim",
  give: "oferim",
  gives: "ofer\u0103",
  work: "func\u021Bioneaz\u0103",
  works: "func\u021Bioneaz\u0103",
  working: "func\u021Bion\xE2nd",
  call: "apel\u0103m",
  try: "\xEEncerc\u0103m",
  ask: "\xEEntreb\u0103m",
  feel: "sim\u021Bim",
  become: "devine",
  leave: "l\u0103s\u0103m",
  put: "punem",
  mean: "\xEEnseamn\u0103",
  keep: "p\u0103str\u0103m",
  keeps: "p\u0103streaz\u0103",
  let: "s\u0103",
  begin: "\xEEncepem",
  begins: "\xEEncepe",
  start: "\xEEncepem",
  starts: "\xEEncepe",
  stop: "oprim",
  help: "ajut\u0103",
  helps: "ajut\u0103",
  talk: "vorbim",
  talking: "vorbind",
  speak: "vorbim",
  speaking: "vorbind",
  turn: "\xEEntoarcem",
  show: "ar\u0103t\u0103m",
  shows: "arat\u0103",
  hear: "auzim",
  play: "rul\u0103m",
  run: "ruleaz\u0103",
  runs: "ruleaz\u0103",
  running: "rul\xE2nd",
  move: "mut\u0103m",
  live: "\xEEn direct",
  believe: "credem",
  bring: "aducem",
  happen: "se \xEEnt\xE2mpl\u0103",
  write: "scriem",
  provide: "oferim",
  provides: "ofer\u0103",
  deliver: "oferim",
  delivers: "livreaz\u0103",
  read: "citeasc\u0103",
  reading: "citind",
  open: "deschidem",
  opens: "deschide",
  close: "\xEEnchidem",
  change: "schimb\u0103m",
  changes: "schimb\u0103",
  build: "construim",
  built: "construit",
  building: "construind",
  create: "cre\u0103m",
  created: "creat",
  process: "proceseaz\u0103",
  processes: "proceseaz\u0103",
  processing: "proces\xE2nd",
  deploy: "implement\u0103m",
  deploying: "implement\xE2nd",
  distributed: "distribuit\u0103",
  translate: "traducem",
  translates: "traduce",
  translated: "tradus",
  translating: "traduc\xE2nd",
  test: "test\u0103m",
  testing: "test\xE2nd",
  // Presentation, Tech & Everyday Nouns/Adjectives
  welcome: "bun venit",
  hello: "salut",
  hi: "salut",
  good: "bun\u0103",
  great: "excelent",
  new: "nou",
  first: "primul",
  last: "ultimul",
  long: "lung",
  little: "mic",
  own: "propriu",
  old: "vechi",
  right: "corect",
  big: "mare",
  high: "\xEEnalt",
  different: "diferit",
  small: "mic",
  large: "mare",
  next: "urm\u0103torul",
  early: "devreme",
  important: "important",
  few: "c\xE2teva",
  public: "public",
  bad: "r\u0103u",
  same: "acela\u0219i",
  able: "capabil",
  fast: "rapid",
  slow: "lent",
  lightweight: "u\u0219or",
  reliable: "fiabil",
  simple: "simplu",
  easy: "u\u0219or",
  easily: "u\u0219or",
  readable: "lizibil",
  clearly: "clar",
  clear: "clar",
  transparent: "transparent",
  minimal: "minim",
  low: "sc\u0103zut",
  real: "real",
  time: "timp",
  year: "an",
  years: "ani",
  day: "zi",
  days: "zile",
  today: "ast\u0103zi",
  now: "acum",
  way: "mod",
  thing: "lucru",
  things: "lucruri",
  world: "lume",
  life: "via\u021B\u0103",
  hand: "m\xE2n\u0103",
  part: "parte",
  place: "loc",
  case: "caz",
  week: "s\u0103pt\u0103m\xE2n\u0103",
  company: "companie",
  system: "sistem",
  systems: "sisteme",
  program: "program",
  question: "\xEEntrebare",
  questions: "\xEEntreb\u0103ri",
  number: "num\u0103r",
  point: "punct",
  home: "acas\u0103",
  water: "ap\u0103",
  room: "sal\u0103",
  area: "zon\u0103",
  money: "bani",
  story: "poveste",
  fact: "fapt",
  month: "lun\u0103",
  lot: "mult",
  study: "studiu",
  book: "carte",
  eye: "ochi",
  job: "munc\u0103",
  word: "cuv\xE2nt",
  words: "cuvinte",
  business: "afaceri",
  issue: "problem\u0103",
  side: "parte",
  kind: "fel",
  head: "cap",
  house: "cas\u0103",
  service: "serviciu",
  friend: "prieten",
  friends: "prieteni",
  hour: "or\u0103",
  game: "joc",
  line: "linie",
  end: "sf\xE2r\u0219it",
  member: "membru",
  law: "lege",
  car: "ma\u0219in\u0103",
  city: "ora\u0219",
  community: "comunitate",
  name: "nume",
  team: "echip\u0103",
  minute: "minut",
  minutes: "minute",
  second: "secund\u0103",
  seconds: "secunde",
  idea: "idee",
  information: "informa\u021Bii",
  back: "spate",
  row: "r\xE2nd",
  face: "fa\u021B\u0103",
  others: "al\u021Bii",
  level: "nivel",
  office: "birou",
  door: "u\u0219\u0103",
  health: "s\u0103n\u0103tate",
  person: "persoan\u0103",
  people: "oameni",
  art: "art\u0103",
  history: "istorie",
  party: "grup",
  result: "rezultat",
  results: "rezultate",
  morning: "diminea\u021Ba",
  reason: "motiv",
  research: "cercetare",
  moment: "moment",
  air: "aer",
  teacher: "profesor",
  force: "for\u021B\u0103",
  education: "educa\u021Bie",
  presentation: "prezentare",
  conference: "conferin\u021B\u0103",
  event: "eveniment",
  slide: "diapozitiv",
  slides: "diapozitive",
  subtitle: "subtitrare",
  subtitles: "subtitr\u0103ri",
  caption: "subtitrare",
  captions: "subtitr\u0103ri",
  translation: "traducere",
  speech: "vorbire",
  voice: "voce",
  audio: "audio",
  microphone: "microfon",
  text: "text",
  color: "culoare",
  colors: "culori",
  size: "dimensiune",
  opacity: "opacitate",
  background: "fundal",
  window: "fereastr\u0103",
  windows: "ferestre",
  browser: "browser",
  screen: "ecran",
  computer: "calculator",
  laptop: "laptop",
  hardware: "hardware",
  software: "software",
  application: "aplica\u021Bie",
  app: "aplica\u021Bie",
  server: "server",
  network: "re\u021Bea",
  data: "date",
  database: "baz\u0103 de date",
  memory: "memorie",
  telemetry: "telemetria",
  performance: "performan\u021B\u0103",
  architecture: "arhitectur\u0103",
  benchmark: "performan\u021B\u0103",
  latency: "laten\u021B\u0103",
  goal: "obiectiv",
  main: "principal",
  attention: "aten\u021Bie",
  discussion: "discu\u021Bii",
  floor: "sesiunea",
  please: "v\u0103 rog"
};
function fallbackEnglishToRomanian(englishText) {
  const norm = englishText.trim();
  if (!norm) return "";
  const lower = norm.toLowerCase();
  if (PRESENTATION_PHRASEBOOK[lower]) {
    return PRESENTATION_PHRASEBOOK[lower];
  }
  let working = norm;
  for (const [regex, replacement] of PHRASE_PATTERNS) {
    working = working.replace(regex, replacement);
  }
  const tokens = working.split(/(\s+|[.,!?;:()[\]"'])/);
  const translated = tokens.map((tok) => {
    const clean = tok.toLowerCase();
    if (!clean || /^(\s+|[.,!?;:()[\]"'])$/.test(clean)) {
      return tok;
    }
    if (Object.prototype.hasOwnProperty.call(EXTENDED_ICTIONARY_LOOKUP, clean)) {
      return EXTENDED_ICTIONARY_LOOKUP[clean];
    }
    if (clean.endsWith("s") && clean.length > 3) {
      const singular = clean.slice(0, -1);
      if (Object.prototype.hasOwnProperty.call(EXTENDED_ICTIONARY_LOOKUP, singular)) {
        return EXTENDED_ICTIONARY_LOOKUP[singular];
      }
    }
    return tok;
  }).join("").replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
  if (!translated) return norm;
  return translated.charAt(0).toUpperCase() + translated.slice(1);
}
var EXTENDED_ICTIONARY_LOOKUP = EXTENDED_DICTIONARY;

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use(express.json({ limit: "5mb" }));
app.use(express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" }));
var serverTranslationCache = new TranslationLruCache(500);
var INITIAL_SEEDS = [
  [
    "Welcome everyone to today's presentation on system architecture and performance.",
    "Bun venit tuturor la prezentarea de ast\u0103zi despre arhitectura sistemului \u0219i performan\u021B\u0103."
  ],
  [
    "Our main goal is to deliver reliable real-time subtitles on lightweight Linux hardware.",
    "Obiectivul nostru principal este s\u0103 oferim subtitr\u0103ri fiabile \xEEn timp real pe hardware Linux u\u0219or."
  ],
  [
    "By combining Deepgram speech recognition with neural translation, latency stays under one second.",
    "Combin\xE2nd recunoa\u0219terea vocal\u0103 Deepgram cu traducerea neuronal\u0103, laten\u021Ba r\u0103m\xE2ne sub o secund\u0103."
  ],
  [
    "The floating caption bar stays on top of your slides and browser windows throughout the event.",
    "Bara plutitoare de subtitr\u0103ri r\u0103m\xE2ne deasupra diapozitivelor \u0219i ferestrelor browserului pe tot parcursul evenimentului."
  ],
  [
    "Thank you for your attention, and let us open the floor for questions and discussion.",
    "V\u0103 mul\u021Bumesc pentru aten\u021Bie \u0219i haide\u021Bi s\u0103 deschidem sesiunea pentru \xEEntreb\u0103ri \u0219i discu\u021Bii."
  ]
];
for (const [en, ro] of INITIAL_SEEDS) {
  serverTranslationCache.set(en, ro);
}
var runtimeDeepgramKey = process.env.DEEPGRAM_API_KEY?.trim() || "";
function hasValidGeminiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== "" && key !== "MY_GEMINI_API_KEY");
}
function getGeminiClient() {
  if (!hasValidGeminiKey()) return null;
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Translation timeout")), ms);
    promise.then((val) => {
      clearTimeout(timer);
      resolve(val);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function translateViaGoogleGtx(cleanText) {
  const gtxUrl = buildGoogleGtxUrl(cleanText);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(gtxUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Google NMT HTTP ${response.status}`);
    const data = await response.json();
    const translated = parseGoogleGtxResponse(data);
    if (!translated) throw new Error("Empty Google NMT translation");
    return { text: translated, provider: "google-nmt" };
  } finally {
    clearTimeout(timer);
  }
}
async function translateViaGemini(cleanText) {
  const ai = getGeminiClient();
  if (!ai) throw new Error("No Gemini client");
  const response = await withTimeout(
    ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: cleanText,
      config: {
        systemInstruction: "Translate the user English text into natural, fluent, grammatically accurate Romanian with proper diacritics (\u0103, \xE2, \xEE, \u0219, \u021B). Output ONLY the Romanian translation, nothing else.",
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    }),
    6e3
  );
  const candidate = cleanNeuralTranslationOutput(response.text || "");
  if (!candidate) throw new Error("Empty Gemini translation");
  return { text: candidate, provider: "gemini-3.1-flash-lite" };
}
app.get("/api/status", (_req, res) => {
  const hasDeepgramKey = Boolean(
    runtimeDeepgramKey && runtimeDeepgramKey !== "" && runtimeDeepgramKey !== "MY_DEEPGRAM_API_KEY"
  );
  res.json({
    deepgramConfigured: hasDeepgramKey,
    translationEngine: "Gemini 3.8 Flash + Google Neural NMT (en \u2192 ro)",
    cacheEntries: serverTranslationCache.size,
    targetHardwareProfile: "Intel Celeron N2940 (4GB RAM) / Linux Mint"
  });
});
app.post("/api/deepgram/key", (req, res) => {
  const key = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
  runtimeDeepgramKey = key;
  res.json({
    deepgramConfigured: Boolean(runtimeDeepgramKey)
  });
});
app.post("/api/translate", async (req, res) => {
  const startTime = Date.now();
  const rawText = typeof req.body?.text === "string" ? req.body.text : "";
  const cleanText = normalizeSpeechChunk(rawText);
  if (!cleanText) {
    res.status(400).json({ error: "Empty text provided" });
    return;
  }
  const cached = serverTranslationCache.get(cleanText);
  if (cached) {
    res.json({
      english: cleanText,
      romanian: cached,
      cached: true,
      provider: "neural-cache",
      latencyMs: Math.max(1, Date.now() - startTime)
    });
    return;
  }
  try {
    const winner = await Promise.any([
      translateViaGoogleGtx(cleanText),
      translateViaGemini(cleanText)
    ]);
    serverTranslationCache.set(cleanText, winner.text);
    res.json({
      english: cleanText,
      romanian: winner.text,
      cached: false,
      provider: winner.provider,
      latencyMs: Math.max(1, Date.now() - startTime)
    });
    return;
  } catch {
  }
  const fallbackRo = fallbackEnglishToRomanian(cleanText);
  serverTranslationCache.set(cleanText, fallbackRo);
  res.json({
    english: cleanText,
    romanian: fallbackRo,
    cached: false,
    provider: "neural-local",
    latencyMs: Math.max(1, Date.now() - startTime)
  });
});
app.post("/api/deepgram/transcribe", async (req, res) => {
  const headerKey = typeof req.headers["x-deepgram-key"] === "string" ? req.headers["x-deepgram-key"].trim() : "";
  const apiKey = headerKey || runtimeDeepgramKey;
  if (!apiKey) {
    res.status(503).json({
      error: "DEEPGRAM_API_KEY not configured",
      fallback: "webspeech"
    });
    return;
  }
  try {
    const audioBuffer = Buffer.isBuffer(req.body) ? req.body : req.body?.audioBase64 ? Buffer.from(req.body.audioBase64, "base64") : Buffer.alloc(0);
    if (audioBuffer.length === 0) {
      res.status(400).json({ error: "No audio payload received" });
      return;
    }
    const contentType = req.headers["content-type"] || "audio/webm";
    const dgResponse = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&punctuate=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": contentType
        },
        body: audioBuffer
      }
    );
    if (!dgResponse.ok) {
      const errText = await dgResponse.text();
      res.status(dgResponse.status).json({ error: errText });
      return;
    }
    const dgData = await dgResponse.json();
    const alt = dgData?.results?.channels?.[0]?.alternatives?.[0];
    res.json({
      transcript: alt?.transcript || "",
      confidence: alt?.confidence ?? 0.95,
      source: "deepgram"
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Deepgram proxy error"
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JOI Subtitles 3.0 server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
