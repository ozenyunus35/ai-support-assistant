import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
import { TR } from "@/lib/tr";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("Turkish interface", () => {
  it("has a translation for every literal passed to t()", () => {
    const keys = new Set<string>();
    for (const f of files("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
      // t(cond ? "a" : "b", ...) picks between two literals.
      for (const m of src.matchAll(/\bt\([^()]*?\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
        keys.add(JSON.parse(`"${m[1]}"`));
        keys.add(JSON.parse(`"${m[2]}"`));
      }
    }
    const missing = [...keys].filter((k) => TR[k] === undefined);
    expect(missing).toEqual([]);
    expect(keys.size).toBeGreaterThan(200);
  });

  it("translates sentences built in code, keeping numbers and names", () => {
    expect(translate("tr", "30 calendar days since delivery")).toBe("teslimattan bu yana 30 takvim günü");
    expect(translate("tr", "order NF-20481")).toBe("sipariş NF-20481");
    expect(translate("tr", "waiting {time}", { time: "7 dk" })).toBe("7 dk bekliyor");
    expect(translate("en", "waiting {time}", { time: "7 min" })).toBe("waiting 7 min");
  });
});

