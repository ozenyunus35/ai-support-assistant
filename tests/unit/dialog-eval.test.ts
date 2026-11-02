// Evaluation of the conversation layer on the generated set in fixtures/dialog-eval.ts.
// Every rate says what it was measured on. The set is templated: it says how the layer behaves on these
// shapes of message, not how it would do with real customers.
import { describe, expect, it } from "vitest";
import { respondTo, type DialogContext, type DialogReply } from "@/lib/dialog";
import { createEngine } from "@/lib/engine";
import { ARTICLES, SYNONYMS } from "@/lib/kb";
import { createSeed } from "@/lib/seed";
import { dialogEval, type EvalCase } from "./fixtures/dialog-eval";
import { dialogEval2 } from "./fixtures/dialog-eval-2";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const engine = createEngine(ARTICLES, SYNONYMS);
const opts = { threshold: 0.45, orders: createSeed(NOW).orders, now: NOW };

const OUTCOME: Record<NonNullable<EvalCase["outcome"]>, RegExp> = {
  refund: /inside that window|within 60 days[^.]*full refund/i,
  credit: /store credit[^.]*(?:inside that limit|within 30 days)|inside that limit/i,
  past: /past that (?:window|limit)|no longer possible|not for a refund/i,
  free: /(?:is|are) free|free\b/i,
  paid: /flat \$19|\$6\.95|not over/i,
  "past-review": /past the 10 business days/i,
  "within-review": /should be on its way/i,
  "cancel-refused": /nothing has been cancelled/i,
  "not-shipped": /./,
};

function run(c: EvalCase) {
  let ctx: DialogContext | undefined;
  let r!: DialogReply;
  for (const t of c.turns) {
    r = respondTo(engine, t, ctx, opts);
    ctx = r.context;
  }
  return r;
}

interface Result {
  family: string;
  source?: boolean;
  complete?: boolean;
  clarifyOk?: boolean;
  wrongConfident?: boolean;
  needlessHandoff?: boolean;
  missedHandoff?: boolean;
  context?: boolean;
  allOk: boolean;
}

function judge(c: EvalCase): Result & { c: EvalCase; r: DialogReply } {
  const r = run(c);
  const answered = !r.handoff && r.kind !== "clarify";
  const res: Result & { c: EvalCase; r: DialogReply } = { family: c.family, allOk: true, c, r };
  if (c.sources) {
    const got = new Set(r.citations.map((x) => x.articleId));
    res.source = c.sources.some((s) => got.has(s)) && (c.family !== "multi" || c.sources.every((s) => got.has(s)));
    if (!res.source) res.allOk = false;
  }
  if (c.requests !== undefined) {
    res.complete = r.total === c.requests && r.covered === c.requests;
    if (!res.complete) res.allOk = false;
  }
  if (c.clarify !== undefined) {
    res.clarifyOk = (r.kind === "clarify") === c.clarify;
    if (!res.clarifyOk) res.allOk = false;
  }
  if (c.handoff === false) {
    res.needlessHandoff = r.handoff;
    if (r.handoff) res.allOk = false;
  }
  if (c.handoff === true) {
    const fine = r.handoff || (!!c.orIntent && r.parts.every((p) => p.intent === c.orIntent));
    res.missedHandoff = !fine;
    if (!fine) res.allOk = false;
  }
  if (c.outcome || c.hasNot) {
    // Wrong and confident: the reply states an answer (no question, no hand-off) that breaks the expected outcome or says something it must not.
    const wrong = (!!c.outcome && !OUTCOME[c.outcome].test(r.text)) || (!!c.hasNot && c.hasNot.some((x) => x.test(r.text)));
    res.wrongConfident = answered && wrong;
    if (wrong) res.allOk = false;
  }
  if (c.outcome && !answered && c.clarify !== true) res.allOk = false;
  if (c.has && !c.has.every((x) => x.test(r.text))) res.allOk = false;
  if (c.order && r.order?.number !== c.order && !r.text.includes(c.order)) res.allOk = false;
  if (c.noOrderCard && r.order) res.allOk = false;
  if (c.needsContext) {
    res.context = !(c.has && !c.has.every((x) => x.test(r.text))) && !(c.hasNot && c.hasNot.some((x) => x.test(r.text))) && !r.handoff && r.kind !== "clarify";
    if (!res.context) res.allOk = false;
  }
  return res;
}

const SEEDS = [101, 202, 303];
const SETS = [
  { name: "set 1 (used to fix the layer after its first run)", cases: SEEDS.flatMap((seed) => dialogEval(400, seed)) },
  { name: "set 2 (first run 96.7% before two fixes, used for fixing since)", cases: [7, 8, 9].flatMap((seed) => dialogEval2(400, seed)) },
].map((s) => ({ ...s, results: s.cases.map(judge) }));
const rate = (xs: Result[], key: keyof Result) => {
  const rel = xs.filter((x) => x[key] !== undefined);
  return { n: rel.length, rate: rel.length ? rel.filter((x) => x[key] === true).length / rel.length : 1 };
};

describe("conversation layer on the generated sets", () => {
  for (const set of SETS) {
    it(`prints the rates for ${set.name}`, () => {
      const { results } = set;
      const fam = [...new Set(results.map((r) => r.family))];
      const lines = fam.map((f) => {
        const xs = results.filter((r) => r.family === f);
        return `${f.padEnd(16)} n=${String(xs.length).padStart(4)}  all right ${((xs.filter((x) => x.allOk).length / xs.length) * 100).toFixed(1)}%`;
      });
      const dims = {
        "source choice": rate(results, "source"),
        "multi-request completeness": rate(results, "complete"),
        "clarifying question right": rate(results, "clarifyOk"),
        "context used": rate(results, "context"),
        "wrong confident answer (lower is better)": rate(results, "wrongConfident"),
        "needless hand-off (lower is better)": rate(results, "needlessHandoff"),
        "missed hand-off (lower is better)": rate(results, "missedHandoff"),
      };
      process.stderr.write(`\n== ${set.name}\n${lines.join("\n")}\n${Object.entries(dims).map(([k, v]) => `${k.padEnd(42)} n=${String(v.n).padStart(4)}  ${v.n ? (v.rate * 100).toFixed(1) + "%" : "not applicable"}`).join("\n")}\noverall all-right ${((results.filter((r) => r.allOk).length / results.length) * 100).toFixed(1)}% of ${results.length}\n`);
      if (process.env.DUMP && set.name.startsWith(process.env.SET ?? "set 2")) {
        const shown = results.filter((x) => x.family === process.env.DUMP && !x.allOk).slice(0, Number(process.env.SHOW ?? 6));
        process.stderr.write(shown.map((x) => `\n! ${x.c.turns.join(" || ")}\n  ${x.r.kind} ${x.r.parts.map((p) => p.intent + "/" + p.status).join(",")}: ${x.r.text.slice(0, 380)}\n  want ${JSON.stringify({ o: x.c.outcome, s: x.c.sources, has: x.c.has?.map(String), hasNot: x.c.hasNot?.map(String), h: x.c.handoff, cl: x.c.clarify })}`).join("\n") + "\n");
      }
      expect(results.length).toBe(1200);
      // Floors against regressions; both sets have been used to fix the layer by now (see the header of fixtures/dialog-eval-2.ts).
      expect(results.filter((x) => x.allOk).length / results.length).toBeGreaterThan(0.95);
      expect(dims["wrong confident answer (lower is better)"].rate).toBeLessThan(0.01);
      expect(dims["needless hand-off (lower is better)"].rate).toBeLessThan(0.02);
    });
  }
});
