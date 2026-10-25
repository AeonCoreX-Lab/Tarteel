/**
 * The tasbih (dhikr) counter: Tarteel's own model, written for this app.
 *
 * What it keeps, and why:
 *  - `counts`: where each dhikr has got to in its current round. It survives closing the app, so a round started after one prayer
 *    can be finished after the next.
 *  - `rounds` and `today`: how many full rounds, and how many taps in all, today. They start again at midnight (the person's own
 *    local date, given in by the caller: this module never reads a clock).
 *  - `targets`: a target the person set for one dhikr, over the usual one.
 *
 * A round that reaches its target stays on screen as full ("33 of 33") until the next tap, which starts the next round. Nothing is
 * lost at the moment of finishing, and Undo can take the last tap back, even the one that finished a round.
 *
 * The dhikr texts are the plain, well-known phrases. The meanings and the Bengali sound-spellings are Tarteel's own wording.
 * No reward or merit is attached to any number: the targets are a starting point the person can change.
 */

export interface DhikrPreset {
  id: string;
  /** Arabic with vowel marks; null for the free counter. */
  arabic: string | null;
  /** How to say it, in Latin letters, and in Bengali letters. */
  sound: { en: string; bn: string };
  /** What it means. */
  meaning: { en: string; bn: string };
  /** The usual number for one round; 0 means count without a limit. */
  target: number;
}

