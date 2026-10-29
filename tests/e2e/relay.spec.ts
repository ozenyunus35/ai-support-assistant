import { expect, test as base, type Page } from "@playwright/test";

// Every test also fails on uncaught errors in the page.
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function openWidget(page: Page) {
  const panel = page.getByRole("dialog", { name: "Chat with Northfold support" });
  // The launcher is hidden behind the full-screen chat on phones, so find it by test id.
  const launcher = page.getByTestId("chat-launcher");
  await expect(launcher).toBeAttached();
  if ((await launcher.getAttribute("aria-expanded")) !== "true") await launcher.click();
  await expect(panel).toBeVisible();
  return panel;
}

async function ask(page: Page, text: string) {
  const panel = await openWidget(page);
  await panel.getByRole("textbox", { name: "Message" }).fill(text);
  await panel.getByRole("textbox", { name: "Message" }).press("Enter");
  return panel;
}

async function nav(page: Page, name: string) {
  if (isMobile(page)) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

const noHorizontalScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test("help center search finds articles and opens the cited section", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "How can we help?" })).toBeVisible();
  await page.getByLabel("Search the help center").fill("money back used tent");
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results.getByRole("option").first()).toContainText("Return policy");
  await page.getByLabel("Search the help center").press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Return policy" })).toBeVisible();
  await expect(page).toHaveURL(/#\/returns-policy\/used-gear$/);
  await expect(page.getByRole("heading", { name: "Used gear" })).toBeInViewport();
  await page.getByRole("link", { name: "Help center", exact: true }).click();
  await page.getByLabel("Search the help center").fill("zzzz qqqq");
  await expect(page.getByText("No articles match")).toBeVisible();
  await noHorizontalScroll(page);
});

