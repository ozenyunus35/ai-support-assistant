import { describe, expect, it } from "vitest";
import { MAX_MESSAGE, addCustomerMessage, sendAgentReply } from "@/lib/api";
import { createEngine } from "@/lib/engine";
import { ARTICLES, SYNONYMS } from "@/lib/kb";
import { getState } from "@/lib/store";

const engine = createEngine(ARTICLES, SYNONYMS);
const ask = (q: string) => engine.answer(q, { threshold: 0.45 });
const cites = (q: string) => {
  const r = ask(q);
  return r.kind === "answer" ? r.citations[0]?.articleId : r.kind;
};

describe("sources match the answer", () => {
  it("cites the domestic shipping article for a US state", () => {
    const r = ask("how long does delivery take to california");
    expect(r.citations[0]?.articleId).toBe("shipping-times");
    expect(r.text).toMatch(/3 to 5 business days/);
  });
  it("still cites international shipping for another country", () => {
    expect(cites("do you ship to japan")).toBe("international-shipping");
  });
});

describe("phrasing customers use", () => {
  it.each([
    ["how do I send my order back", "start-return"],
    ["can I give this jacket back", "returns-policy"],
    ["the tent came broken", "missing-damaged"],
    ["my stove arrived completely smashed", "missing-damaged"],
    ["what's your email address", "contact-us"],
    ["how do I change my email address", "account"],
    ["what are your shipping rates", "shipping-times"],
    ["the price went down after I bought it", "promo-codes"],
    ["does the hiking pants run small", "apparel-sizing"],
    ["can you repair my daypack", "repairs"],
    ["are you open on sunday", "stores"],
  ])("%j → %s", (q, want) => {
    expect(cites(q)).toBe(want);
  });

  it.each([
    ["how do i restore water repellency", "choosing-a-tent"],
    ["I want the sleeping bag in red instead", "sleeping-bag-ratings"],
  ])("no longer answers %j from the wrong article (%s)", (q, wrongBefore) => {
    expect(cites(q)).not.toBe(wrongBefore);
  });

  it("drops what the customer says they don't need", () => {
    expect(cites("I don't need to return anything, just want to know when my card is charged")).toBe("payment-methods");
  });

  it("doesn't read 'custom' as customs or 'military discount' as an APO address", () => {
    expect(cites("do you make custom embroidery on jackets")).not.toBe("international-shipping");
    expect(cites("do you have a military discount")).not.toBe("shipping-times");
  });

  it("keeps 'sleeping bag' apart from tent capacity", () => {
    expect(engine.analyse("which sleeping bag for winter", true).terms).not.toContain("capacity");
  });

  it("doesn't 'correct' hiking into hire", () => {
    expect(engine.analyse("hiking boots", true).terms).not.toContain("rent");
  });
});

describe("intent and clear winners", () => {
  it("prefers the section that matches the intent over a rare side word", () => {
    const r = engine.answer("can you patch a hole in my down jacket", { threshold: 0.3 });
    expect(r.citations[0]?.articleId).toBe("repairs");
  });
  it("answers a clear winner even with words the help center never uses", () => {
    expect(cites("got my package but the backpack is missing")).toBe("missing-damaged");
  });
});

describe("message length", () => {
  it("cuts customer messages and agent replies at the limit", () => {
    const id = addCustomerMessage(`  ${"a".repeat(MAX_MESSAGE + 500)}  `);
    let conv = getState().conversations.find((c) => c.id === id)!;
    expect(conv.messages.at(-1)!.text).toHaveLength(MAX_MESSAGE);
    sendAgentReply(id, "b".repeat(MAX_MESSAGE * 3));
    conv = getState().conversations.find((c) => c.id === id)!;
    expect(conv.messages.at(-1)!.text).toHaveLength(MAX_MESSAGE);
  });
  it("still answers a very long message", () => {
    const q = `${"I have been a customer for years and this is so frustrating. ".repeat(30)} how long do refunds take`;
    expect(["answer", "handoff"]).toContain(ask(q.slice(0, MAX_MESSAGE)).kind);
  });
});
