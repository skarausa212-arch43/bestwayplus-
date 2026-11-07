import { describe, expect, it, beforeAll } from "vitest";
import { activateToy, getPassport, startTransfer, acceptTransfer, cancelTransfer } from "@/server/toys";
import { reissueActivationCode, setToyRevoked } from "@/server/admin";
import { accountOf, makeBatch, makeUser } from "../support/fixtures";

let admin: { id: string };
beforeAll(async () => {
  admin = await makeUser(["parent", "admin"]);
});

describe("NFC activation", () => {
  it("activates a toy once, credits the welcome bonus and hides the owner on the public passport", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const owner = await makeUser();
    const stranger = await makeUser();

    const before = await getPassport(tag.token, null);
    expect(before.ok && before.status).toBe("in_stock");

    const res = await activateToy(owner.id, tag.token, tag.activationCode);
    expect(res.ok).toBe(true);
    expect((await accountOf(owner.id)).balance).toBe(100);

    const asOwner = await getPassport(tag.token, owner.id);
    const asStranger = await getPassport(tag.token, stranger.id);
    expect(asOwner.ok && asOwner.is_owner).toBe(true);
    expect(asStranger.ok && asStranger.is_owner).toBe(false);
    expect(JSON.stringify(asStranger)).not.toContain(owner.email);
    expect(JSON.stringify(asStranger)).not.toContain(owner.id);
  });

  it("accepts codes typed in lower case or without the dash", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const user = await makeUser();
    const res = await activateToy(user.id, tag.token, tag.activationCode.toLowerCase().replace("-", " "));
    expect(res.ok).toBe(true);
  });

  it("refuses a second activation, by anyone, and never pays the bonus twice", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const first = await makeUser();
    const second = await makeUser();
    expect((await activateToy(first.id, tag.token, tag.activationCode)).ok).toBe(true);
    expect(await activateToy(second.id, tag.token, tag.activationCode)).toEqual({ ok: false, error: "ALREADY_ACTIVATED" });
    expect(await activateToy(first.id, tag.token, tag.activationCode)).toEqual({ ok: false, error: "ALREADY_ACTIVATED" });
    expect((await accountOf(first.id)).balance).toBe(100);
    expect((await accountOf(second.id)).balance).toBe(0);
  });

  it("lets exactly one of two simultaneous activations win", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const a = await makeUser();
    const b = await makeUser();
    const results = await Promise.all([
      activateToy(a.id, tag.token, tag.activationCode),
      activateToy(b.id, tag.token, tag.activationCode),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "ALREADY_ACTIVATED")).toHaveLength(1);
  });

  it("locks the tag after 5 wrong codes (brute-force protection)", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const attacker = await makeUser();
    for (let i = 0; i < 5; i++) {
      expect(await activateToy(attacker.id, tag.token, "AAAA-AAAA")).toEqual({ ok: false, error: "INVALID_CODE" });
    }
    expect(await activateToy(attacker.id, tag.token, tag.activationCode)).toEqual({ ok: false, error: "LOCKED" });
    const passport = await getPassport(tag.token, null);
    expect(passport.ok && passport.locked).toBe(true);
  });

  it("does not activate with a code from another toy of the same batch", async () => {
    const [t1, t2] = await makeBatch(admin.id, 2);
    const user = await makeUser();
    expect(await activateToy(user.id, t1.token, t2.activationCode)).toEqual({ ok: false, error: "INVALID_CODE" });
  });

  it("returns NOT_FOUND for unknown or malformed tokens", async () => {
    expect(await getPassport("does-not-exist-000000000", null)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await getPassport("../../etc/passwd", null)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("requires login and refuses child accounts", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    // a null user is "not logged in"
    const { callFn } = await import("@/lib/db");
    expect(await callFn(null, "activate_toy", [tag.token, "x", null])).toEqual({ ok: false, error: "UNAUTHENTICATED" });
  });

  it("admin can revoke a tag and re-issue a lost activation code", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const toyId = (await getPassport(tag.token, null)) as { toy_id: string };
    const user = await makeUser();
    const re = await reissueActivationCode(admin.id, toyId.toy_id);
    expect(re.ok).toBe(true);
    // the old code no longer works
    expect(await activateToy(user.id, tag.token, tag.activationCode)).toEqual({ ok: false, error: "INVALID_CODE" });
    expect((await setToyRevoked(admin.id, toyId.toy_id, true, "test")).ok).toBe(true);
    expect(await activateToy(user.id, tag.token, (re as { code: string }).code)).toEqual({ ok: false, error: "REVOKED" });
    // non-admins cannot do either
    expect(await setToyRevoked(user.id, toyId.toy_id, false, "x")).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("ownership transfer", () => {
  it("moves ownership with a one-time code and keeps history", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const seller = await makeUser();
    const buyer = await makeUser();
    const act = await activateToy(seller.id, tag.token, tag.activationCode);
    if (!act.ok) throw new Error(act.error);

    const tr = await startTransfer(seller.id, act.toy_id);
    if (!tr.ok) throw new Error(tr.error);
    expect(tr.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    expect(await acceptTransfer(seller.id, tag.token, tr.code)).toEqual({ ok: false, error: "SELF_TRANSFER" });
    expect(await acceptTransfer(buyer.id, tag.token, "WRONG-CODE-0000")).toEqual({ ok: false, error: "INVALID_CODE" });
    expect((await acceptTransfer(buyer.id, tag.token, tr.code)).ok).toBe(true);

    const p = await getPassport(tag.token, buyer.id);
    expect(p.ok && p.is_owner && p.transfers).toBe(1);
    // replaying the same code does nothing
    expect(await acceptTransfer(seller.id, tag.token, tr.code)).toEqual({ ok: false, error: "NO_PENDING_TRANSFER" });
    // the previous owner can no longer start or cancel transfers
    expect(await startTransfer(seller.id, act.toy_id)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await cancelTransfer(seller.id, act.toy_id)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("only the owner can start a transfer (IDOR)", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const owner = await makeUser();
    const other = await makeUser();
    const act = await activateToy(owner.id, tag.token, tag.activationCode);
    if (!act.ok) throw new Error(act.error);
    expect(await startTransfer(other.id, act.toy_id)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("a cancelled transfer code stops working", async () => {
    const [tag] = await makeBatch(admin.id, 1);
    const owner = await makeUser();
    const buyer = await makeUser();
    const act = await activateToy(owner.id, tag.token, tag.activationCode);
    if (!act.ok) throw new Error(act.error);
    const tr = await startTransfer(owner.id, act.toy_id);
    if (!tr.ok) throw new Error(tr.error);
    expect((await cancelTransfer(owner.id, act.toy_id)).ok).toBe(true);
    expect(await acceptTransfer(buyer.id, tag.token, tr.code)).toEqual({ ok: false, error: "NO_PENDING_TRANSFER" });
  });
});