test("assistant answers with a source, takes feedback and links to the article", async ({ page }) => {
  await page.goto("./");
  const panel = await openWidget(page);
  await panel.getByRole("button", { name: "How long do refunds take?" }).click();
  await expect(panel.getByText("PayPal: within 24 hours.")).toBeVisible();
  await expect(panel.getByTestId("answer-details")).toContainText("Confidence");
  const helpful = panel.getByRole("button", { name: "Helpful", exact: true });
  await helpful.click();
  await expect(helpful).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("link", { name: /Where is my refund\?.*How long refunds take/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Where is my refund?" })).toBeVisible();
  await expect(page).toHaveURL(/#\/refund-status\/how-long-refunds-take$/);
});

test("assistant fixes typos and maps customer wording", async ({ page }) => {
  await page.goto("./");
  const panel = await ask(page, "can i get a refnud if the tent is used");
  await expect(panel.getByText(/returned within 30 days for store credit/)).toBeVisible();
  await expect(panel.getByRole("link", { name: /Return policy/ })).toBeVisible();
});

test("order lookup asks for the number and shows the order", async ({ page }) => {
  await page.goto("./");
  let panel = await ask(page, "Where is my order?");
  await expect(panel.getByText("What's your order number?")).toBeVisible();
  panel = await ask(page, "NF-20481");
  const card = panel.getByLabel("Order NF-20481");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Ridge 2 tent");
  await expect(card.locator('[aria-current="step"]')).toContainText("Shipped");
});

test("unsure answers go to a person, and the reply from the inbox reaches the widget", async ({ page, context }) => {
  await page.goto("./");
  const panel = await ask(page, "Do you sell kayaks?");
  await expect(panel.getByText("I've asked a teammate to join")).toBeVisible();
  await expect(panel.getByText("Handed to the Northfold team")).toBeVisible();
  await expect(panel.getByRole("status").filter({ hasText: "usually replies" })).toBeVisible();

  const admin = await context.newPage();
  await admin.goto("./admin/inbox/?view=needs-human");
  const live = admin.getByRole("list", { name: "Conversations" }).getByRole("button").filter({ hasText: "Website visitor" });
  await expect(live).toContainText("Live");
  await live.click();
  await expect(admin.getByLabel("Transcript")).toContainText("Do you sell kayaks?");
  await expect(admin.getByLabel("Transcript")).toContainText("AI handed off");
  await admin.getByLabel("Reply").fill("We don't sell kayaks, but we do have kayak carts.");
  await admin.getByRole("button", { name: "Send reply" }).click();
  await expect(admin.getByText("It appears in the widget right away")).toBeVisible();

  await expect(panel.getByText("We don't sell kayaks, but we do have kayak carts.")).toBeVisible();
  await expect(panel.getByText("Sam Rivera · Northfold team")).toBeVisible();
  await admin.close();
});

test("talk to a person hands off at once", async ({ page }) => {
  await page.goto("./");
  const panel = await ask(page, "Do you ship to Canada?");
  await expect(panel.getByText(/We ship to Canada/)).toBeVisible();
  await panel.getByRole("button", { name: "Talk to a person" }).click();
  await expect(panel.getByText("Waiting for a teammate")).toBeVisible();
  await panel.getByRole("button", { name: "Start a new conversation" }).click();
  await expect(panel.getByRole("button", { name: "Do you ship to Canada?" })).toBeVisible();
});

test("overview shows KPIs, the daily chart and knowledge gaps", async ({ page }) => {
  await page.goto("./admin/");
  for (const kpi of ["Conversations", "Resolved by AI", "Handed to a person", "Helpful answers", "Median human reply"]) await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Waiting for a person" })).toBeVisible();
  await page.getByRole("link", { name: "Write article" }).first().click();
  await expect(page.getByRole("dialog", { name: "New article" })).toBeVisible();
  await expect(page.getByLabel("Body")).toHaveValue(/Customers ask:/);
  await noHorizontalScroll(page);
});

test("a new article is used by the assistant right away", async ({ page }) => {
  await page.goto("./admin/playground/");
  const q = page.getByLabel("Customer question");
  await q.fill("do you sell kayaks");
  await expect(page.getByTestId("decision")).toHaveText("Hand off to a person");

  await nav(page, "Knowledge base");
  await page.getByRole("button", { name: "New article" }).click();
  const dialog = page.getByRole("dialog", { name: "New article" });
  await dialog.getByLabel("Title").fill("Kayaks and paddle gear");
  await dialog.getByLabel("Category").selectOption("products");
  await dialog.getByLabel("Body").fill("We don't sell kayaks. We sell kayak carts, dry bags and paddling jackets.\n\n## Kayak carts\nThe Portage cart fits most sit-on-top kayaks and folds flat.");
  await expect(dialog.getByText("Indexed as 2 sections")).toBeVisible();
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("cell", { name: /Kayaks and paddle gear/ })).toBeVisible();

  await nav(page, "Answer playground");
  await page.getByLabel("Customer question").fill("do you sell kayaks");
  await expect(page.getByTestId("decision")).toHaveText("Answer");
  await expect(page.getByText("We don't sell kayaks.").first()).toBeVisible();

  await page.getByLabel("Customer question").fill("refnd for a retrun");
  await expect(page.getByText("refnd", { exact: true })).toBeVisible();
  await expect(page.getByText("retrun", { exact: true })).toBeVisible();
});

test("synonyms can be added and change matching", async ({ page }) => {
  await page.goto("./admin/knowledge/");
  await page.getByRole("tab", { name: /Synonyms/ }).click();
  await page.getByLabel("New synonym group").fill("warranty, lifetime promise");
  await page.getByRole("button", { name: "Add group" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Synonyms saved")).toBeVisible();
  await nav(page, "Answer playground");
  await page.getByLabel("Customer question").fill("what is the lifetime promise");
  await expect(page.getByText("lifetime promise", { exact: true })).toBeVisible();
});

test("settings preview the threshold and change the widget", async ({ page }) => {
  await page.goto("./admin/settings/");
  const impact = page.getByTestId("threshold-impact");
  const before = await impact.textContent();
  await page.getByLabel("Confidence threshold").fill("0.8");
  await expect(impact).not.toHaveText(before ?? "");
  await page.getByLabel("Name shown in the widget").fill("Northfold Helper");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.goto("./");
  const panel = await openWidget(page);
  await expect(panel.getByText("Northfold Helper")).toBeVisible();
});

test("inbox filters, search and resolve", async ({ page }) => {
  await page.goto("./admin/inbox/");
  const list = page.getByRole("list", { name: "Conversations" });
  await expect(list.getByRole("button").first()).toBeVisible();
  await page.getByRole("tab", { name: /Needs a person/ }).click();
  const waiting = list.getByRole("button");
  await expect(waiting).toHaveCount(3);
  await waiting.first().click();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Conversation resolved.")).toBeVisible();
  if (isMobile(page)) await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(list.getByRole("button")).toHaveCount(2);
  await page.getByRole("tab", { name: /^All/ }).click();
  await page.getByLabel("Search conversations").fill("kayaks");
  await expect(list.getByRole("button").first()).toBeVisible();
  await page.getByLabel("Search conversations").fill("zzzz-nothing");
  await expect(page.getByText("Nothing matches this search.")).toBeVisible();
});

test("reset restores the demo data", async ({ page }) => {
  await page.goto("./admin/settings/");
  await page.getByLabel("Name shown in the widget").fill("Changed");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("dialog", { name: "Reset demo data?" }).getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Name shown in the widget")).toHaveValue("Northfold Assistant");
});

test("theme toggle persists", async ({ page }) => {
  await page.goto("./");
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!dark);
});

test("phone layout: full-screen chat and drawer navigation", async ({ page }) => {
  test.skip(!isMobile(page), "phone only");
  await page.goto("./");
  await expect(page.getByRole("dialog", { name: "Chat with Northfold support" })).toBeHidden();
  const panel = await openWidget(page);
  // Measured once the open animation has settled.
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0)).toBe(page.viewportSize()?.width);
  await panel.getByRole("button", { name: "Close chat" }).click();
  await expect(panel).toBeHidden();
  await noHorizontalScroll(page);
  await page.goto("./admin/");
  await nav(page, "Inbox");
  await noHorizontalScroll(page);
});
