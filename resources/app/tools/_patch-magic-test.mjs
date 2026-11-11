import fs from "node:fs";

const file = "tools/survival-test.mjs";
let source = fs.readFileSync(file, "utf8");
const anchor = `  await page.evaluate(() => window.__game.setPose(-37.5, 0.4, -1.5, 0));`;
if (!source.includes(anchor)) throw new Error("magic test anchor missing");
const addition = `  // Magic: cast Mending Light, then confirm the spell strip reads the new spell.
  const magic = await page.evaluate(() => {
    const game = window.__game;
    game.magic.mana = 100;
    game.survival.stats.health = 50;
    game.survival.stats.bleeding = 1;
    game.magic.select("mending");
    const cast = game.castSpell();
    return {
      cast,
      ...game.spellInfo(),
      health: game.survival.stats.health,
      bleeding: game.survival.stats.bleeding,
    };
  });
  await wait(300);
  const spellHud = await page.evaluate(() => document.querySelector(".sv-spell b")?.textContent?.trim() || "");
  check(
    "spellcasting heals and spends mana",
    magic.cast && magic.health > 70 && magic.mana <= 66 && magic.bleeding === 0 && magic.cooldown > 0,
    \`\${magic.name} \${Math.round(magic.mana)}/\${magic.maxMana} mana, \${magic.health.toFixed(0)}hp, cd \${magic.cooldown.toFixed(1)}s\`,
  );
  check("spell strip shows the selected spell", spellHud.includes("MENDING"), spellHud || "missing");

`;
source = source.replace(anchor, addition + anchor);
fs.writeFileSync(file, source);
console.log("magic test added");
