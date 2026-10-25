import { test } from "node:test";
import assert from "node:assert/strict";
import { DHIKR_PRESETS, TARGET_CHOICES, countOf, dayKey, newTasbih, normalizeTasbih, progress, resetCount, roundsOf, selectDhikr, setTarget, tap, targetOf, undo } from "../src/index.ts";
import type { TasbihState } from "../src/index.ts";

const D1 = "2026-10-23";
const D2 = "2026-10-24";

function tapN(s: TasbihState, n: number, day = D1): TasbihState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = tap(cur, day).state;
  return cur;
}

test("presets: unique ids, Arabic with a sound and meaning in both languages, free counter has no limit", () => {
  const ids = DHIKR_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of DHIKR_PRESETS) {
    assert.ok(p.meaning.en && p.meaning.bn, p.id);
    assert.ok(Number.isInteger(p.target) && p.target >= 0, p.id);
    if (p.arabic !== null) assert.ok(p.sound.en && p.sound.bn, p.id);
  }
  assert.equal(DHIKR_PRESETS.find((p) => p.id === "free")?.target, 0);
  assert.equal(DHIKR_PRESETS.find((p) => p.id === "free")?.arabic, null);
  for (const t of DHIKR_PRESETS.map((p) => p.target)) assert.ok(TARGET_CHOICES.includes(t), `target ${t} is offered in the picker`);
});

test("tap counts, a finished round stays full, the next tap starts the next round", () => {
  let s = newTasbih(D1);
  assert.equal(s.selected, "subhanallah");
  assert.equal(targetOf(s, "subhanallah"), 33);
  const r32 = tapN(s, 32);
  assert.equal(countOf(r32, "subhanallah"), 32);
  const r33 = tap(r32, D1);
  assert.equal(r33.finishedRound, true);
  assert.equal(countOf(r33.state, "subhanallah"), 33);
  assert.equal(roundsOf(r33.state, "subhanallah"), 1);
  assert.equal(r33.state.today, 33);
  s = tap(r33.state, D1).state;
  assert.equal(countOf(s, "subhanallah"), 1, "next tap begins round two");
  assert.equal(roundsOf(s, "subhanallah"), 1);
  assert.equal(s.today, 34);
  assert.equal(tap(r32, D1).finishedRound && tap(r32, D1).state.today, 33);
  assert.equal(tap(newTasbih(D1), D1).finishedRound, false);
});

test("a counter with no limit never finishes a round", () => {
  let s = selectDhikr(newTasbih(D1), "free", D1);
  s = tapN(s, 250);
  assert.equal(countOf(s, "free"), 250);
  assert.equal(roundsOf(s, "free"), 0);
  assert.equal(progress(250, 0), 0);
});

test("each dhikr keeps its own place; today's total is shared", () => {
  let s = tapN(newTasbih(D1), 5);
  s = selectDhikr(s, "alhamdulillah", D1);
  s = tapN(s, 3);
  assert.equal(countOf(s, "subhanallah"), 5);
  assert.equal(countOf(s, "alhamdulillah"), 3);
  assert.equal(s.today, 8);
  assert.equal(selectDhikr(s, "no-such-dhikr", D1).selected, "alhamdulillah");
});

test("undo takes back one tap, also the one that finished a round, and stops at 0", () => {
  const full = tapN(newTasbih(D1), 33);
  assert.equal(roundsOf(full, "subhanallah"), 1);
  const back = undo(full, D1);
  assert.equal(countOf(back, "subhanallah"), 32);
  assert.equal(roundsOf(back, "subhanallah"), 0);
  assert.equal(back.today, 32);
  const none = undo(newTasbih(D1), D1);
  assert.equal(none.today, 0);
  assert.equal(countOf(none, "subhanallah"), 0);
  // After round two has begun, undo goes back into it, not into round one.
  const second = tapN(full, 1);
  assert.equal(countOf(undo(second, D1), "subhanallah"), 0);
  assert.equal(roundsOf(undo(second, D1), "subhanallah"), 1);
});

test("reset clears the place in the round, not today's history", () => {
  const s = resetCount(tapN(newTasbih(D1), 40), D1);
  assert.equal(countOf(s, "subhanallah"), 0);
  assert.equal(s.today, 40);
  assert.equal(roundsOf(s, "subhanallah"), 1);
});

test("a new day starts today's total and rounds again, and keeps the place in each round", () => {
  const s = tapN(newTasbih(D1), 40);
  const next = tap(s, D2).state;
  assert.equal(next.day, D2);
  assert.equal(next.today, 1);
  assert.equal(roundsOf(next, "subhanallah"), 0);
  assert.equal(countOf(next, "subhanallah"), 8, "7 into round two, plus this tap");
  const picked = selectDhikr(s, "allahuakbar", D2);
  assert.equal(picked.today, 0);
  assert.equal(picked.day, D2);
});

test("setTarget: own target wins, a count that has reached the new target starts fresh, bad targets are ignored", () => {
  let s = tapN(newTasbih(D1), 20);
  const t10 = setTarget(s, 10, D1);
  assert.equal(targetOf(t10, "subhanallah"), 10);
  assert.equal(countOf(t10, "subhanallah"), 0);
  assert.equal(t10.today, 20, "the tap total is untouched");
  assert.equal(roundsOf(undo(tapN(t10, 1), D1), "subhanallah"), 0, "undo never takes back a round that was not counted");
  s = setTarget(s, 100, D1);
  assert.equal(countOf(s, "subhanallah"), 20);
  assert.equal(targetOf(setTarget(s, 0, D1), "subhanallah"), 0, "0 is 'no limit'");
  assert.equal(targetOf(setTarget(s, -1, D1), "subhanallah"), 100);
  assert.equal(targetOf(setTarget(s, 1.5, D1), "subhanallah"), 100);
  assert.equal(targetOf(setTarget(s, 10_000_000, D1), "subhanallah"), 100);
  assert.equal(targetOf(s, "alhamdulillah"), 33, "other dhikr keep their usual target");
});

test("normalizeTasbih trusts nothing that was stored", () => {
  assert.deepEqual(normalizeTasbih(null, D1), newTasbih(D1));
  assert.deepEqual(normalizeTasbih("x", D1), newTasbih(D1));
  assert.deepEqual(normalizeTasbih({ v: 2 }, D1), newTasbih(D1));
  const messy = normalizeTasbih({ v: 1, selected: "bogus", day: D1, today: -5, counts: { subhanallah: 7, ghost: 3, alhamdulillah: -1, allahuakbar: 2.5, free: "9" }, rounds: [], targets: { subhanallah: 5, free: 2_000_000 } }, D1);
  assert.equal(messy.selected, "subhanallah");
  assert.equal(messy.today, 0);
  assert.deepEqual(messy.counts, { subhanallah: 7 });
  assert.deepEqual(messy.rounds, {});
  assert.deepEqual(messy.targets, { subhanallah: 5 });
  const good = tapN(newTasbih(D1), 12);
  assert.deepEqual(normalizeTasbih(JSON.parse(JSON.stringify(good)), D1), good);
});

test("progress and dayKey", () => {
  assert.equal(progress(0, 33), 0);
  assert.equal(progress(33, 33), 1);
  assert.equal(progress(50, 33), 1);
  assert.ok(Math.abs(progress(11, 33) - 1 / 3) < 1e-9);
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});
