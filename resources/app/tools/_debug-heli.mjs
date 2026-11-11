import { _electron as electron } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const app = await electron.launch({ args: ["."], cwd: root, timeout: 90000 });
const page = await app.firstWindow({ timeout: 60000 });
page.on("console", (m) => console.log("console:", m.text()));
try {
  await page.waitForFunction(() => !!window.__game && window.__game.phaseName !== "loading", null, { timeout: 45000 });
  await page.evaluate(() => window.__game.startRun(true));
  await wait(600);
  const info = await page.evaluate(() => {
    const g = window.__game;
    const root = g.vehicleRoots.find((r) => r.userData?.vehicle?.type === "heli");
    if (!root) return { error: "no heli" };
    root.updateWorldMatrix(true, false);
    const e = root.matrixWorld.elements;
    g.setPose(e[12] + 2.2, 0.4, e[14] + 2.2, 0);
    return {
      world: [e[12], e[13], e[14]],
      local: [root.position.x, root.position.y, root.position.z],
      player: [g.player.pos.x, g.player.pos.y, g.player.pos.z],
      vehicles: g.vehicleRoots.map((r) => ({ name: r.userData?.vehicle?.name, type: r.userData?.vehicle?.type, pos: r.position.toArray() })),
    };
  });
  console.log("info", JSON.stringify(info));
  await wait(500);
  const near = await page.evaluate(() => {
    const g = window.__game;
    const car = g.nearestVehicle();
    return {
      player: g.player.pos.toArray(),
      near: car ? { name: car.meta.name, dist: car.root.getWorldPosition(g.player.pos.clone()).distanceTo(g.player.pos) } : null,
    };
  });
  console.log("near", JSON.stringify(near));
  const direct = await page.evaluate(() => {
    const g = window.__game;
    const root = g.vehicleRoots.find((r) => r.userData?.vehicle?.type === "heli");
    g.enterVehicle(root);
    return { type: g.vehicle?.type, name: g.vehicle?.name, player: g.player.pos.toArray() };
  });
  console.log("direct", JSON.stringify(direct));
  await page.evaluate(() => window.__game.key("Space", true));
  await wait(1700);
  await page.evaluate(() => window.__game.key("Space", false));
  await wait(300);
  const fly = await page.evaluate(() => {
    const v = window.__game.vehicle;
    return v ? { type: v.type, alt: v.altitude, y: v.root.position.y, rotor: v.rotor?.rotation.y } : null;
  });
  console.log("fly", JSON.stringify(fly));
} finally {
  await app.close().catch(() => null);
}
