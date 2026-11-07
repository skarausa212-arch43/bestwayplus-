import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

/**
 * The investor demo, end to end (steps 1–10 of the brief), through the real UI.
 */
const PASSWORD = "ModuDemo2026!";

async function login(page: Page, email: string, password = PASSWORD, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => u.pathname === next);
}

test.describe.configure({ mode: "serial" });

let issued: { code: string; url: string }[] = [];
const parentEmail = `parent-${Date.now()}@e2e.local`;

test("1–2. admin creates a batch of three toys and gets NFC links + one-time codes", async ({ page }) => {
  await login(page, "admin@modu.demo", PASSWORD, "/admin/batches");
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Batch code").fill(`E2E-${Date.now().toString(36).toUpperCase()}`);
  await page.getByRole("button", { name: "Create batch & NFC links" }).click();
  const box = page.getByTestId("issued-batch");
  await expect(box).toBeVisible();
  const rows = box.getByTestId("issued-row");
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    issued.push({
      code: (await rows.nth(i).getByTestId("issued-code").textContent())!.trim(),
      url: (await rows.nth(i).getByTestId("issued-url").textContent())!.trim(),
    });
  }
  expect(issued[0].url).toMatch(/\/t\/[A-Za-z0-9_-]{22}$/);
  expect(issued[0].code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test("3–5. a new user scans the tag, signs up, activates the toy and sees it in My MODU", async ({ page }) => {
  await page.goto(issued[0].url);
  await expect(page.getByText("Awaiting activation").first()).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).first().click();
  await page.getByLabel("Your name").fill("Demo Parent");
  await page.getByLabel("E-mail").fill(parentEmail);
  await page.getByLabel("Password").fill("a-strong-password-1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/t\//);

  await page.getByLabel("Activation code").fill(issued[0].code.toLowerCase());
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByText(/welcome bonus/)).toBeVisible();

  // a second activation with the same code is refused
  await page.goto(issued[0].url);
  await expect(page.getByText("This is your figure")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("my-toy")).toHaveCount(1);
  await expect(page.getByText("Activation bonus").first()).toBeVisible();
});

test("6. the parent adds a child profile and a school achievement", async ({ page }) => {
  await login(page, parentEmail, "a-strong-password-1");
  await page.getByText("+ Add a child").click();
  await page.getByLabel("Child's name").fill("Mila");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add a child" }).click();
  await expect(page.getByText("Mila").first()).toBeVisible();

  await page.goto("/school");
  await page.getByLabel("Type").selectOption("improvement");
  await page.getByLabel("Subject").fill("Mathematics");
  await page.getByLabel("Period").fill("2026 term 1");
  await page.getByLabel("Before").fill("5");
  await page.getByLabel("Now / grade").fill("7");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Estimated: 160 MP/)).toBeVisible();
  await expect(page.getByTestId("achievement").first()).toContainText("In review");
});

test("7–8. admin approves the achievement and MODU Points are credited", async ({ page, browser }) => {
  await login(page, "admin@modu.demo", PASSWORD, "/admin/school");
  const item = page.getByTestId("review-item").filter({ hasText: "Mathematics" });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Approve" }).click();
  // the item leaves the queue and shows up as reviewed with the awarded points
  await expect(item).toHaveCount(0);
  await expect(page.locator("li").filter({ hasText: "Mathematics" })).toContainText("+160");

  const ctx = await browser.newContext({ locale: "en-US" });
  const p = await ctx.newPage();
  await login(p, parentEmail, "a-strong-password-1");
  await expect(p.getByText("Achievement").first()).toBeVisible();
  await expect(p.getByText("+160 MP").first()).toBeVisible();
  await ctx.close();
});

test("9. the parent redeems points for a demo reward and gets a single-use coupon", async ({ page }) => {
  await login(page, parentEmail, "a-strong-password-1", "/rewards");
  const card = page.locator('[data-testid="reward"][data-slug="sticker-pack"]');
  await card.getByRole("combobox").selectOption({ label: "Mila · 160 MP" });
  await card.getByRole("button", { name: "Get it" }).click();
  const coupon = card.getByTestId("new-coupon");
  await expect(coupon).toHaveText(/^MODU-[0-9A-F]{4}-[0-9A-F]{4}$/);
  const code = (await coupon.textContent())!;

  await page.goto("/dashboard");
  await expect(page.getByTestId("coupon-code").first()).toHaveText(code);
  await expect(page.getByText("Reward redemption").first()).toBeVisible();
});

async function injectWallet(ctx: BrowserContext) {
  const account = privateKeyToAccount(generatePrivateKey());
  await ctx.exposeBinding("__moduTestSign", async (_src, hex: `0x${string}`) => account.signMessage({ message: { raw: hex } }));
  await ctx.addInitScript((address: string) => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [address];
          case "eth_chainId":
            return "0xaa36a7";
          case "net_version":
            return "11155111";
          case "wallet_requestPermissions":
          case "wallet_getPermissions":
            return [{ parentCapability: "eth_accounts" }];
          case "personal_sign":
            return (window as unknown as { __moduTestSign: (h: string) => Promise<string> }).__moduTestSign(params![0] as string);
          default:
            throw new Error(`unsupported ${method}`);
        }
      },
      on: (e: string, f: () => void) => ((listeners[e] ??= []).push(f)),
      removeListener: () => {},
    };
  }, account.address);
  return account.address.toLowerCase();
}

test("10. an adult collector connects a test wallet and sees the toy's digital certificate", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "en-US" });
  const address = await injectWallet(ctx);
  const page = await ctx.newPage();
  await login(page, "collector@modu.demo", PASSWORD, "/collectors");

  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Sign & link" }).click();
  await expect(page.getByText(address)).toBeVisible();

  const toy = page.getByTestId("collector-toy").first();
  await toy.getByRole("button", { name: "Issue certificate" }).click();
  await expect(page.getByTestId("certificate")).toContainText("Certificate #");
  await expect(page.getByTestId("certificate")).toContainText("ERC-721");

  // public ERC-721 metadata contains no personal data
  const meta = await page.request.get("/api/certificates/1");
  expect(meta.ok()).toBe(true);
  const json = await meta.json();
  expect(json.name).toContain("MODU DRAGON");
  expect(JSON.stringify(json)).not.toContain("collector@modu.demo");
  await ctx.close();
});

test("children's side stays separate: a parent without 18+ cannot reach Web3 features", async ({ page }) => {
  await login(page, parentEmail, "a-strong-password-1", "/coin");
  await expect(page.getByText("Confirm your age")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet" })).toHaveCount(0);
});

test("non-admins are redirected away from the admin panel and exports", async ({ page }) => {
  await login(page, parentEmail, "a-strong-password-1", "/dashboard");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?denied=admin/);
  const res = await page.request.get("/api/admin/batches/00000000-0000-0000-0000-000000000000/export");
  expect(res.status()).toBe(403);
});
