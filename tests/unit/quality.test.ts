// Answer quality on question sets, with floors that a change must not drop below.
// - tuning-questions*.json: sets the engine was tuned on (they will look better than reality).
// - holdout-questions.json: the first holdout; it became a tuning set in the second round.
// - holdout-questions-2.json: written before the second round and never tuned on.
// - random questions: two generators with different templates and noise (typos, texting shorthand,
//   stories around the question); the seeds checked here were never tuned on.
// Rates measured on 2 Nov 2026 are in the comments; the floors leave a little room.
import { describe, expect, it } from "vitest";
import { createEngine } from "@/lib/engine";
import { ARTICLES, SYNONYMS } from "@/lib/kb";
import { createSeed } from "@/lib/seed";
import tuning from "./fixtures/tuning-questions.json";
import tuning2 from "./fixtures/tuning-questions-2.json";
import holdout from "./fixtures/holdout-questions.json";
import answerText from "./fixtures/answer-text.json";
import holdout2 from "./fixtures/holdout-questions-2.json";
import { randomQuestions } from "./fixtures/random-questions";
import { randomQuestions2 } from "./fixtures/random-questions-2";

const engine = createEngine(ARTICLES, SYNONYMS);
const opts = { threshold: 0.45, orders: createSeed(Date.parse("2026-10-29T12:00:00Z")).orders };
const REPLY_KINDS = ["order", "handoff", "thanks", "greeting", "clarify"];

function score(set: Array<[string, string] | { q: string; want: string }>) {
  let right = 0, wrong = 0;
  for (const item of set) {
    const [q, want] = Array.isArray(item) ? item : [item.q, item.want];
    const r = engine.answer(q, opts);
    let ok: boolean;
    if (want === "OUT") ok = r.kind !== "answer";
    else if (REPLY_KINDS.includes(want)) ok = r.kind === want;
    // Asking for the order number is a fine reply to "where's my package".
    else ok = (r.kind === "answer" && r.citations[0]?.articleId === want) || (want === "track-order" && r.kind === "clarify" && /order number/.test(r.text));
    if (ok) right++;
    else if (r.kind === "answer") wrong++;
  }
  return { right: right / set.length, wrong: wrong / set.length };
}

describe("answer quality", () => {
  it("tuning questions (90%, 79% and 77% right measured)", () => {
    expect(score(tuning as Array<[string, string]>).right).toBeGreaterThanOrEqual(0.88);
    expect(score(tuning2 as Array<[string, string]>).right).toBeGreaterThanOrEqual(0.75);
    const s = score(holdout as Array<[string, string]>);
    expect(s.right).toBeGreaterThanOrEqual(0.74);
    expect(s.wrong).toBeLessThanOrEqual(0.05);
  });

  it("second holdout (68% right, 10% confidently wrong measured on 2 Nov after the help center fix; 65% and 7% before the second round)", () => {
    const s = score(holdout2 as Array<[string, string]>);
    expect(s.right).toBeGreaterThanOrEqual(0.64);
    expect(s.wrong).toBeLessThanOrEqual(0.1);
  });

  it.each([31337, 4242, 123456])("random questions, seed %i (81% right, 0.6% confidently wrong measured; 44% and 7% at first)", (seed) => {
    const s = score(randomQuestions(2000, seed));
    expect(s.right).toBeGreaterThanOrEqual(0.78);
    expect(s.wrong).toBeLessThanOrEqual(0.015);
  });

  it.each([22, 33])("second generator, seed %i (63% right, 3.9% confidently wrong measured; 51% and 7% before)", (seed) => {
    const s = score(randomQuestions2(3000, seed));
    expect(s.right).toBeGreaterThanOrEqual(0.6);
    expect(s.wrong).toBeLessThanOrEqual(0.055);
  });

  it("answers state the fact that was asked for (33/35 measured; 26/35 before)", () => {
    const missing = (answerText as Array<[string, string]>).filter(([q, fact]) => {
      const r = engine.answer(q, opts);
      return r.kind !== "answer" || !new RegExp(fact, "i").test(r.text);
    });
    expect(missing.length, missing.map(([q]) => q).join("; ")).toBeLessThanOrEqual(3);
  });

  it("never answers off-topic random questions from an article", () => {
    const off = randomQuestions(3000, 99).filter((x) => x.want === "OUT");
    expect(off.length).toBeGreaterThan(50);
    for (const { q } of off) expect(engine.answer(q, opts).kind, q).not.toBe("answer");
  });
});
