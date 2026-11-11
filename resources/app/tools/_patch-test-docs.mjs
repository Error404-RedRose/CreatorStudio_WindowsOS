import fs from "node:fs";

function edit(file, pairs) {
  let source = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (!source.includes(from)) throw new Error(`missing anchor in ${file}: ${from.slice(0, 80)}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(file, source);
  console.log(`${file}: ${pairs.length} edits`);
}

edit("tools/survival-test.mjs", [
  [
    '  await page.evaluate(() => window.__game.setPose(720, 1, 720, 0));\n  await wait(4500);',
    '  await page.evaluate(() => {\n    const game = window.__game;\n    if (game.vehicle) game.exitVehicle(true);\n    game.setPose(720, 1, 720, 0);\n  });\n  await wait(1200);\n  await page\n    .waitForFunction(() => window.__game.survivalInfo().chunks.some((key) => key.startsWith("11,")), null, { timeout: 12000 })\n    .catch(() => null);\n  await wait(600);',
  ],
]);

edit("README.md", [
  [
    "- aiming down sights and switching the full weapon loadout,",
    "- aiming down sights and switching the full weapon loadout,\n- spellcasting, mana spend and the spell strip, directional katana attacks and guard parry,",
  ],
  [
    "- vehicle fuel/repair kits and the dirt kart,",
    "- vehicle fuel/repair kits, the dirt kart and helicopter lift/landing,",
  ],
  [
    "- safehouse claim, bed/workbench construction, sleep,",
    "- safehouse claim, generated-house claim, bed/workbench construction, sleep,",
  ],
]);
