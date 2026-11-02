// Answer quality on question sets, with floors that a change must not drop below.
// - tuning-questions*.json: sets the engine was tuned on (they will look better than reality).
// - holdout-questions.json: written before the last round of changes and never tuned on.
// - random questions: generated from templates with typos and noise; seeds never tuned on.
// Rates measured on 2 Nov 2026 are in the comments; the floors leave a little room.
import { describe, expect, it } from "vitest";
import { createEngine } from "@/lib/engine";
import { ARTICLES, SYNONYMS } from "@/lib/kb";
import { createSeed } from "@/lib/seed";
import tuning from "./fixtures/tuning-questions.json";
import tuning2 from "./fixtures/tuning-questions-2.json";
import holdout from "./fixtures/holdout-questions.json";
import { randomQuestions } from "./fixtures/random-questions";

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
  it("tuning questions (114/125 and 73/100 measured)", () => {
    expect(score(tuning as Array<[string, string]>).right).toBeGreaterThanOrEqual(0.88);
    expect(score(tuning2 as Array<[string, string]>).right).toBeGreaterThanOrEqual(0.7);
  });

  it("holdout questions (73% right, 7% confidently wrong measured; 57% and 10% before)", () => {
    const s = score(holdout as Array<[string, string]>);
    expect(s.right).toBeGreaterThanOrEqual(0.7);
    expect(s.wrong).toBeLessThanOrEqual(0.08);
  });

  it.each([31337, 4242, 123456])("random questions, seed %i (77% right, 1.5% confidently wrong measured; 44% and 7% before)", (seed) => {
    const s = score(randomQuestions(2000, seed));
    expect(s.right).toBeGreaterThanOrEqual(0.74);
    expect(s.wrong).toBeLessThanOrEqual(0.025);
  });

  it("never answers off-topic random questions from an article", () => {
    const off = randomQuestions(3000, 99).filter((x) => x.want === "OUT");
    expect(off.length).toBeGreaterThan(50);
    for (const { q } of off) expect(engine.answer(q, opts).kind, q).not.toBe("answer");
  });
});
