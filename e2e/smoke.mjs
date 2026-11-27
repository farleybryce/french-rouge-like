import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const idle = () =>
  page.waitForFunction(
    () => document.querySelector("#app")?.getAttribute("aria-busy") !== "true",
  );
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://localhost:4173/french-rouge-like/";
const click = async (action) => {
  await idle();
  await page.locator(`[data-action="${action}"]`).last().click();
  await idle();
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "No horizontal overflow at 375px",
  );
try {
  await page.goto(base);
  const iconResponse = await page.request.get(
    new URL(await page.locator('link[rel="icon"]').getAttribute("href"), base)
      .href,
  );
  assert.match(iconResponse.headers()["content-type"], /image\/svg/);
  const manifest = await (
    await page.request.get(base + "manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  await page.getByRole("heading", { name: /Les murs ont/ }).waitFor();
  await noOverflow();
  await page.screenshot({ path: "/tmp/le-donjon-welcome.png", fullPage: true });
  await click("start");
  await click("move:0:-1");
  await page.getByRole("heading", { name: "Éloi, le veilleur" }).waitFor();
  await click("gloss:bleue");
  await page.getByRole("status").filter({ hasText: "blue" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Éloi, le veilleur" }).waitFor();
  assert.match(await page.locator(".statusbar").innerText(), /3\s+lueurs/);
  await click("reply:stay");
  await page.getByText(/Pour toujours \?/).waitFor();
  await click("reply:help");
  await click("move:-1:0");
  await click("move:-1:0");
  await click("move:0:-1");
  await click("potion:blue");
  await click("move:0:-1");
  await click("move:1:0");
  await click("move:1:0");
  await page.getByRole("heading", { name: "Le gardien spectral" }).waitFor();
  await noOverflow();
  await page.screenshot({ path: "/tmp/le-donjon-combat.png", fullPage: true });
  const forms = {
    je: "suis",
    tu: "es",
    il: "est",
    nous: "sommes",
    vous: "êtes",
    ils: "sont",
  };
  for (let n = 0; n < 6; n++) {
    await click("spell:shield");
    const prompt = await page.locator(".spell-prompt h3").innerText();
    const subject = prompt.split(" ")[0];
    const bank = page.locator(".tile-bank");
    await bank.getByRole("button", { name: subject, exact: true }).click();
    await bank
      .getByRole("button", { name: forms[subject], exact: true })
      .click();
    if (n === 0) {
      await noOverflow();
      const tooSmall = await page
        .locator("button:not([disabled])")
        .evaluateAll((bs) =>
          bs
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width < 44 || r.height < 44;
            })
            .map((b) => [
              b.textContent,
              b.getBoundingClientRect().width,
              b.getBoundingClientRect().height,
            ]),
        );
      assert.deepEqual(tooSmall, [], "All active buttons have 44px targets");
      await page.screenshot({
        path: "/tmp/le-donjon-tiles.png",
        fullPage: true,
      });
    }
    await click("cast");
  }
  await page.getByRole("heading", { name: "Trouvez la sortie." }).waitFor();
  await click("move:1:0");
  await click("move:0:-1");
  await click("reveal-door");
  const line = await page.locator("blockquote").innerText();
  await click(`door:${line.includes("droite") ? "right" : "left"}`);
  await page.getByRole("heading", { name: "L’aube vous attend." }).waitFor();
  await noOverflow();
  await page.screenshot({ path: "/tmp/le-donjon-debrief.png", fullPage: true });
  await click("settings");
  await noOverflow();
  await page.screenshot({
    path: "/tmp/le-donjon-settings.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await click("export");
  const download = await downloadPromise;
  await download.saveAs("/tmp/le-donjon-save.json");
  await page.locator("#import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await page.getByText(/Import refusé/).waitFor();
  await click("dismiss");
  await page.locator("#import").setInputFiles("/tmp/le-donjon-save.json");
  await page.getByText(/Carnet importé/).waitFor();
  await click("dismiss");
  await click("start");
  await click("move:0:-1");
  // Service worker controls this production build before network is disabled.
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Service worker did not become ready")),
          15000,
        ),
      ),
    ]);
  });
  await page.reload();
  await page.getByRole("heading", { name: "Éloi, le veilleur" }).waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Éloi, le veilleur" }).waitFor();
  await click("reply:help");
  await context.setOffline(false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await noOverflow();
  await page.screenshot({ path: "/tmp/le-donjon-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 375px layout, 44px buttons, hint persistence, dialogue recovery, combat, victory/debrief, JSON export/import, offline reload and play, desktop, no browser errors.",
  );
} catch (error) {
  await page
    .screenshot({ path: "/tmp/le-donjon-failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
