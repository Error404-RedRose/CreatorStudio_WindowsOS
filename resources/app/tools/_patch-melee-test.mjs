import fs from "node:fs";

const file = "tools/survival-test.mjs";
let source = fs.readFileSync(file, "utf8");
const anchor = `  await page.evaluate(() => window.__game.setPose(-37.5, 0.4, -1.5, 0));`;
if (!source.includes(anchor)) throw new Error("melee test anchor missing");
const addition = `  // Directional katana attacks and the guard parry window.
  const melee = await page.evaluate(() => {
    const game = window.__game;
    game.weapon.switchTo("katana");
    game.onWeaponChanged();
    game.input.inject("KeyA", true);
    game.meleeAttack();
    game.input.inject("KeyA", false);
    return game.meleeInfo();
  });
  check("directional katana attacks", melee.direction === "slash-left", melee.direction);

  const parry = await page.evaluate(() => {
    const game = window.__game;
    game.survival.stats.health = 100;
    game.input.inject("Mouse2", true);
    game.guardStartedAt = game.now;
    const before = game.survival.stats.health;
    game.damagePlayer(30, game.player.pos, false);
    const after = game.survival.stats.health;
    game.input.inject("Mouse2", false);
    return { before, after, ...game.meleeInfo() };
  });
  check(
    "guard window parries a hit",
    parry.after === parry.before && parry.parries >= 1,
    \`hp \${parry.before}->\${parry.after}, parries \${parry.parries}\`,
  );

`;
source = source.replace(anchor, addition + anchor);
fs.writeFileSync(file, source);
console.log("melee tests added");
