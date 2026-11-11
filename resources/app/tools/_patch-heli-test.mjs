import fs from "node:fs";

const file = "tools/survival-test.mjs";
let source = fs.readFileSync(file, "utf8");
const anchor = `  // Find a real loot container and stand next to it.`;
if (!source.includes(anchor)) throw new Error("heli test anchor missing");
const addition = `  // County helicopter: lift off, hover and land.
  const heliRoot = await page.evaluate(() => {
    const game = window.__game;
    const root = game.vehicleRoots.find((entry) => entry.parent && entry.userData?.vehicle?.type === "heli");
    if (!root) return null;
    root.updateWorldMatrix(true, false);
    const elements = root.matrixWorld.elements;
    return { x: elements[12], z: elements[14], name: root.userData.vehicle.name };
  });
  check("a county helicopter is parked in town", Boolean(heliRoot), heliRoot?.name || "none");
  if (heliRoot) {
    await page.evaluate((spot) => window.__game.setPose(spot.x + 2.2, 0.4, spot.z + 2.2, 0), heliRoot);
    await wait(350);
    await press("KeyE");
    await wait(500);
    const boarded = await page.evaluate(() => window.__game.vehicle?.type || "none");
    check("can board the helicopter", boarded === "heli", boarded);

    await page.evaluate(() => window.__game.key("Space", true));
    await wait(1700);
    await page.evaluate(() => window.__game.key("Space", false));
    await wait(300);
    const lifted = await page.evaluate(() => {
      const vehicle = window.__game.vehicle;
      return vehicle
        ? {
            altitude: vehicle.altitude,
            y: vehicle.root.position.y,
            rotor: vehicle.rotor?.rotation.y ?? 0,
            hud: document.querySelector(".sv-vehicle")?.textContent || "",
          }
        : null;
    });
    check(
      "helicopter lifts off",
      Boolean(lifted) && lifted.altitude > 1 && lifted.y > 1 && lifted.rotor > 0,
      lifted ? \`\${lifted.altitude.toFixed(1)}m alt, hud \${lifted.hud}\` : "none",
    );

    await press("KeyE");
    await wait(300);
    const midair = await page.evaluate(() => Boolean(window.__game.vehicle));
    check("cannot leave a helicopter midair", midair);

    await page.evaluate(() => {
      const game = window.__game;
      if (game.vehicle) {
        game.vehicle.altitude = 0;
        game.vehicle.lift = 0;
        game.vehicle.root.position.y = 0;
      }
    });
    await wait(300);
    await press("KeyE");
    await wait(500);
    const landed = await page.evaluate(() => window.__game.vehicle === null);
    check("can land and leave the helicopter", landed);
  }

`;
source = source.replace(anchor, addition + anchor);
fs.writeFileSync(file, source);
console.log("heli test added");
