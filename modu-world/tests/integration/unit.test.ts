import { describe, expect, it } from "vitest";
import { humanCode, normalizeCode, CODE_ALPHABET, randomToken } from "@/lib/crypto";
import { toCsv } from "@/server/admin";
import { achievementSchema } from "@/lib/validation";

describe("crypto helpers", () => {
  it("generates unambiguous codes and normalises user input", () => {
    for (let i = 0; i < 200; i++) {
      const code = humanCode(2, 4);
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      for (const ch of code.replace("-", "")) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(normalizeCode(" k7qf 29xm ")).toBe("K7QF-29XM");
    expect(normalizeCode("k7qf-29xm")).toBe("K7QF-29XM");
  });

  it("public tokens carry 128 bits and are URL-safe", () => {
    const t = randomToken(16);
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(new Set(Array.from({ length: 1000 }, () => randomToken(16))).size).toBe(1000);
  });
});

describe("CSV export", () => {
  it("escapes quotes and neutralises formula injection", () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: "plain", c: "x,y" }]);
    expect(csv).toBe(`a,b,c\n"'=HYPERLINK(""x"")",plain,"x,y"\n`);
  });
});

describe("validation", () => {
  it("requires values for grade-based achievements", () => {
    const childId = "00000000-0000-4000-8000-000000000000";
    expect(achievementSchema.safeParse({ childId, kind: "grade", subject: "Math", period: "Q1" }).success).toBe(false);
    expect(achievementSchema.safeParse({ childId, kind: "task", subject: "Reading", period: "Q1" }).success).toBe(true);
    expect(
      achievementSchema.safeParse({ childId, kind: "improvement", subject: "Math", period: "Q1", currentValue: 7 }).success,
    ).toBe(false);
  });
});
