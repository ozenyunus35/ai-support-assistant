import { describe, expect, it } from "vitest";
import { createEngine, sections, stem, units, words } from "@/lib/engine";
import { ARTICLES, SYNONYMS } from "@/lib/kb";
import { createSeed } from "@/lib/seed";

const engine = createEngine(ARTICLES, SYNONYMS);
const opts = { threshold: 0.45, orders: createSeed(Date.parse("2026-10-29T12:00:00Z")).orders };
const ask = (q: string) => engine.answer(q, opts);

describe("text helpers", () => {
  it("splits words, folds accents and apostrophes", () => {
    expect(words("Where's my Café order?")).toEqual(["wheres", "my", "cafe", "order"]);
  });
  it("stems plurals and verb forms to the same root", () => {
    expect(stem("refunds")).toBe(stem("refund"));
    expect(stem("shipping")).toBe(stem("ship"));
    expect(stem("returned")).toBe(stem("return"));
    expect(stem("sizing")).toBe(stem("size"));
  });
  it("splits articles into sections and sentences", () => {
    const s = sections("Intro line.\n\n## First\nOne. Two $6.95 fee.\n- a\n- b");
    expect(s).toEqual([
      { heading: null, text: "Intro line." },
      { heading: "First", text: "One. Two $6.95 fee.\n- a\n- b" },
    ]);
    expect(units(s[1].text).map((u) => u.text)).toEqual(["One.", "Two $6.95 fee.", "a", "b"]);
  });
});

describe("retrieval", () => {
  it.each([
    ["How long does a refund take?", "refund-status"],
    ["Do you ship to Canada?", "international-shipping"],
    ["how do I wash my rain jacket", "waterproof-care"],
    ["what payment methods do you accept", "payment-methods"],
    ["I'm between sizes in a trim jacket", "apparel-sizing"],
    ["my zipper broke", "lifetime-warranty"],
    ["what are your store hours on sunday", "stores"],
    ["can I pay with klarna", "payment-methods"],
    ["can i get my money back if the tent is used", "returns-policy"],
    ["my parcel says delivered but it's not here", "track-order"],
  ])("answers %j from %s", (q, id) => {
    const r = ask(q);
    expect(r.kind).toBe("answer");
    expect(r.citations[0].articleId).toBe(id);
    expect(r.confidence).toBeGreaterThanOrEqual(0.45);
    expect(r.text.length).toBeGreaterThan(20);
  });

  it("maps customer wording through synonyms", () => {
    const a = engine.analyse("can I get my money back", true);
    expect(a.terms).toContain("refund");
    expect(a.synonyms).toContainEqual({ from: "money back", to: "refund" });
  });

  it("fixes small typos against the help center vocabulary", () => {
    const a = engine.analyse("refnd for a retrun", true);
    expect(a.corrections.map((c) => c.from)).toEqual(["refnd", "retrun"]);
    expect(a.terms).toEqual(["refund", "return"]);
  });

  it("keeps bullet lists together", () => {
    const r = ask("How long does a refund take?");
    expect(r.text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(4);
  });

  it("returns one result per article for help center search", () => {
    const hits = engine.searchArticles("return");
    expect(new Set(hits.map((h) => h.articleId)).size).toBe(hits.length);
    expect(hits[0].articleId).toMatch(/return/);
  });
});

describe("questions outside the articles", () => {
  it("answers shipping by country from the country list", () => {
    expect(ask("do you ship to brazil").text).toMatch(/^We don't ship to Brazil yet/);
    expect(ask("Do you deliver to Germany?").text).toMatch(/^Yes, we ship to Germany/);
    expect(ask("do you ship to Turkey?")).toMatchObject({ kind: "answer", handoff: false });
  });

  it("does not guess product prices", () => {
    expect(ask("price of tent").kind).toBe("clarify");
    expect(ask("how much is shipping").kind).toBe("answer");
  });

  it("introduces itself and asks for English", () => {
    expect(ask("who are you?").text).toMatch(/virtual assistant/);
    expect(ask("iade nasıl yapılır").text).toMatch(/only answer in English/);
  });

  it("asks again instead of opening a ticket for gibberish", () => {
    expect(ask("asdfghjkl")).toMatchObject({ kind: "clarify", handoff: false });
  });

  it("prefers the step-by-step article for how-to questions", () => {
    expect(ask("how do I return shoes").citations[0].title).toBe("How to start a return");
  });
});

describe("handoff", () => {
  it.each(["do you sell kayaks?", "do you have a student discount"])("hands off %j", (q) => {
    const r = ask(q);
    expect(r.kind).toBe("handoff");
    expect(r.handoff).toBe(true);
    expect(r.confidence).toBeLessThan(0.45);
  });

  it.each(["what's the weather like", "will it rain tomorrow in Denver", "is it going to snow this weekend"])("doesn't answer weather questions from gear articles: %j", (q) => {
    const r = ask(q);
    expect(r.kind).toBe("clarify");
    expect(r.citations).toEqual([]);
  });

  it("hands off at once when someone asks for a person", () => {
    const r = ask("Can I talk to a real person?");
    expect(r).toMatchObject({ kind: "handoff", handoff: true, confidence: 1 });
  });

  it("follows the threshold", () => {
    const q = "can you patch a hole in my down jacket";
    const c = engine.answer(q, { threshold: 0 }).confidence;
    expect(c).toBeGreaterThan(0.3);
    expect(c).toBeLessThan(1);
    expect(engine.answer(q, { threshold: c - 0.01 }).kind).toBe("answer");
    expect(engine.answer(q, { threshold: c + 0.01 }).kind).toBe("handoff");
  });

  it("a stricter threshold also hands off clear winners", () => {
    // The help center never mentions "got", so this answers only through the clear-winner rule.
    const q = "got my package but the backpack is missing";
    expect(engine.answer(q, { threshold: 0.45 }).kind).toBe("answer");
    expect(engine.answer(q, { threshold: 0.8 }).kind).toBe("handoff");
  });
});

describe("conversation turns", () => {
  it("greets and thanks without searching", () => {
    expect(ask("hello").kind).toBe("greeting");
    expect(ask("thanks!").kind).toBe("thanks");
  });

  it("asks for the order number, then looks the order up", () => {
    expect(ask("where is my order?").kind).toBe("clarify");
    const r = ask("It's NF-20481");
    expect(r.kind).toBe("order");
    expect(r.order).toMatchObject({ number: "NF-20481", status: "shipped" });
    expect(r.citations[0].articleId).toBe("track-order");
  });

  it("says so when an order number doesn't exist", () => {
    const r = ask("status of nf 99999");
    expect(r.kind).toBe("clarify");
    expect(r.text).toContain("NF-99999");
  });
});

it("explains the pipeline for the playground", () => {
  const x = engine.explain("refnd for used tents", { threshold: 0.45 });
  expect(x.analysis.corrections[0]).toEqual({ from: "refnd", to: "refund" });
  expect(x.hits.length).toBeGreaterThan(0);
  expect(x.hits[0].score).toBeGreaterThanOrEqual(x.hits[x.hits.length - 1].score);
  expect(x.confidence).toBeGreaterThan(0);
  expect(x.coverage).toBeLessThanOrEqual(1);
});
