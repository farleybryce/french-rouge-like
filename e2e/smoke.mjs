import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const content = JSON.parse(
  readFileSync(
    new URL("../src/content/encounters.json", import.meta.url),
    "utf8",
  ),
);
const verbs = JSON.parse(
  readFileSync(new URL("../src/content/verbs.json", import.meta.url), "utf8"),
);
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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base =
  process.env.SMOKE_URL || "http://localhost:4173/french-rouge-like/";
const idle = () =>
  page.waitForFunction(
    () => document.querySelector("#app")?.getAttribute("aria-busy") !== "true",
  );
const click = async (action) => {
  await idle();
  await page.locator(`[data-action="${action}"]`).last().click();
  await idle();
};
const data = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("le-donjon", 1);
        request.onsuccess = () => {
          const d = request.result,
            q = d.transaction("save").objectStore("save").get("current");
          q.onsuccess = () => {
            resolve(q.result);
            d.close();
          };
          q.onerror = () => reject(q.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
const run = async () => (await data()).run;
async function checkLayout(name) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${name}: no horizontal overflow`,
  );
  const small = await page
    .locator("button:not([disabled])")
    .evaluateAll((buttons) =>
      buttons
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && (r.width < 43.9 || r.height < 43.9);
        })
        .map((b) => ({
          text: b.textContent,
          width: b.getBoundingClientRect().width,
          height: b.getBoundingClientRect().height,
        })),
    );
  assert.deepEqual(small, [], `${name}: 44px touch buttons`);
  await page.screenshot({ path: `/tmp/le-donjon-${name}.png`, fullPage: true });
}
let checkedCombat = false,
  checkedGuided = false;
async function castSpell(id) {
  await click(`spell:${id}`);
  let r = await run();
  if (!checkedGuided) {
    const before = { hp: r.hp, mana: r.mana, turns: r.turns };
    await click("tile:0");
    await click("cast");
    r = await run();
    assert.deepEqual(
      { hp: r.hp, mana: r.mana, turns: r.turns },
      before,
      "Guided wrong answer is corrected safely",
    );
    await click("untile:0");
    await click("formula-help");
    checkedGuided = true;
  }
  r = await run();
  const c = r.challenge,
    spell = content.spells.find((s) => s.id === id),
    form = verbs.find((v) => v.id === spell.verbId).forms[c.person];
  const subject =
    c.person === 0 && /^[aeiouéèêh]/.test(form)
      ? "j’"
      : ["je", "tu", "il", "nous", "vous", "ils"][c.person];
  for (const text of [subject, form]) {
    r = await run();
    const i = r.challenge.tiles.indexOf(text);
    assert.ok(i >= 0);
    await click(`tile:${i}`);
  }
  if (!checkedCombat) {
    await checkLayout("expedition-combat");
    const snapshot = await run();
    await page.reload();
    await page.getByRole("button", { name: /Lancer le sort/ }).waitFor();
    assert.deepEqual(
      (await run()).challenge,
      snapshot.challenge,
      "Selected formula survives reload",
    );
    checkedCombat = true;
  }
  await click("cast");
}
async function use(id) {
  const button = page.locator(`[data-action="item:${id}"]`);
  if (!(await button.count())) await click("bag-toggle");
  await click(`item:${id}`);
}
async function fight() {
  for (let turn = 0; turn < 60; turn++) {
    const r = await run();
    assert.equal(r.status, "playing", `Survival, floor ${r.floor}`);
    const e = r.rooms.find((room) => room.x === r.x && room.y === r.y)?.enemy;
    if (!e || e.hp <= 0) return;
    const strike = 3 + (r.relics.includes("ember") ? 1 : 0);
    if (e.hp <= strike) {
      await castSpell("strike");
      continue;
    }
    if (e.hp <= 8 && r.bombs > 0) {
      await use("bomb");
      continue;
    }
    if (r.mana > 0) {
      await castSpell("shield");
      continue;
    }
    if (r.ether > 0) {
      await use("ether");
      continue;
    }
    if (r.hp < 8 && r.potions > 0) {
      await use("potion");
      continue;
    }
    await castSpell("strike");
  }
  throw new Error("Combat did not finish");
}
function path(r, x, y) {
  const queue = [[[r.x, r.y]]],
    seen = new Set([`${r.x},${r.y}`]);
  while (queue.length) {
    const route = queue.shift(),
      [cx, cy] = route.at(-1);
    if (cx === x && cy === y) return route.slice(1);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
    ]) {
      const nx = cx + dx,
        ny = cy + dy,
        key = `${nx},${ny}`;
      if (r.layout[ny]?.[nx] === "." && !seen.has(key)) {
        seen.add(key);
        queue.push([...route, [nx, ny]]);
      }
    }
  }
  throw new Error("Unreachable room");
}
async function walk(x, y) {
  for (let i = 0; i < 60; i++) {
    await fight();
    let r = await run();
    if (r.x === x && r.y === y) return;
    if (r.hp <= 12 && r.potions > 0) await use("potion");
    r = await run();
    if (r.mana <= 2 && r.ether > 0) await use("ether");
    r = await run();
    const [nx, ny] = path(r, x, y)[0];
    await click(`move:${nx - r.x}:${ny - r.y}`);
  }
  throw new Error("Navigation did not finish");
}
try {
  await page.goto(base);
  await page.getByRole("heading", { name: /Trois étages/ }).waitFor();
  await checkLayout("expedition-start");
  const manifest = await (
    await page.request.get(base + "manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  await click("kit:mirror");
  await click("start");
  await checkLayout("expedition-map");
  for (let floor = 1; floor <= 3; floor++) {
    let r = await run();
    assert.equal(r.floor, floor);
    // Explore rewards and supplies through actual movement; combat on the route is resolved normally.
    for (const type of ["treasure", "npc", "merchant", "camp"]) {
      r = await run();
      const room = r.rooms.find((room) => room.type === type);
      await walk(room.x, room.y);
      r = await run();
      if (type === "treasure") {
        const actions = await page
          .locator('[data-action^="reward:"]')
          .evaluateAll((bs) => bs.map((b) => b.dataset.action));
        const preferred =
          ["reward:ember", "reward:reservoir", "reward:flask"].find((id) =>
            actions.includes(id),
          ) ?? actions[0];
        await click(preferred);
      }
      if (type === "npc") {
        await click("translate-npc");
        await page.getByText(/The blue potion heals/).waitFor();
        await click("npc:blue");
      }
      if (type === "merchant") {
        if (r.gold >= 8) await click("buy:ether");
        await click("dismiss-room");
      }
      if (type === "camp") {
        if (r.mana < r.maxMana) await click("rest:mana");
        else if (r.hp < r.maxHp) await click("rest:health");
        else await click("dismiss-room");
      }
    }
    r = await run();
    const gate = r.rooms.find(
      (room) => room.type === (floor === 3 ? "boss" : "gate"),
    );
    await walk(gate.x, gate.y);
    await fight();
    r = await run();
    assert.equal(r.hp > 0, true);
    await click("read-door");
    await click("translate-door");
    await checkLayout(`expedition-floor-${floor}`);
    const resources = {
      hp: r.hp,
      mana: r.mana,
      gold: r.gold,
      relics: r.relics,
    };
    await click(`door:${r.exitSide}`);
    const after = await run();
    if (floor < 3) {
      assert.equal(after.floor, floor + 1);
      assert.equal(after.hp, resources.hp);
      assert.equal(after.mana, resources.mana);
      assert.equal(after.gold, resources.gold);
      assert.deepEqual(after.relics, resources.relics);
    }
  }
  await page.getByRole("heading", { name: "L’aube vous attend." }).waitFor();
  await checkLayout("expedition-victory");
  assert.equal((await data()).history[0].won, true);
  await click("settings");
  await checkLayout("expedition-settings");
  const downloadPromise = page.waitForEvent("download");
  await click("export");
  const download = await downloadPromise;
  await download.saveAs("/tmp/le-donjon-v2.json");
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await page.getByText(/Import refusé/).waitFor();
  await idle();
  await click("dismiss-notice");
  await page.locator("#import").setInputFiles("/tmp/le-donjon-v2.json");
  await page.getByText(/Carnet importé/).waitFor();
  await idle();
  await click("dismiss-notice");
  await click("new-run");
  await click("kit:frost");
  await click("start");
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Service worker timeout")), 15000),
      ),
    ]);
  });
  await page.reload();
  await page.locator(".dungeon").waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.locator(".dungeon").waitFor();
  let r = await run();
  const target = r.rooms.find((room) => room.type === "treasure");
  const [nx, ny] = path(r, target.x, target.y)[0];
  await click(`move:${nx - r.x}:${ny - r.y}`);
  await context.setOffline(false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await checkLayout("expedition-desktop");
  // Import a real v1 file through the public backup UI and verify its learner survives.
  await click("settings");
  await page
    .locator("#import")
    .setInputFiles(
      new URL("../tests/fixtures/v1.json", import.meta.url).pathname,
    );
  await page.getByText(/Carnet importé/).waitFor();
  await idle();
  assert.equal((await data()).learner.items.porte.understood, 2);
  assert.equal((await data()).version, 2);
  assert.equal((await data()).run, null);
  // A lethal tactical retreat really ends the character, then a new run keeps knowledge.
  await click("dismiss-notice");
  await click("kit:blood");
  await click("start");
  let doomed = await run();
  const victim = doomed.rooms.find((room) => room.type === "enemy");
  for (let step = 0; step < 40; step++) {
    doomed = await run();
    if (
      doomed.rooms.some(
        (room) =>
          room.x === doomed.x && room.y === doomed.y && room.enemy?.hp > 0,
      )
    )
      break;
    const [x, y] = path(doomed, victim.x, victim.y)[0];
    await click(`move:${x - doomed.x}:${y - doomed.y}`);
  }
  for (let retreat = 0; retreat < 10; retreat++) {
    doomed = await run();
    const enemyPosition = [doomed.x, doomed.y];
    await click("retreat");
    doomed = await run();
    if (doomed.status === "dead") break;
    await click(
      `move:${enemyPosition[0] - doomed.x}:${enemyPosition[1] - doomed.y}`,
    );
  }
  await page
    .getByRole("heading", { name: "Une vie s’éteint. Les mots restent." })
    .waitFor();
  assert.equal((await data()).learner.items.porte.understood, 2);
  await click("new-run");
  await click("kit:frost");
  await click("start");
  assert.equal((await run()).hp, 18);
  assert.deepEqual((await run()).relics, ["frost"]);
  assert.equal((await data()).learner.items.porte.understood, 2);
  // Simulate an existing player's pre-update IndexedDB, separate from the run above.
  const oldContext = await browser.newContext();
  const oldPage = await oldContext.newPage();
  oldPage.on("pageerror", (error) => errors.push(error.message));
  await oldPage.goto(base + "icon.svg");
  const oldSave = JSON.parse(
    readFileSync(new URL("../tests/fixtures/v1.json", import.meta.url), "utf8"),
  );
  await oldPage.evaluate(
    (original) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("le-donjon", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("save");
        request.onsuccess = () => {
          const d = request.result;
          const tx = d.transaction("save", "readwrite");
          tx.objectStore("save").put(original, "current");
          tx.oncomplete = () => {
            d.close();
            resolve(true);
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    oldSave,
  );
  await oldPage.goto(base);
  await oldPage.getByRole("heading", { name: /Trois étages/ }).waitFor();
  await oldPage.locator('[data-action="settings"]').first().click();
  await oldPage.locator('[data-action="legacy-export"]').waitFor();
  await oldPage.waitForFunction(
    () => document.querySelector("#app").getAttribute("aria-busy") !== "true",
  );
  const originalDownload = oldPage.waitForEvent("download");
  await oldPage.locator('[data-action="legacy-export"]').click();
  await (await originalDownload).saveAs("/tmp/le-donjon-original-v1.json");
  assert.deepEqual(
    JSON.parse(readFileSync("/tmp/le-donjon-original-v1.json", "utf8")),
    oldSave,
  );
  await oldContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full three-floor expedition, tactical combat, safe guided correction, free translations, resources carried across floors, victory, resume, import/export, v1 import/automatic upgrade and original backup, permadeath/restart, offline play, 375px/desktop layout and 44px buttons.",
  );
} catch (error) {
  await page
    .screenshot({
      path: "/tmp/le-donjon-expedition-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
