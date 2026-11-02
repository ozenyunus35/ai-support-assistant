// Takes the README screenshots from the static build: PAGES_BASE_PATH=/ai-support-assistant npm run build,
// then `node scripts/serve.mjs` in one terminal and `node scripts/screenshots.mjs` in another.
import { chromium, devices } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:4173/ai-support-assistant/";
const out = new URL("../docs/", import.meta.url).pathname;
const browser = await chromium.launch();

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark", ...opts });
  const p = await ctx.newPage();
  return p;
}
async function ask(p, text) {
  const box = p.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await box.press("Enter");
  await p.waitForTimeout(2500);
}

// Help center with the widget answering, sources and retrieval details.
let p = await page();
await p.goto(base);
await p.getByTestId("chat-launcher").waitFor();
if ((await p.getByTestId("chat-launcher").getAttribute("aria-expanded")) !== "true") await p.getByTestId("chat-launcher").click();
await p.getByLabel("Show retrieval details").check();
await ask(p, "can I get my money back if the tent is used?");
await p.screenshot({ path: `${out}widget.png` });

// Overview, inbox and the playground explaining a shorthand question.
for (const [path, file, setup] of [
  ["admin/", "overview.png"],
  ["admin/inbox/", "inbox.png"],
  ["admin/playground/", "playground.png", async () => {
    await p.getByLabel("Customer question").fill("hw do u send my order back pls");
    await p.waitForTimeout(800);
  }],
]) {
  await p.goto(base + path);
  await p.waitForTimeout(1500);
  if (setup) await setup();
  await p.screenshot({ path: `${out}${file}` });
}

// Phone: full-screen chat with an order card.
p = await page({ ...devices["iPhone 15"], colorScheme: "dark" });
await p.goto(base);
await p.getByTestId("chat-launcher").click();
await ask(p, "where is my order NF-20481?");
await p.screenshot({ path: `${out}mobile.png` });

await browser.close();
console.log("screenshots saved in docs/");
