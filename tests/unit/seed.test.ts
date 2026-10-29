import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed";
import { handoffShareAt, metrics, overview } from "@/lib/stats";

const NOW = Date.parse("2026-10-29T15:00:00Z");
const seed = createSeed(NOW);

describe("seed", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(createSeed(NOW))).toBe(JSON.stringify(seed));
  });

  it("uses clearly synthetic contact details", () => {
    for (const c of seed.conversations) expect(c.customer.email).toMatch(/@mail\.example$/);
    const phones = JSON.stringify(seed.articles).match(/\(\d{3}\) \d{3}-\d{4}/g) ?? [];
    for (const p of phones) expect(p).toMatch(/555-01\d\d/);
    expect(JSON.stringify(seed.articles)).not.toMatch(/@(?!northfold\.example)[a-z]+\.[a-z]/);
  });

  it("has about two months of realistic, consistent history", () => {
    expect(seed.conversations.length).toBeGreaterThan(250);
    for (const c of seed.conversations) {
      expect(c.messages[0].role).toBe("customer");
      expect(Date.parse(c.messages[c.messages.length - 1].at)).toBeLessThanOrEqual(NOW);
      if (c.status === "needs-human") expect(c.messages.some((m) => m.role === "agent")).toBe(false);
      if (c.resolvedBy === "agent") expect(c.messages.some((m) => m.role === "agent")).toBe(true);
      if (c.resolvedBy === "ai") expect(c.handoffAt).toBeUndefined();
    }
    expect(seed.conversations.filter((c) => c.status === "needs-human").length).toBeGreaterThan(0);
  });
});

describe("stats", () => {
  const o = overview(seed, NOW);

  it("splits each day into AI-resolved and handed-off conversations", () => {
    expect(o.daily).toHaveLength(30);
    expect(o.daily.reduce((s, d) => s + d.ai + d.human, 0)).toBe(o.current.total);
  });

  it("computes plausible rates", () => {
    expect(o.current.resolutionRate).toBeGreaterThan(0.6);
    expect(o.current.resolutionRate).toBeLessThan(0.9);
    expect(o.current.handoffRate + o.current.resolutionRate).toBeLessThanOrEqual(1);
    expect(o.current.helpful).toBeGreaterThan(0.7);
    expect(o.current.medianHumanMinutes).toBeGreaterThan(1);
    expect(o.current.total).toBeGreaterThan(o.previous.total);
  });

  it("lists knowledge gaps from low-confidence handoffs only", () => {
    expect(o.gaps.length).toBeGreaterThan(3);
    expect(o.gaps.map((g) => g.question)).not.toContain("Can I talk to a person?");
    for (const g of o.gaps) expect(g.confidence).toBeLessThan(0.45);
  });

  it("handles empty input", () => {
    expect(metrics([])).toMatchObject({ total: 0, resolutionRate: 0, helpful: 0, medianHumanMinutes: 0 });
    expect(handoffShareAt([0.2, 0.5, 0.9], 0.45)).toBeCloseTo(1 / 3);
  });
});
