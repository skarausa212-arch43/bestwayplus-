import { describe, expect, it, beforeAll } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { withUser, callFn } from "@/lib/db";
import { createWalletNonce, linkWallet, walletLinkMessage, requestCertificate, myCertificates } from "@/server/web3";
import { activateToy } from "@/server/toys";
import { createBatch } from "@/server/admin";
import { attestAdult, checkCredentials, registerUser } from "@/server/users";
import { characterId, makeBatch, makeChild, makeUser } from "../support/fixtures";

let admin: { id: string };
beforeAll(async () => {
  admin = await makeUser(["parent", "admin"]);
});

describe("database hardening (RLS + grants)", () => {
  it("the runtime role cannot read secrets or write ledgers directly", async () => {
    const user = await makeUser();
    await expect(withUser(admin.id, (db) => db.query("select activation_secret_hash from nfc_tags limit 1"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(withUser(admin.id, (db) => db.query("select password_hash from users limit 1"))).rejects.toThrow(/permission denied/);
    await expect(
      withUser(user.id, (db) => db.query("update points_accounts set balance = 999999 where user_id = $1", [user.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withUser(user.id, (db) =>
        db.query("insert into points_transactions (account_id, amount, balance_after, kind, idempotency_key) values (gen_random_uuid(), 1, 1, 'refund', 'x')"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("RLS hides other users' rows even with a hand-written query", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const rows = await withUser(a.id, async (db) => (await db.query("select id from users")).rows);
    expect(rows.map((r) => r.id)).toEqual([a.id]);
    const accounts = await withUser(a.id, async (db) => (await db.query("select user_id from points_accounts")).rows);
    expect(accounts.map((r) => r.user_id)).not.toContain(b.id);
    const anon = await withUser(null, async (db) => (await db.query("select count(*)::int as n from toy_instances")).rows[0].n);
    expect(anon).toBe(0);
  });

  it("non-admins cannot create batches or change roles", async () => {
    const user = await makeUser();
    const res = await createBatch(user.id, {
      characterId: await characterId(),
      quantity: 1,
      code: "HACK-1",
      edition: "standard",
      tagType: "ntag215",
      isDemo: false,
    });
    expect(res).toEqual({ ok: false, error: "FORBIDDEN" });
    const r = await withUser(user.id, (db) => db.query("update users set roles = '{admin}' where id = $1", [user.id]));
    expect(r.rowCount).toBe(0);
  });

  it("child accounts cannot activate toys or enter the adult area", async () => {
    const parent = await makeUser();
    const child = await makeChild(parent.id);
    const [tag] = await makeBatch(admin.id, 1);
    expect(await activateToy(child, tag.token, tag.activationCode)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await attestAdult(child, "1990-01-01")).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("auth", () => {
  it("rejects duplicate e-mails case-insensitively and checks passwords", async () => {
    const email = `Case-${Date.now()}@Test.local`;
    expect((await registerUser({ email, password: "long-enough-pass", displayName: "Anna", acceptTerms: true })).ok).toBe(true);
    expect(await registerUser({ email: email.toLowerCase(), password: "long-enough-pass", displayName: "Anna", acceptTerms: true })).toEqual(
      { ok: false, error: "EMAIL_TAKEN" },
    );
    expect(await checkCredentials(email.toLowerCase(), "long-enough-pass")).toBeTruthy();
    expect(await checkCredentials(email, "wrong-password")).toBeNull();
    expect(await checkCredentials("nobody@test.local", "whatever")).toBeNull();
  });

  it("adult attestation requires 18+", async () => {
    const user = await makeUser();
    const year = new Date().getFullYear();
    expect(await attestAdult(user.id, `${year - 15}-01-01`)).toEqual({ ok: false, error: "UNDERAGE" });
    expect((await attestAdult(user.id, `${year - 30}-01-01`)).ok).toBe(true);
  });
});

describe("wallet linking (testnet)", () => {
  it("links a wallet with a signed nonce, and the nonce cannot be replayed", async () => {
    const user = await makeUser(["parent", "collector"]);
    const account = privateKeyToAccount(generatePrivateKey());
    const n = await createWalletNonce(user.id);
    if (!n.ok) throw new Error(n.error);
    const signature = await account.signMessage({ message: n.message });
    expect((await linkWallet(user.id, account.address, n.nonce, signature, 11155111)).ok).toBe(true);
    expect(await linkWallet(user.id, account.address, n.nonce, signature, 11155111)).toEqual({ ok: false, error: "INVALID_NONCE" });
  });

  it("rejects a signature from a different wallet and non-collectors", async () => {
    const user = await makeUser(["parent", "collector"]);
    const real = privateKeyToAccount(generatePrivateKey());
    const fake = privateKeyToAccount(generatePrivateKey());
    const n = await createWalletNonce(user.id);
    if (!n.ok) throw new Error(n.error);
    const sig = await fake.signMessage({ message: walletLinkMessage(n.nonce, 11155111) });
    expect(await linkWallet(user.id, real.address, n.nonce, sig, 11155111)).toEqual({ ok: false, error: "BAD_SIGNATURE" });
    const parent = await makeUser();
    expect(await createWalletNonce(parent.id)).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("collectors get a certificate record for toys they own (pending without a configured minter)", async () => {
    const collector = await makeUser(["parent", "collector"]);
    const [tag] = await makeBatch(admin.id, 1, "modu-dragon");
    const act = await activateToy(collector.id, tag.token, tag.activationCode);
    if (!act.ok) throw new Error(act.error);
    const res = await requestCertificate(collector.id, act.toy_id);
    expect(res).toMatchObject({ ok: true, minted: false, reason: "MINTER_NOT_CONFIGURED" });
    const certs = await myCertificates(collector.id);
    expect(certs).toHaveLength(1);
    expect(JSON.stringify(certs[0].metadata)).not.toContain(collector.email);
    const stranger = await makeUser(["parent", "collector"]);
    expect(await callFn(stranger.id, "request_certificate", [act.toy_id])).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
