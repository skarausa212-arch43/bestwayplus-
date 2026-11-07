import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { redeemReward, redeemCoupon, cancelRedemption } from "@/server/rewards";
import { accountOf, grantPoints, makeChild, makePartner, makeReward, makeUser } from "../support/fixtures";

let admin: { id: string };
beforeAll(async () => {
  admin = await makeUser(["parent", "admin"]);
});

describe("rewards", () => {
  it("debits points and issues a single-use coupon", async () => {
    const user = await makeUser();
    const acc = await grantPoints(user.id, 500);
    const reward = await makeReward({ cost: 200 });
    const res = await redeemReward(user.id, acc, reward, randomUUID());
    if (!res.ok) throw new Error(res.error);
    expect(res.coupon_code).toMatch(/^MODU-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(res.balance).toBe(300);
    expect((await accountOf(user.id)).balance).toBe(300);
  });

  it("refuses when the balance is too low", async () => {
    const user = await makeUser();
    const acc = await grantPoints(user.id, 100);
    const reward = await makeReward({ cost: 200 });
    expect(await redeemReward(user.id, acc, reward, randomUUID())).toEqual({ ok: false, error: "INSUFFICIENT_POINTS" });
  });

  it("is idempotent: replaying the same request returns the same coupon without a second debit", async () => {
    const user = await makeUser();
    const acc = await grantPoints(user.id, 1000);
    const reward = await makeReward({ cost: 300 });
    const key = randomUUID();
    const [a, b] = await Promise.all([redeemReward(user.id, acc, reward, key), redeemReward(user.id, acc, reward, key)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.coupon_code).toBe(b.coupon_code);
    expect((await accountOf(user.id)).balance).toBe(700);
  });

  it("never double-spends under concurrent requests with different keys", async () => {
    const user = await makeUser();
    const acc = await grantPoints(user.id, 250);
    const reward = await makeReward({ cost: 200 });
    const results = await Promise.all(Array.from({ length: 6 }, () => redeemReward(user.id, acc, reward, randomUUID())));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await accountOf(user.id)).balance).toBe(50);
  });

  it("respects stock and per-user limits", async () => {
    const user = await makeUser();
    const acc = await grantPoints(user.id, 1000);
    const limited = await makeReward({ cost: 10, limit: 1 });
    expect((await redeemReward(user.id, acc, limited, randomUUID())).ok).toBe(true);
    expect(await redeemReward(user.id, acc, limited, randomUUID())).toEqual({ ok: false, error: "LIMIT_REACHED" });

    const scarce = await makeReward({ cost: 10, stock: 1 });
    const other = await makeUser();
    const acc2 = await grantPoints(other.id, 100);
    expect((await redeemReward(user.id, acc, scarce, randomUUID())).ok).toBe(true);
    expect(await redeemReward(other.id, acc2, scarce, randomUUID())).toEqual({ ok: false, error: "OUT_OF_STOCK" });
  });

  it("a parent can spend a child's points, a stranger cannot (IDOR)", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const childAcc = await grantPoints(child, 300);
    const stranger = await makeUser();
    const reward = await makeReward({ cost: 100 });
    expect(await redeemReward(stranger.id, childAcc, reward, randomUUID())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await redeemReward(parent.id, childAcc, reward, randomUUID())).ok).toBe(true);
    expect((await accountOf(child)).balance).toBe(200);
  });
});

describe("coupons", () => {
  it("the partner redeems a coupon exactly once; other partners cannot see it", async () => {
    const partnerId = await makePartner();
    const otherPartnerId = await makePartner();
    const cashier = await makeUser(["partner"], { partnerId });
    const foreignCashier = await makeUser(["partner"], { partnerId: otherPartnerId });
    const user = await makeUser();
    const acc = await grantPoints(user.id, 500);
    const reward = await makeReward({ cost: 100, partnerId });
    const res = await redeemReward(user.id, acc, reward, randomUUID());
    if (!res.ok) throw new Error(res.error);

    expect(await redeemCoupon(foreignCashier.id, res.coupon_code)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await redeemCoupon(user.id, res.coupon_code)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await redeemCoupon(cashier.id, res.coupon_code.toLowerCase())).ok).toBe(true);
    expect(await redeemCoupon(cashier.id, res.coupon_code)).toEqual({ ok: false, error: "ALREADY_REDEEMED" });
  });

  it("admin can cancel an unused coupon and the points are refunded once", async () => {
    const user = await makeUser();
    const acc = await grantPoints(user.id, 300);
    const reward = await makeReward({ cost: 100 });
    const res = await redeemReward(user.id, acc, reward, randomUUID());
    if (!res.ok) throw new Error(res.error);
    expect((await cancelRedemption(admin.id, res.redemption_id, "customer request")).ok).toBe(true);
    expect(await cancelRedemption(admin.id, res.redemption_id, "again")).toEqual({ ok: false, error: "INVALID_STATE" });
    expect((await accountOf(user.id)).balance).toBe(300);
    expect(await redeemCoupon(admin.id, res.coupon_code)).toEqual({ ok: false, error: "VOID" });
  });
});
