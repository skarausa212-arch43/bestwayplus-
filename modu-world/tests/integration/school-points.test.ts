import { describe, expect, it, beforeAll } from "vitest";
import { submitAchievement, reviewAchievement, listForGuardian, deleteAchievement } from "@/server/school";
import { accountsFor, adjustPoints, history } from "@/server/points";
import { randomUUID } from "node:crypto";
import { accountOf, makeChild, makeUser } from "../support/fixtures";

let admin: { id: string };
beforeAll(async () => {
  admin = await makeUser(["parent", "admin"]);
});

const base = { kind: "grade" as const, subject: "Math", period: "2026-Q1", currentValue: 8 };

describe("MODU School", () => {
  it("credits points only after admin approval, exactly once", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const sub = await submitAchievement(parent.id, { ...base, childId: child });
    if (!sub.ok) throw new Error(sub.error);
    expect((await accountOf(child)).balance).toBe(0);

    const r1 = await reviewAchievement(admin.id, { achievementId: sub.achievement_id, decision: "approved" });
    expect(r1.ok && r1.points).toBe(40);
    expect((await accountOf(child)).balance).toBe(40);

    // a second review (double click, replay) is refused and pays nothing
    expect(await reviewAchievement(admin.id, { achievementId: sub.achievement_id, decision: "approved", points: 500 })).toEqual({
      ok: false,
      error: "ALREADY_REVIEWED",
    });
    expect((await accountOf(child)).balance).toBe(40);
  });

  it("rejects duplicate submissions of the same achievement", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    expect((await submitAchievement(parent.id, { ...base, childId: child })).ok).toBe(true);
    expect(await submitAchievement(parent.id, { ...base, subject: " math ", childId: child })).toEqual({
      ok: false,
      error: "DUPLICATE",
    });
  });

  it("rewards improvement more than a high grade alone", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const high = await submitAchievement(parent.id, { ...base, currentValue: 9, childId: child });
    const improved = await submitAchievement(parent.id, {
      kind: "improvement",
      subject: "Physics",
      period: "2026-Q1",
      previousValue: 5,
      currentValue: 7,
      childId: child,
    });
    if (!high.ok || !improved.ok) throw new Error("submit failed");
    expect(improved.suggested_points).toBeGreaterThan(high.suggested_points);
  });

  it("rejection pays nothing", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const sub = await submitAchievement(parent.id, { ...base, childId: child });
    if (!sub.ok) throw new Error(sub.error);
    const r = await reviewAchievement(admin.id, { achievementId: sub.achievement_id, decision: "rejected", comment: "no proof" });
    expect(r.ok && r.points).toBe(0);
    expect((await accountOf(child)).balance).toBe(0);
  });

  it("a parent cannot submit for, see, or delete another family's child (IDOR)", async () => {
    const parentA = await makeUser();
    const parentB = await makeUser();
    const childB = await makeChild(parentB.id);
    expect(await submitAchievement(parentA.id, { ...base, childId: childB })).toEqual({ ok: false, error: "FORBIDDEN" });

    const sub = await submitAchievement(parentB.id, { ...base, childId: childB });
    if (!sub.ok) throw new Error(sub.error);
    expect(await listForGuardian(parentA.id)).toHaveLength(0);
    expect(await deleteAchievement(parentA.id, sub.achievement_id)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await listForGuardian(parentB.id)).toHaveLength(1);
  });

  it("only admins can review", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const sub = await submitAchievement(parent.id, { ...base, childId: child });
    if (!sub.ok) throw new Error(sub.error);
    expect(await reviewAchievement(parent.id, { achievementId: sub.achievement_id, decision: "approved" })).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });
});

describe("points ledger", () => {
  it("shows a parent their own and their children's accounts only", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const other = await makeUser();
    const accounts = await accountsFor(parent.id);
    expect(accounts.map((a) => a.user_id).sort()).toEqual([parent.id, child].sort());
    expect(await accountsFor(other.id)).toHaveLength(1);
  });

  it("admin adjustments are idempotent and cannot overdraw", async () => {
    const user = await makeUser();
    const acc = await accountOf(user.id);
    const key = randomUUID();
    expect((await adjustPoints(admin.id, acc.id, 50, "goodwill", key)).ok).toBe(true);
    const replay = await adjustPoints(admin.id, acc.id, 50, "goodwill", key);
    expect(replay.ok && (replay as { replayed: boolean }).replayed).toBe(true);
    expect((await accountOf(user.id)).balance).toBe(50);
    expect(await adjustPoints(admin.id, acc.id, -100, "too much", randomUUID())).toEqual({ ok: false, error: "INSUFFICIENT_POINTS" });
    expect(await adjustPoints(user.id, acc.id, 100, "self-service", randomUUID())).toEqual({ ok: false, error: "FORBIDDEN" });
    const h = await history(user.id, acc.id);
    expect(h).toHaveLength(1);
    expect(h[0].balance_after).toBe(50);
  });
});