export const DHIKR_PRESETS: readonly DhikrPreset[] = [
  { id: "subhanallah", arabic: "سُبْحَانَ ٱللَّٰهِ", sound: { en: "Subḥānallāh", bn: "সুবহানাল্লাহ" }, meaning: { en: "Glory be to Allah", bn: "আল্লাহ মহাপবিত্র" }, target: 33 },
  { id: "alhamdulillah", arabic: "ٱلْحَمْدُ لِلَّٰهِ", sound: { en: "Al-ḥamdu lillāh", bn: "আলহামদুলিল্লাহ" }, meaning: { en: "All praise is for Allah", bn: "সমস্ত প্রশংসা আল্লাহর" }, target: 33 },
  { id: "allahuakbar", arabic: "ٱللَّٰهُ أَكْبَرُ", sound: { en: "Allāhu akbar", bn: "আল্লাহু আকবার" }, meaning: { en: "Allah is the Greatest", bn: "আল্লাহ সর্বমহান" }, target: 34 },
  { id: "lailaha", arabic: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ", sound: { en: "Lā ilāha illā llāh", bn: "লা ইলাহা ইল্লাল্লাহ" }, meaning: { en: "There is no god but Allah", bn: "আল্লাহ ছাড়া কোনো ইলাহ নেই" }, target: 100 },
  { id: "astaghfirullah", arabic: "أَسْتَغْفِرُ ٱللَّٰهَ", sound: { en: "Astaghfiru llāh", bn: "আস্তাগফিরুল্লাহ" }, meaning: { en: "I ask Allah for forgiveness", bn: "আমি আল্লাহর কাছে ক্ষমা চাই" }, target: 100 },
  { id: "salawat", arabic: "ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ", sound: { en: "Allāhumma ṣalli ʿalā Muḥammad", bn: "আল্লাহুম্মা সাল্লি আলা মুহাম্মাদ" }, meaning: { en: "O Allah, send Your blessings upon Muhammad ﷺ", bn: "হে আল্লাহ, মুহাম্মাদ ﷺ-এর উপর রহমত বর্ষণ করুন" }, target: 100 },
  { id: "bihamdihi", arabic: "سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ", sound: { en: "Subḥānallāhi wa biḥamdih", bn: "সুবহানাল্লাহি ওয়া বিহামদিহি" }, meaning: { en: "Glory and praise be to Allah", bn: "আল্লাহ মহাপবিত্র, তাঁরই প্রশংসা" }, target: 100 },
  { id: "hawqala", arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ", sound: { en: "Lā ḥawla wa lā quwwata illā billāh", bn: "লা হাওলা ওয়া লা কুওওয়াতা ইল্লা বিল্লাহ" }, meaning: { en: "There is no power and no strength except with Allah", bn: "আল্লাহর সাহায্য ছাড়া কোনো শক্তি ও সামর্থ্য নেই" }, target: 100 },
  { id: "free", arabic: null, sound: { en: "", bn: "" }, meaning: { en: "Count anything, without a limit", bn: "যেকোনো কিছু সীমা ছাড়া গুনুন" }, target: 0 },
];

export const FREE_DHIKR_ID = "free";

/** Targets offered in the picker. 0 is "no limit". */
export const TARGET_CHOICES: readonly number[] = [0, 33, 34, 99, 100, 300, 1000];

/** No count or target goes past this: a stuck key can not grow the stored number without end. */
export const MAX_COUNT = 1_000_000;

export interface TasbihState {
  v: 1;
  selected: string;
  /** The local date (`YYYY-MM-DD`) that `today` and `rounds` belong to. */
  day: string;
  today: number;
  counts: Record<string, number>;
  rounds: Record<string, number>;
  targets: Record<string, number>;
}

export function newTasbih(day: string): TasbihState {
  return { v: 1, selected: DHIKR_PRESETS[0]?.id ?? FREE_DHIKR_ID, day, today: 0, counts: {}, rounds: {}, targets: {} };
}

/** The local calendar date of `d` as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const findDhikr = (id: string): DhikrPreset | undefined => DHIKR_PRESETS.find((p) => p.id === id);

const IDS = new Set(DHIKR_PRESETS.map((p) => p.id));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const whole = (v: unknown, max: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

function numberMap(v: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    const w = whole(n, max);
    if (IDS.has(k) && w !== null) out[k] = w;
  }
  return out;
}

/**
 * Makes anything that was stored into a valid state for `day`: unknown dhikr, negative or fractional numbers and wrong shapes are
 * dropped, never trusted. When the stored day is not `day`, today's total and rounds start again; each dhikr's place in its round
 * is kept.
 */
export function normalizeTasbih(raw: unknown, day: string): TasbihState {
  if (!isObj(raw) || raw.v !== 1) return newTasbih(day);
  const base = newTasbih(day);
  const selected = typeof raw.selected === "string" && IDS.has(raw.selected) ? raw.selected : base.selected;
  const counts = numberMap(raw.counts, MAX_COUNT);
  const targets = numberMap(raw.targets, MAX_COUNT);
  const sameDay = raw.day === day;
  return {
    v: 1,
    selected,
    day,
    today: sameDay ? (whole(raw.today, Number.MAX_SAFE_INTEGER) ?? 0) : 0,
    counts,
    rounds: sameDay ? numberMap(raw.rounds, MAX_COUNT) : {},
    targets,
  };
}

/** The target in force for a dhikr: the person's own, else the usual one. 0 means no limit. */
export function targetOf(s: TasbihState, id: string): number {
  return s.targets[id] ?? findDhikr(id)?.target ?? 0;
}

export function countOf(s: TasbihState, id: string): number {
  return s.counts[id] ?? 0;
}

export function roundsOf(s: TasbihState, id: string): number {
  return s.rounds[id] ?? 0;
}

/** Brings the state to `day` first, so a tap just after midnight lands on the new day. */
function today(s: TasbihState, day: string): TasbihState {
  return s.day === day ? s : normalizeTasbih(s, day);
}

export interface TapResult {
  state: TasbihState;
  /** This tap finished a round. */
  finishedRound: boolean;
}

/** One count for the selected dhikr. */
export function tap(state: TasbihState, day: string): TapResult {
  const s = today(state, day);
  const id = s.selected;
  const target = targetOf(s, id);
  let count = countOf(s, id);
  // A finished round stays on screen as full; the next tap begins the next one.
  if (target > 0 && count >= target) count = 0;
  if (count >= MAX_COUNT) return { state: s, finishedRound: false };
  count += 1;
  const finished = target > 0 && count === target;
  return {
    state: {
      ...s,
      today: Math.min(Number.MAX_SAFE_INTEGER, s.today + 1),
      counts: { ...s.counts, [id]: count },
      rounds: finished ? { ...s.rounds, [id]: Math.min(MAX_COUNT, roundsOf(s, id) + 1) } : s.rounds,
    },
    finishedRound: finished,
  };
}

/** Takes back the last tap on the selected dhikr, including one that finished a round. Does nothing at 0. */
export function undo(state: TasbihState, day: string): TasbihState {
  const s = today(state, day);
  const id = s.selected;
  const count = countOf(s, id);
  if (count <= 0) return s;
  const target = targetOf(s, id);
  const wasFinished = target > 0 && count === target;
  return {
    ...s,
    today: Math.max(0, s.today - 1),
    counts: { ...s.counts, [id]: count - 1 },
    rounds: wasFinished && roundsOf(s, id) > 0 ? { ...s.rounds, [id]: roundsOf(s, id) - 1 } : s.rounds,
  };
}

/** Sets the selected dhikr's place in its round back to 0. Today's total and rounds are history, so they stay. */
export function resetCount(state: TasbihState, day: string): TasbihState {
  const s = today(state, day);
  return { ...s, counts: { ...s.counts, [s.selected]: 0 } };
}

export function selectDhikr(state: TasbihState, id: string, day: string): TasbihState {
  const s = today(state, day);
  return IDS.has(id) ? { ...s, selected: id } : s;
}

/**
 * Changes the selected dhikr's target. A count that has already reached the new target starts a fresh round (so the ring never
 * shows a round as full that was not finished, and Undo never takes back a round that was not counted); the person's tap total
 * is untouched.
 */
export function setTarget(state: TasbihState, target: number, day: string): TasbihState {
  const s = today(state, day);
  if (!Number.isInteger(target) || target < 0 || target > MAX_COUNT) return s;
  const id = s.selected;
  const count = countOf(s, id);
  return { ...s, targets: { ...s.targets, [id]: target }, counts: target > 0 && count >= target ? { ...s.counts, [id]: 0 } : s.counts };
}

/** The share of the round done, 0 to 1; 0 for a counter with no limit. */
export function progress(count: number, target: number): number {
  return target > 0 ? Math.min(1, Math.max(0, count / target)) : 0;
}
