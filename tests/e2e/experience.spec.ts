import { expect, test as base, type Page } from "@playwright/test";

const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => {
        if (!e.message.endsWith("due to access control checks.")) errors.push(e.message);
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;
const misses = (page: Page) => page.evaluate(() => [...((window as unknown as { __i18nMisses?: Set<string> }).__i18nMisses ?? [])]);

async function nav(page: Page, name: string) {
  if (isMobile(page)) await page.getByRole("button", { name: "Menüyü aç" }).click();
  await page.getByRole("navigation", { name: "Ana menü" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("the admin console works in Turkish", async ({ page }) => {
  await page.goto("./admin/?lang=tr");
  await expect(page.getByRole("heading", { level: 1, name: "Genel bakış" })).toBeVisible();
  await expect(page.getByText("Temsilci bekleyenler")).toBeVisible();
  await nav(page, "Gelen kutusu");
  await page.getByRole("list", { name: "Sohbetler" }).getByRole("button").first().click();
  await expect(page.getByText("Başladı", { exact: true })).toBeVisible();
  await nav(page, "Bilgi bankası");
  await page.getByRole("tab", { name: /Eş anlamlılar/ }).click();
  await nav(page, "Cevap oyun alanı");
  await page.getByRole("button", { name: "Where is my order NF-20517?" }).click();
  await expect(page.getByText("3 · Karar ver")).toBeVisible();
  await page.getByRole("button", { name: "can i get my money back if the tent is used" }).click();
  await expect(page.getByText("Bu mesajdan saklanan bilgiler")).toBeVisible();
  await nav(page, "Ayarlar");
  await expect(page.getByTestId("threshold-impact")).toContainText("eşikte");
  expect(await misses(page)).toEqual([]);
});

test("the command palette opens an article and a conversation", async ({ page }) => {
  await page.goto("./admin/");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await page.getByRole("button", { name: "Search and commands" }).click();
  await palette.getByRole("combobox").fill("international shipping");
  await palette.getByRole("combobox").press("Enter");
  await expect(page).toHaveURL(/\/admin\/knowledge\/\?a=international-shipping/);
  await expect(page.getByRole("dialog", { name: "Edit article" })).toBeVisible();
  await page.getByRole("dialog", { name: "Edit article" }).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Search and commands" }).click();
  await palette.getByRole("combobox").fill("tent");
  await expect(palette.getByRole("option").first()).toBeVisible();
  await palette.getByRole("combobox").press("Enter");
  await expect(page).toHaveURL(/\/admin\/(knowledge\/\?a=|inbox\/\?c=)/);
});

test("the language switch changes the console and keeps the help center in English", async ({ page }) => {
  await page.goto("./admin/");
  await page.getByRole("radio", { name: "tr" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Genel bakış" })).toBeVisible();
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "How can we help?" })).toBeVisible();
});
