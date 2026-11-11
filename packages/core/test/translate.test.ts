import { test } from "node:test";
import assert from "node:assert/strict";
import { TranslateError, pickTranslator, splitForTranslation, targetLanguage, translateText } from "../src/index.ts";
import type { TranslatorPort } from "../src/index.ts";

const fake = (over: Partial<TranslatorPort> = {}): TranslatorPort => ({
  id: "fake",
  name: "Fake",
  available: async () => true,
  downloaded: async () => ["ar", "en"],
  prepare: async () => undefined,
  remove: async () => undefined,
  translate: async (t, from, to) => `${from}>${to}:${t}`,
  ...over,
});

test("splitForTranslation never loses or reorders text", () => {
  const text = "الحمد لله رب العالمين. الرحمن الرحيم؛ مالك يوم الدين\nإياك نعبد وإياك نستعين! اهدنا الصراط المستقيم؟ " + "كلمة ".repeat(200);
  for (const max of [20, 60, 450]) assert.equal(splitForTranslation(text, max).join(""), text);
});

test("splitForTranslation keeps pieces within the limit and cuts at sentence ends and spaces", () => {
  const sentences = Array.from({ length: 30 }, (_, i) => `جملة رقم ${i}.`).join(" ");
  const pieces = splitForTranslation(sentences, 100);
  assert.ok(pieces.length > 1);
  for (const p of pieces) assert.ok(p.length <= 100);
  for (const p of pieces.slice(0, -1)) assert.ok(/[. ]$/.test(p));
  const long = "كلمة ".repeat(100);
  for (const p of splitForTranslation(long, 50)) assert.ok(p.length <= 50);
  assert.deepEqual(splitForTranslation(""), []);
  assert.deepEqual(splitForTranslation("قصير"), ["قصير"]);
});

test("translateText translates each piece, marks the result as machine translation and reports progress", async () => {
  const seen: number[] = [];
  const text = "أولا. ثانيا. ثالثا.";
  const r = await translateText(fake(), text, "ar", "bn", { onProgress: (d) => seen.push(d) });
  assert.equal(r.machine, true);
  assert.equal(r.engineId, "fake");
  assert.equal(r.to, "bn");
  assert.ok(r.text.includes("ar>bn:"));
  assert.ok(seen.length >= 1 && seen[seen.length - 1] === seen.length);
});

test("translateText stops when asked and passes engine errors on", async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(translateText(fake(), "نص. نص.", "ar", "en", { signal: c.signal }), (e: unknown) => e instanceof TranslateError && e.code === "cancelled");
  const broken = fake({ translate: async () => { throw new TranslateError("pack-missing", "no pack"); } });
  await assert.rejects(translateText(broken, "نص", "ar", "en"), (e: unknown) => e instanceof TranslateError && e.code === "pack-missing");
});

test("pickTranslator takes the first engine that can run and survives one that throws", async () => {
  const a = fake({ id: "a", available: async () => false });
  const b = fake({ id: "b", available: async () => { throw new Error("boom"); } });
  const c = fake({ id: "c" });
  assert.equal((await pickTranslator([a, b, c]))?.id, "c");
  assert.equal(await pickTranslator([a, b]), null);
  assert.equal(await pickTranslator([]), null);
});

test("targetLanguage follows the app language unless one is chosen; Arabic falls back to English", () => {
  assert.equal(targetLanguage("app", "bn"), "bn");
  assert.equal(targetLanguage("app", "en"), "en");
  assert.equal(targetLanguage("app", "ar"), "en");
  assert.equal(targetLanguage("en", "bn"), "en");
  assert.equal(targetLanguage("bn", "en"), "bn");
});
