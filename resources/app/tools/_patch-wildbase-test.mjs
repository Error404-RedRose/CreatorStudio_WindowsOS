import fs from "node:fs";

const file = "tools/survival-test.mjs";
let source = fs.readFileSync(file, "utf8");
const anchor = `      \`day \${reborn.info.day} \${reborn.health.toFixed(0)}hp\`,
    );
`;
if (!source.includes(anchor)) throw new Error("reborn anchor missing");
const addition = `
    // Generated houses can be claimed as the new base.
    await page2.evaluate(() => window.__game.setPose(720, 1, 720, 0));
    await wait(4500);
    const wildBase = await page2.evaluate(() => {
      const game = window.__game;
      const candidates = game.survivalInfo().baseSites.filter((site) => site.id !== "home");
      if (!candidates.length) return null;
      const candidate = candidates[0];
      const site = game.baseSites.find((entry) => entry.id === candidate.id);
      if (!site) return null;
      game.setPose(site.spawn[0], site.spawn[1] + 0.2, site.spawn[2], 0);
      game.claimBaseSite(site);
      return { id: game.survival.baseSite?.id, name: game.survival.baseName, siteId: site.id, count: candidates.length };
    });
    check(
      "generated houses can be claimed as a base",
      Boolean(wildBase) && wildBase.id === wildBase.siteId,
      wildBase ? \`\${wildBase.name} (\${wildBase.count} sites)\` : "no wild base sites",
    );
`;
source = source.replace(anchor, anchor + addition);
fs.writeFileSync(file, source);
console.log("wild base test added");
